use crate::{
    db::{self, Music, Question, Result, Session, Settings},
    escape_room::{self, Config, EscapeSession},
    exams, Data,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use tauri::State;
use uuid::Uuid;

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RelaySettings {
    names: Vec<String>,
    assignments: HashMap<String, usize>,
    rounds: Option<usize>,
}

#[derive(Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Game {
    Meteor { settings: Settings },
    Relay { settings: RelaySettings },
    Escape { settings: Config },
}

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Source {
    Default,
    Bank,
    Questions {
        question_ids: Vec<String>,
        #[serde(default)]
        exam_id: Option<String>,
    },
    Exam {
        exam_id: String,
        #[serde(default)]
        question_ids: Option<Vec<String>>,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PresetInput {
    title: String,
    game: Game,
    question_source: Option<Source>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Preset {
    id: String,
    title: String,
    game: Game,
    source_label: String,
    questions: Vec<Question>,
}

const FIELDS: &str = "p.id,p.title,p.game,p.source_label,p.questions";
const CLASSROOM: &str = "JOIN classrooms c ON c.id=p.classroom_id
    JOIN schools s ON s.id=c.school_id WHERE c.deleted=0 AND s.deleted=0";

fn parse<T: DeserializeOwned>(row: &Row, column: usize) -> rusqlite::Result<T> {
    let json: String = row.get(column)?;
    serde_json::from_str(&json).map_err(|cause| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(cause),
        )
    })
}

fn read(row: &Row) -> rusqlite::Result<Preset> {
    Ok(Preset {
        id: row.get(0)?,
        title: row.get(1)?,
        game: parse(row, 2)?,
        source_label: row.get(3)?,
        questions: parse(row, 4)?,
    })
}

pub(crate) fn list(db: &Connection, class: Option<&str>) -> Result<Vec<Preset>> {
    db::collect(
        db,
        &format!(
            "SELECT {FIELDS} FROM game_presets p {CLASSROOM}
            AND (?1 IS NULL OR p.classroom_id=?1) ORDER BY p.updated_at DESC,p.rowid DESC"
        ),
        [class],
        read,
    )
}

fn find(db: &Connection, class: &str, id: &str) -> Result<Preset> {
    db.query_row(
        &format!(
            "SELECT {FIELDS} FROM game_presets p {CLASSROOM}
            AND p.classroom_id=?1 AND p.id=?2"
        ),
        params![class, id],
        read,
    )
    .optional()
    .map_err(db::storage)?
    .ok_or_else(|| "Không tìm thấy cấu hình đã lưu của lớp này.".into())
}

fn select_questions(source: Vec<Question>, ids: &[String]) -> Result<Vec<Question>> {
    let unique: HashSet<_> = ids.iter().collect();
    if unique.is_empty() || unique.len() != ids.len() {
        return Err("Hãy chọn ít nhất một câu và mỗi câu chỉ chọn một lần.".into());
    }
    let index: HashMap<_, _> = source.into_iter().map(|q| (q.id.clone(), q)).collect();
    ids.iter()
        .map(|id| {
            index
                .get(id)
                .cloned()
                .ok_or_else(|| "Có câu hỏi không còn trong nguồn đã chọn.".into())
        })
        .collect()
}

fn save(
    db: &mut Connection,
    class: &str,
    id: Option<&str>,
    input: PresetInput,
    pro: bool,
) -> Result<Preset> {
    let title = db::clean(&input.title, 80)?;
    let mut game = input.game;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db::storage)?;
    let bank = db::question_plan(&tx, class)?.bank;
    let previous = id.map(|id| find(&tx, class, id)).transpose()?;
    let (source_label, questions) = match input.question_source {
        None => {
            let previous = previous.ok_or("Hãy chọn nguồn câu hỏi cho cấu hình.")?;
            if std::mem::discriminant(&game) != std::mem::discriminant(&previous.game) {
                return Err("Hãy chọn nguồn câu hỏi cho trò chơi mới.".into());
            }
            (previous.source_label, previous.questions)
        }
        Some(Source::Default) => (
            match game {
                Game::Meteor { .. } => "Không dùng câu hỏi",
                Game::Escape { .. } => "Câu hỏi mẫu",
                Game::Relay { .. } => return Err("Tiếp sức cần ít nhất một câu hỏi.".into()),
            }
            .into(),
            Vec::new(),
        ),
        Some(Source::Bank) => {
            if bank.is_empty() {
                return Err("Ngân hàng câu hỏi của lớp đang trống.".into());
            }
            ("Ngân hàng câu hỏi".into(), bank)
        }
        Some(Source::Questions {
            question_ids,
            exam_id,
        }) => {
            let (label, source) = if let Some(id) = exam_id {
                let exam = exams::find(&tx, class, &id)?;
                (format!("Đề thi · {}", exam.title), exam.questions)
            } else {
                ("Câu hỏi được chọn".into(), bank)
            };
            (label, select_questions(source, &question_ids)?)
        }
        Some(Source::Exam {
            exam_id,
            question_ids,
        }) => {
            let exam = exams::find(&tx, class, &exam_id)?;
            let questions = match question_ids {
                Some(ids) => select_questions(exam.questions, &ids)?,
                None => exam.questions,
            };
            (format!("Đề thi · {}", exam.title), questions)
        }
    };
    match &mut game {
        Game::Meteor { settings } => {
            settings.validate()?;
            settings.check_license(pro)?;
            settings.with_questions = !questions.is_empty();
            settings.questions.clear();
        }
        Game::Relay { settings } => {
            if questions.is_empty() {
                return Err("Tiếp sức cần ít nhất một câu hỏi.".into());
            }
            let teams = settings.names.len();
            if !(2..=6).contains(&teams)
                || settings.rounds.is_some_and(|r| {
                    r == 0
                        || r.checked_mul(teams)
                            .is_none_or(|total| total as u64 > 9_007_199_254_740_991)
                })
                || settings.assignments.values().any(|&team| team >= teams)
            {
                return Err("Hãy kiểm tra số đội, số vòng và danh sách chia đội.".into());
            }
            for name in &mut settings.names {
                *name = db::clean(name, 60)?;
            }
        }
        Game::Escape { settings } => {
            if !questions.is_empty() && questions.len() < settings.question_count.unwrap_or(3) {
                return Err(
                    "Nguồn câu hỏi phải đủ số vị trí đã chọn (3–10 câu) hoặc dùng câu hỏi mẫu."
                        .into(),
                );
            }
            settings.prepare_preset(&title)?;
        }
    }
    let id = id
        .map(str::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let game_json =
        serde_json::to_string(&game).map_err(|_| "Không thể lưu thiết lập trò chơi.")?;
    let question_json =
        serde_json::to_string(&questions).map_err(|_| "Không thể lưu câu hỏi của cấu hình.")?;
    tx.execute(
        "INSERT INTO game_presets(id,classroom_id,title,game,source_label,questions) VALUES (?1,?2,?3,?4,?5,?6)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title,game=excluded.game,source_label=excluded.source_label,
         questions=excluded.questions,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![id, class, title, game_json, source_label, question_json],
    ).map_err(db::storage)?;
    tx.commit().map_err(db::storage)?;
    Ok(Preset {
        id,
        title,
        game,
        source_label,
        questions,
    })
}

#[tauri::command]
pub(crate) fn list_game_presets(data: State<Data>, classroom_id: String) -> Result<Vec<Preset>> {
    data.access(|db| list(db, Some(&classroom_id)))
}

#[tauri::command]
pub(crate) fn save_game_preset(
    data: State<Data>,
    classroom_id: String,
    id: Option<String>,
    input: PresetInput,
) -> Result<Preset> {
    data.licensed(|db, pro| save(db, &classroom_id, id.as_deref(), input, pro))
}

#[tauri::command]
pub(crate) fn delete_game_preset(
    data: State<Data>,
    classroom_id: String,
    id: String,
) -> Result<()> {
    data.access(|db| {
        find(db, &classroom_id, &id)?;
        db.execute(
            "DELETE FROM game_presets WHERE id=?1 AND classroom_id=?2",
            params![id, classroom_id],
        )
        .map_err(db::storage)?;
        Ok(())
    })
}

#[tauri::command]
pub(crate) fn start_meteor_preset(
    data: State<Data>,
    classroom_id: String,
    id: String,
) -> Result<Session> {
    data.licensed(|db, pro| {
        let preset = find(db, &classroom_id, &id)?;
        let Game::Meteor { settings } = preset.game else {
            return Err("Cấu hình này không phải Thiên thạch.".into());
        };
        settings.check_license(pro)?;
        if settings.music == Music::Mp3 && !data.music_path.is_file() {
            return Err("Hãy chọn một tệp MP3 trong phần cấu hình.".into());
        }
        db::start_with_questions(db, &classroom_id, settings, Some(&preset.questions))
    })
}

#[tauri::command]
pub(crate) fn start_escape_preset(
    data: State<Data>,
    classroom_id: String,
    id: String,
) -> Result<EscapeSession> {
    data.access(|db| {
        let preset = find(db, &classroom_id, &id)?;
        let Game::Escape { settings } = preset.game else {
            return Err("Cấu hình này không phải Căn phòng bí ẩn.".into());
        };
        let selected = if preset.questions.is_empty() {
            None
        } else {
            Some(preset.questions)
        };
        escape_room::start_with_questions(db, &classroom_id, settings, selected)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn input(value: Value) -> PresetInput {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn selected_exam_questions_keep_order_and_reject_other_sources() {
        let folder = tempfile::tempdir().unwrap();
        let mut db = db::open(&folder.path().join("subset.sqlite")).unwrap();
        let school = db::save_school(&db, None, "Hoa Sen", None).unwrap();
        let class = db::save_classroom(&db, &school, None, "5A").unwrap();
        let questions = json!([
            {"id":"a","text":"Bản gốc trong đề","answer":"Gốc"},
            {"id":"b","text":"Câu B","answer":null},
            {"id":"c","text":"Câu C","answer":null}
        ]);
        db.execute(
            "INSERT INTO exams(id,classroom_id,title,questions) VALUES ('paper',?1,'Đề Toán',?2)",
            params![class, questions.to_string()],
        )
        .unwrap();
        let game =
            json!({"kind":"relay","settings":{"names":["A","B"],"assignments":{},"rounds":1}});
        for kind in ["exam", "questions"] {
            let good = save(
                &mut db,
                &class,
                None,
                input(json!({"title":"Đã chọn", "game":game,
                "questionSource":{"kind":kind,"examId":"paper","questionIds":["c","a"]}})),
                false,
            )
            .unwrap();
            assert_eq!(
                good.questions
                    .iter()
                    .map(|q| q.id.as_str())
                    .collect::<Vec<_>>(),
                ["c", "a"]
            );
            assert_eq!(good.questions[1].answer.as_deref(), Some("Gốc"));
            for ids in [vec!["outside"], vec!["a", "a"], vec![]] {
                assert!(save(
                    &mut db,
                    &class,
                    None,
                    input(json!({"title":"Sai", "game":game,
                    "questionSource":{"kind":kind,"examId":"paper","questionIds":ids}})),
                    false
                )
                .is_err());
            }
        }
    }

    #[test]
    fn keeps_order_and_snapshots_through_editing_backup_and_launch() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("classroom.sqlite");
        let mut db = db::open(&path).unwrap();
        let school = db::save_school(&db, None, "Hoa Sen", None).unwrap();
        let class = db::save_classroom(&db, &school, None, "5A").unwrap();
        let other = db::save_classroom(&db, &school, None, "5B").unwrap();
        db::save_student(
            &mut db,
            &class,
            None,
            serde_json::from_value(json!({
                "fullName":"Minh An","studentCode":null,"isActive":true
            }))
            .unwrap(),
        )
        .unwrap();
        let bank = json!([
            {"id":"a","text":"Câu thứ nhất","answer":"Một"},
            {"id":"b","text":"Câu thứ hai","answer":"Hai"}
        ]);
        db::save_question_plan(
            &mut db,
            &class,
            serde_json::from_value(json!({"bank":bank,"turns":[]})).unwrap(),
        )
        .unwrap();
        db.execute(
            "INSERT INTO exams (id,classroom_id,title,questions) VALUES ('paper',?1,'Đề Toán',?2)",
            params![class, bank.to_string()],
        )
        .unwrap();
        let meteor = json!({"kind":"meteor","settings":{
            "count":3,"mode":"random","lead":0,"gap":1,"sound":false,"shake":false,
            "quality":"low","speed":2,"repeatStudents":true
        }});
        let selected = save(&mut db, &class, None, input(json!({
            "title":"Ôn Toán", "game":meteor, "questionSource":{"kind":"questions","questionIds":["b","a"]}
        })), true).unwrap();
        let relay = json!({"kind":"relay","settings":{"names":["Đội A","Đội B"],"assignments":{},"rounds":1}});
        let exam = save(&mut db, &class, None, input(json!({
            "title":"Thi đấu theo đề", "game":relay, "questionSource":{"kind":"exam","examId":"paper"}
        })), false).unwrap();
        assert!(save(&mut db, &other, None, input(json!({
            "title":"Đề lớp khác", "game":relay, "questionSource":{"kind":"exam","examId":"paper"}
        })), false).is_err());
        assert!(find(&db, &other, &selected.id).is_err());

        db.execute("DELETE FROM exams WHERE id='paper'", [])
            .unwrap();
        db::save_question_plan(
            &mut db,
            &class,
            serde_json::from_value(json!({"bank":[],"turns":[]})).unwrap(),
        )
        .unwrap();
        let renamed = save(
            &mut db,
            &class,
            Some(&selected.id),
            input(json!({
                "title":"Ôn Toán thứ Hai", "game":meteor, "questionSource":null
            })),
            true,
        )
        .unwrap();
        assert_eq!(
            renamed
                .questions
                .iter()
                .map(|q| q.id.as_str())
                .collect::<Vec<_>>(),
            ["b", "a"]
        );

        let backup = folder.path().join("backup.sqlite");
        db::backup(&db, &backup).unwrap();
        let mut restored = db::open(&folder.path().join("restored.sqlite")).unwrap();
        db::restore(&mut restored, &backup, false).unwrap();
        assert_eq!(list(&restored, Some(&class)).unwrap().len(), 2);
        assert_eq!(
            find(&restored, &class, &exam.id).unwrap().questions[0].id,
            "a"
        );
        let loaded = find(&restored, &class, &selected.id).unwrap();
        assert_eq!(loaded.title, "Ôn Toán thứ Hai");
        let Game::Meteor { settings } = loaded.game else {
            panic!("wrong game");
        };
        let session =
            db::start_with_questions(&mut restored, &class, settings, Some(&loaded.questions))
                .unwrap();
        let value = serde_json::to_value(session).unwrap();
        let order: Vec<_> = value["settings"]["questions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|q| q["id"].as_str().unwrap())
            .collect();
        assert_eq!(order, ["b", "a", "b"]);
    }
}
