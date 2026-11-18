use crate::{
    db::{self, Result},
    Data,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use tauri::State;

pub(crate) fn list(db: &Connection, classroom_id: Option<String>) -> Result<Vec<Value>> {
    let rows: Vec<String> = db::collect(db,
        "SELECT snapshot FROM knight_sessions WHERE (?1 IS NULL OR classroom_id=?1) ORDER BY updated_at DESC",
        [classroom_id], |r| r.get(0))?;
    rows.into_iter()
        .map(|s| serde_json::from_str(&s).map_err(|_| "Tiến trình hiệp sĩ bị lỗi.".into()))
        .collect()
}

fn save(db: &mut Connection, mut snapshot: Value, revision: i64) -> Result<Value> {
    let id = snapshot["id"].as_str().ok_or("Thiếu mã phiên.")?.to_owned();
    let class = snapshot["classroomId"]
        .as_str()
        .ok_or("Thiếu lớp.")?
        .to_owned();
    let phase = snapshot["phase"].as_str().ok_or("Thiếu trạng thái.")?;
    let health = snapshot["health"].as_i64().ok_or("Thiếu sinh lực.")?;
    let shields = snapshot["shields"].as_i64().ok_or("Thiếu khiên.")?;
    let encounters = snapshot["encounters"].as_array().ok_or("Thiếu câu hỏi.")?;
    let index = snapshot["index"].as_u64().ok_or("Thiếu lượt.")?;
    if id.len() > 80
        || !(0..=3).contains(&health)
        || !(0..=3).contains(&shields)
        || encounters.is_empty()
        || encounters.len() > 40
        || index as usize >= encounters.len()
        || !matches!(
            phase,
            "travel" | "question" | "feedback" | "rescue" | "completed" | "failed"
        )
        || snapshot.to_string().len() > 4_000_000
    {
        return Err("Tiến trình hiệp sĩ không hợp lệ.".into());
    }
    let tx = db.transaction().map_err(db::storage)?;
    let old: Option<(i64, String)> = tx
        .query_row(
            "SELECT revision,classroom_id FROM knight_sessions WHERE id=?1",
            [&id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(db::storage)?;
    if old
        .as_ref()
        .is_some_and(|(r, c)| *r != revision || c != &class)
        || old.is_none() && revision != 0
    {
        return Err("Phiên đã thay đổi. Hãy mở lại tiến trình đã lưu.".into());
    }
    snapshot["revision"] = Value::from(revision + 1);
    tx.execute("INSERT INTO knight_sessions(id,classroom_id,revision,snapshot) VALUES(?1,?2,?3,?4)
        ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![id, class, revision + 1, snapshot.to_string()]).map_err(db::storage)?;
    tx.commit().map_err(db::storage)?;
    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn knight_save(data: State<Data>, snapshot: Value, revision: i64) -> Result<Value> {
    data.access(|db| save(db, snapshot, revision))
}
#[tauri::command]
pub(crate) fn knight_list(data: State<Data>, classroom_id: Option<String>) -> Result<Vec<Value>> {
    data.access(|db| list(db, classroom_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn snapshots_are_atomic_revision_checked_and_do_not_modify_old_games() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE classrooms(id TEXT PRIMARY KEY); INSERT INTO classrooms VALUES('c'); CREATE TABLE game_sessions(id TEXT); INSERT INTO game_sessions VALUES('old');").unwrap();
        db.execute_batch(include_str!("../migrations/009_knight_rescue.sql"))
            .unwrap();
        let s = json!({"id":"k","classroomId":"c","health":2,"shields":1,"index":0,"phase":"feedback","encounters":[{}],"answers":[{"correct":false}]});
        let saved = save(&mut db, s.clone(), 0).unwrap();
        assert_eq!(saved["revision"], 1);
        assert!(save(&mut db, s, 0).is_err());
        assert_eq!(list(&db, Some("c".into())).unwrap()[0], saved);
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM game_sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
    #[test]
    fn new_migration_and_backup_restore_preserve_knight_progress_and_question_bank() {
        let folder = tempfile::tempdir().unwrap();
        let mut db = db::open(&folder.path().join("original.sqlite")).unwrap();
        let school = db::save_school(&mut db, None, "School", None).unwrap();
        let class = db::save_classroom(&mut db, &school, None, "Class").unwrap();
        let s = json!({"id":"knight","classroomId":class,"health":1,"shields":2,"index":0,"phase":"feedback","paused":true,"encounters":[{"question":{"id":"q","text":"Snapshot"}}],"answers":[{"correct":false}],"elapsedMs":32000});
        let saved = save(&mut db, s, 0).unwrap();
        let copy = folder.path().join("copy.sqlite");
        db::backup(&db, &copy).unwrap();
        let mut restored = db::open(&folder.path().join("restored.sqlite")).unwrap();
        db::restore(&mut restored, &copy, false).unwrap();
        assert_eq!(list(&restored, Some(class)).unwrap(), vec![saved]);
        assert_eq!(db::schools(&restored).unwrap().len(), 1);
        assert!(db::history(&restored).unwrap().is_empty());
    }
}
