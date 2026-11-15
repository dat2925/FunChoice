use crate::{
    db::{self, Question, Result},
    Data,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::Serialize;
use std::collections::HashSet;
use tauri::State;
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Exam {
    id: String,
    pub(crate) title: String,
    pub(crate) questions: Vec<Question>,
    updated_at: String,
}

fn read(row: &Row) -> rusqlite::Result<Exam> {
    let json: String = row.get(2)?;
    let questions = serde_json::from_str(&json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(2, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(Exam {
        id: row.get(0)?,
        title: row.get(1)?,
        questions,
        updated_at: row.get(3)?,
    })
}

pub(crate) fn list(db: &Connection, class: Option<&str>) -> Result<Vec<Exam>> {
    db::collect(
        db,
        "SELECT id,title,questions,updated_at FROM exams
        WHERE (?1 IS NULL OR classroom_id=?1) ORDER BY updated_at DESC, rowid DESC",
        [class],
        read,
    )
}

pub(crate) fn find(db: &Connection, class: &str, id: &str) -> Result<Exam> {
    db.query_row(
        "SELECT id,title,questions,updated_at FROM exams WHERE classroom_id=?1 AND id=?2",
        params![class, id],
        read,
    )
    .optional()
    .map_err(db::storage)?
    .ok_or_else(|| "Không tìm thấy đề thi của lớp này.".into())
}

fn save(
    db: &mut Connection,
    class: &str,
    id: Option<&str>,
    title: &str,
    question_ids: &[String],
) -> Result<Exam> {
    let title = db::clean(title, 120)?;
    let unique = question_ids.iter().collect::<HashSet<_>>();
    if question_ids.is_empty() || unique.len() != question_ids.len() {
        return Err("Hãy chọn ít nhất một câu hỏi và không thêm trùng câu.".into());
    }
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db::storage)?;
    let bank = db::question_plan(&tx, class)?.bank;
    let previous = if let Some(id) = id {
        let record = tx
            .query_row(
                "SELECT id,title,questions,updated_at FROM exams WHERE id=?1 AND classroom_id=?2",
                params![id, class],
                read,
            )
            .optional()
            .map_err(db::storage)?
            .ok_or("Không tìm thấy đề thi của lớp này.")?;
        record.questions
    } else {
        Vec::new()
    };
    // Keep a saved paper intact when its source question is edited or removed.
    let questions: Vec<_> = question_ids
        .iter()
        .map(|id| {
            previous
                .iter()
                .chain(&bank)
                .find(|question| &question.id == id)
                .cloned()
                .ok_or_else(|| "Có câu hỏi không còn trong ngân hàng của lớp.".to_owned())
        })
        .collect::<Result<_>>()?;
    let json =
        serde_json::to_string(&questions).map_err(|_| "Không thể lưu câu hỏi của đề thi.")?;
    let exam_id = id
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let updated_at = tx.query_row(
        "INSERT INTO exams (id,classroom_id,title,questions) VALUES (?1,?2,?3,?4)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, questions=excluded.questions, updated_at=excluded.updated_at
        RETURNING updated_at",
        params![exam_id, class, title, json], |row| row.get(0),
    ).map_err(db::storage)?;
    tx.commit().map_err(db::storage)?;
    Ok(Exam {
        id: exam_id,
        title,
        questions,
        updated_at,
    })
}

fn delete(db: &Connection, class: &str, id: &str) -> Result<()> {
    let changed = db
        .execute(
            "DELETE FROM exams WHERE id=?1 AND classroom_id=?2",
            params![id, class],
        )
        .map_err(db::storage)?;
    if changed == 0 {
        return Err("Không tìm thấy đề thi của lớp này.".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_exams(data: State<Data>, classroom_id: String) -> Result<Vec<Exam>> {
    data.access(|db| list(db, Some(&classroom_id)))
}

#[tauri::command]
pub(crate) fn save_exam(
    data: State<Data>,
    classroom_id: String,
    id: Option<String>,
    title: String,
    question_ids: Vec<String>,
) -> Result<Exam> {
    data.access(|db| save(db, &classroom_id, id.as_deref(), &title, &question_ids))
}

#[tauri::command]
pub(crate) fn delete_exam(data: State<Data>, classroom_id: String, id: String) -> Result<()> {
    data.access(|db| delete(db, &classroom_id, &id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn papers_preserve_order_and_snapshots_through_bank_changes_and_backup() {
        let folder = tempfile::tempdir().unwrap();
        let mut db = db::open(&folder.path().join("classroom.sqlite")).unwrap();
        let school = db::save_school(&db, None, "Hoa Sen", None).unwrap();
        let a = db::save_classroom(&db, &school, None, "5A").unwrap();
        let b = db::save_classroom(&db, &school, None, "5B").unwrap();
        let plan = serde_json::from_value(serde_json::json!({"bank":[
            {"id":"a","text":"Hai cộng hai bằng bao nhiêu?", "answer": "Bằng bốn."},
            {"id":"b","text":"Số nào chia hết cho hai?", "answer":null,"options":["2","3"],"correctOptions":[0]}
        ],"turns":["a"]})).unwrap();
        db::save_question_plan(&mut db, &a, plan).unwrap();
        let ids = ["b".into(), "a".into()];
        assert!(save(&mut db, &b, None, "Đề sai lớp", &ids).is_err());
        assert!(save(&mut db, &a, None, "Đề trùng", &["a".into(), "a".into()]).is_err());
        let exam = save(&mut db, &a, None, "Đề số 1", &ids).unwrap();
        assert_eq!(exam.questions[0].id, "b");
        assert_eq!(exam.questions[0].correct_options, [0]);
        assert!(list(&db, Some(&b)).unwrap().is_empty());
        let edited_bank = serde_json::from_value(serde_json::json!({"bank":[
            {"id":"a","text":"Câu đã sửa", "answer":null}
        ],"turns":["a"]}))
        .unwrap();
        db::save_question_plan(&mut db, &a, edited_bank).unwrap();
        let reordered = save(
            &mut db,
            &a,
            Some(&exam.id),
            "Đề ôn tập",
            &["a".into(), "b".into()],
        )
        .unwrap();
        assert_eq!(reordered.questions[0].text, "Hai cộng hai bằng bao nhiêu?");
        assert_eq!(reordered.questions[1].id, "b");
        assert_eq!(
            db::question_plan(&db, &a).unwrap().bank[0].text,
            "Câu đã sửa"
        );
        assert!(delete(&db, &b, &exam.id).is_err());
        let backup = folder.path().join("backup.sqlite");
        db::backup(&db, &backup).unwrap();
        let mut restored = db::open(&folder.path().join("restored.sqlite")).unwrap();
        db::restore(&mut restored, &backup, false).unwrap();
        let papers = list(&restored, Some(&a)).unwrap();
        assert_eq!(papers[0].title, "Đề ôn tập");
        assert_eq!(papers[0].questions[0].answer.as_deref(), Some("Bằng bốn."));
        delete(&restored, &a, &exam.id).unwrap();
        assert!(list(&restored, Some(&a)).unwrap().is_empty());
        assert_eq!(db::question_plan(&restored, &a).unwrap().bank.len(), 1);
    }
}
