use crate::{
    db::{self, Question, Result},
    Data,
};
use rusqlite::{params, Connection, OptionalExtension, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum Status {
    NotStarted,
    Playing,
    Paused,
    Completed,
    Failed,
    Abandoned,
}

impl Status {
    fn database_value(self) -> &'static str {
        match self {
            Self::NotStarted => "not_started",
            Self::Playing => "playing",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Abandoned => "abandoned",
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum WrongAnswer {
    Retry,
    TimePenalty,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Config {
    name: String,
    limit_minutes: Option<u32>,
    sound: bool,
    hints: bool,
    wrong_answer: WrongAnswer,
    desk_question_id: Option<String>,
    book_question_id: Option<String>,
}

impl Config {
    fn validate(&mut self) -> Result<()> {
        self.name = db::clean(&self.name, 80)?;
        if self.limit_minutes.is_some_and(|limit| ![5, 10, 15, 20].contains(&limit)) {
            return Err("Thời lượng không hợp lệ.".into());
        }
        Ok(())
    }

    pub(crate) fn prepare_preset(&mut self, title: &str) -> Result<()> {
        self.name = title.into();
        self.desk_question_id = None;
        self.book_question_id = None;
        self.validate()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum Item {
    Paper4,
    Paper7,
    Paper2,
    PaintingNote,
    Key,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Station {
    Desk,
    Book,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnswerRecord {
    station: Station,
    correct: bool,
    selected: Vec<usize>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EscapeSession {
    id: String,
    classroom_id: String,
    school_name: String,
    classroom_name: String,
    config: Config,
    started_at: String,
    status: Status,
    revision: u64,
    remaining_ms: Option<u64>,
    elapsed_ms: u64,
    questions: [Question; 2],
    inventory: Vec<Item>,
    hints_used: u8,
    answers: Vec<AnswerRecord>,
    correct: u32,
    wrong: u32,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum Action {
    Tick,
    Pause,
    Resume,
    Abandon,
    Painting,
    Hint,
    Exit,
    Answer {
        station: Station,
        #[serde(default)]
        selected: Vec<usize>,
        manual: Option<bool>,
    },
    Clock {
        hour: u8,
        minute: u8,
    },
    Safe {
        code: String,
    },
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum Feedback {
    Correct,
    Incorrect,
    WrongTime,
    MissingClues,
    WrongCode,
    NeedKey,
    Hint,
    Expired,
}

#[derive(Serialize)]
pub(crate) struct Change {
    session: EscapeSession,
    feedback: Option<Feedback>,
}

const CLUES: [Item; 3] = [Item::Paper4, Item::Paper7, Item::Paper2];

fn sample(index: usize) -> Question {
    let (id, text, answer, options, correct_options) = if index == 0 {
        (
            "escape-desk-sample",
            "Số nào chia hết cho cả 2 và 3?",
            "12 chia hết cho cả 2 và 3.",
            vec!["8", "12", "15"],
            vec![1],
        )
    } else {
        (
            "escape-book-sample",
            "Những hình nào có bốn cạnh?",
            "Hình vuông và hình chữ nhật đều có bốn cạnh.",
            vec!["Hình vuông", "Hình tam giác", "Hình chữ nhật"],
            vec![0, 2],
        )
    };
    Question {
        id: id.into(),
        text: text.into(),
        answer: Some(answer.into()),
        options: options.into_iter().map(str::to_owned).collect(),
        correct_options,
        image_ids: Vec::new(),
    }
}

impl EscapeSession {
    fn acquire(&mut self, item: Item) {
        if !self.inventory.contains(&item) {
            self.inventory.push(item);
        }
    }

    fn spend_time(&mut self, milliseconds: u64) {
        if let Some(left) = &mut self.remaining_ms {
            *left = left.saturating_sub(milliseconds);
            if *left == 0 {
                self.status = Status::Failed;
            }
        }
    }

    fn apply(&mut self, action: Action, elapsed: u64) -> Result<Option<Feedback>> {
        if matches!(action, Action::Abandon)
            && matches!(self.status, Status::Paused | Status::Playing)
        {
            if self.status == Status::Playing {
                self.elapsed_ms = self
                    .elapsed_ms
                    .saturating_add(elapsed.min(self.remaining_ms.unwrap_or(elapsed)));
                self.spend_time(elapsed);
            }
            if self.status != Status::Failed {
                self.status = Status::Abandoned;
            }
            return Ok(None);
        }
        if self.status == Status::Paused && matches!(action, Action::Resume) {
            self.status = Status::Playing;
            return Ok(None);
        }
        if self.status != Status::Playing {
            return Err("Phiên chơi đang tạm dừng hoặc đã kết thúc.".into());
        }
        self.elapsed_ms = self
            .elapsed_ms
            .saturating_add(elapsed.min(self.remaining_ms.unwrap_or(elapsed)));
        self.spend_time(elapsed);
        if self.status == Status::Failed {
            return Ok(Some(Feedback::Expired));
        }
        let feedback = match action {
            Action::Tick | Action::Resume => None,
            Action::Pause => {
                self.status = Status::Paused;
                None
            }
            Action::Painting => {
                self.acquire(Item::PaintingNote);
                None
            }
            Action::Hint => {
                if !self.config.hints || self.hints_used >= 4 {
                    return Err("Không còn gợi ý để mở.".into());
                }
                self.hints_used += 1;
                Some(Feedback::Hint)
            }
            Action::Answer {
                station,
                mut selected,
                manual,
            } => {
                let (index, item) = match station {
                    Station::Desk => (0, Item::Paper4),
                    Station::Book => (1, Item::Paper7),
                };
                if self.inventory.contains(&item) {
                    return Ok(None);
                }
                let question = &self.questions[index];
                let correct = if question.correct_options.is_empty() {
                    manual.ok_or("Giáo viên cần đánh giá câu trả lời.")?
                } else {
                    selected.sort_unstable();
                    let mut expected = question.correct_options.clone();
                    expected.sort_unstable();
                    if selected.is_empty()
                        || selected
                            .iter()
                            .any(|index| *index >= question.options.len())
                        || manual.is_some()
                    {
                        return Err("Hãy chọn phương án rồi xác nhận câu trả lời.".into());
                    }
                    selected == expected
                };
                self.answers.push(AnswerRecord {
                    station,
                    correct,
                    selected,
                });
                if correct {
                    self.correct += 1;
                    self.acquire(item);
                    Some(Feedback::Correct)
                } else {
                    self.wrong += 1;
                    if matches!(self.config.wrong_answer, WrongAnswer::TimePenalty) {
                        self.spend_time(15_000);
                    }
                    Some(Feedback::Incorrect)
                }
            }
            Action::Clock {
                hour: 3,
                minute: 15,
            } => {
                self.acquire(Item::Paper2);
                Some(Feedback::Correct)
            }
            Action::Clock { .. } => Some(Feedback::WrongTime),
            Action::Safe { .. } if !CLUES.iter().all(|item| self.inventory.contains(item)) => {
                Some(Feedback::MissingClues)
            }
            Action::Safe { code } if code == "472" => {
                self.acquire(Item::Key);
                Some(Feedback::Correct)
            }
            Action::Safe { .. } => Some(Feedback::WrongCode),
            Action::Exit if self.inventory.contains(&Item::Key) => {
                self.status = Status::Completed;
                None
            }
            Action::Exit => Some(Feedback::NeedKey),
            Action::Abandon => None,
        };
        Ok(feedback)
    }
}

fn read(row: &Row) -> rusqlite::Result<EscapeSession> {
    let data: String = row.get(0)?;
    serde_json::from_str(&data).map_err(|err| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err))
    })
}

fn snapshot(session: &EscapeSession) -> Result<String> {
    serde_json::to_string(session).map_err(|_| "Không thể lưu trạng thái căn phòng.".into())
}

pub(crate) fn list(db: &Connection, class: Option<&str>) -> Result<Vec<EscapeSession>> {
    db::collect(db, "SELECT snapshot FROM escape_sessions WHERE (?1 IS NULL OR classroom_id=?1) ORDER BY started_at DESC, rowid DESC", [class], read)
}

fn start(db: &mut Connection, class: &str, config: Config) -> Result<EscapeSession> {
    start_with_questions(db, class, config, None)
}

pub(crate) fn start_with_questions(
    db: &mut Connection,
    class: &str,
    mut config: Config,
    questions: Option<[Question; 2]>,
) -> Result<EscapeSession> {
    config.validate()?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db::storage)?;
    let (school_name, classroom_name, started_at): (String, String, String) = tx.query_row(
        "SELECT s.name,c.name,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM classrooms c JOIN schools s ON s.id=c.school_id WHERE c.id=?1 AND c.deleted=0 AND s.deleted=0",
        [class], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(db::storage)?.ok_or("Lớp học không còn khả dụng.")?;
    let active: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM escape_sessions WHERE classroom_id=?1 AND status IN ('playing','paused'))", [class], |row| row.get(0)).map_err(db::storage)?;
    if active {
        return Err("Hãy tiếp tục hoặc bỏ phiên đang dở của lớp này.".into());
    }
    let questions = match questions {
        Some(questions) => questions,
        None => {
            let bank = db::question_plan(&tx, class)?.bank;
            let question = |id: &Option<String>, index| match id {
                Some(id) => bank.iter().find(|query| &query.id == id).cloned()
                    .ok_or("Câu hỏi không còn trong ngân hàng của lớp."),
                None => Ok(sample(index)),
            };
            [question(&config.desk_question_id, 0)?, question(&config.book_question_id, 1)?]
        }
    };
    let session = EscapeSession {
        id: Uuid::new_v4().to_string(),
        classroom_id: class.into(),
        school_name,
        classroom_name,
        started_at,
        remaining_ms: config.limit_minutes.map(|limit| u64::from(limit) * 60_000),
        config,
        status: Status::Playing,
        elapsed_ms: 0,
        revision: 0,
        questions,
        inventory: Vec::new(),
        hints_used: 0,
        answers: Vec::new(),
        correct: 0,
        wrong: 0,
    };
    tx.execute("INSERT INTO escape_sessions (id,classroom_id,status,started_at,revision,snapshot) VALUES (?1,?2,?3,?4,?5,?6)",
        params![session.id, class, session.status.database_value(), session.started_at, session.revision, snapshot(&session)?]).map_err(db::storage)?;
    tx.commit().map_err(db::storage)?;
    Ok(session)
}

fn change(
    db: &mut Connection,
    id: &str,
    revision: u64,
    elapsed_ms: u64,
    action: Action,
) -> Result<Change> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db::storage)?;
    let mut session = tx
        .query_row(
            "SELECT snapshot FROM escape_sessions WHERE id=?1",
            [id],
            read,
        )
        .optional()
        .map_err(db::storage)?
        .ok_or("Không tìm thấy phiên chơi.")?;
    if session.revision != revision {
        return Err("Tiến trình đã thay đổi. Hãy tải lại phiên chơi.".into());
    }
    let feedback = session.apply(action, elapsed_ms)?;
    session.revision += 1;
    tx.execute(
        "UPDATE escape_sessions SET status=?2, revision=?3, snapshot=?4 WHERE id=?1",
        params![
            id,
            session.status.database_value(),
            session.revision,
            snapshot(&session)?
        ],
    )
    .map_err(db::storage)?;
    tx.commit().map_err(db::storage)?;
    Ok(Change { session, feedback })
}

#[tauri::command]
pub(crate) fn escape_start(
    data: State<Data>,
    classroom_id: String,
    config: Config,
) -> Result<EscapeSession> {
    data.access(|db| start(db, &classroom_id, config))
}

#[tauri::command]
pub(crate) fn escape_restart(data: State<Data>, session_id: String) -> Result<EscapeSession> {
    data.access(|db| {
        let previous = db.query_row("SELECT snapshot FROM escape_sessions WHERE id=?1", [&session_id], read)
            .optional().map_err(db::storage)?.ok_or("Không tìm thấy phiên chơi.")?;
        start_with_questions(db, &previous.classroom_id, previous.config, Some(previous.questions))
    })
}

#[tauri::command]
pub(crate) fn escape_list(
    data: State<Data>,
    classroom_id: Option<String>,
) -> Result<Vec<EscapeSession>> {
    data.access(|db| list(db, classroom_id.as_deref()))
}

#[tauri::command]
pub(crate) fn escape_action(
    data: State<Data>,
    id: String,
    revision: u64,
    elapsed_ms: u64,
    action: Action,
) -> Result<Change> {
    data.access(|db| change(db, &id, revision, elapsed_ms, action))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(limit: Option<u32>) -> Config {
        Config {
            name: "Bí mật phòng học cũ".into(),
            limit_minutes: limit,
            sound: false,
            hints: true,
            wrong_answer: WrongAnswer::TimePenalty,
            desk_question_id: None,
            book_question_id: None,
        }
    }

    fn classroom(db: &mut Connection) -> String {
        let school = db::save_school(db, None, "Hoa Sen", None).unwrap();
        db::save_classroom(db, &school, None, "5A").unwrap()
    }

    fn send(
        db: &mut Connection,
        session: &mut EscapeSession,
        elapsed: u64,
        action: Action,
    ) -> Option<Feedback> {
        let result = change(db, &session.id, session.revision, elapsed, action).unwrap();
        *session = result.session;
        result.feedback
    }

    fn answer(station: Station, selected: &[usize]) -> Action {
        Action::Answer {
            station,
            selected: selected.to_vec(),
            manual: None,
        }
    }

    #[test]
    fn complete_room_with_wrong_attempts_inventory_gates_and_history() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("data.sqlite");
        let mut db = db::open(&path).unwrap();
        let class = classroom(&mut db);
        let mut room = start(&mut db, &class, config(Some(5))).unwrap();
        assert!(start(&mut db, &class, config(None)).is_err());
        assert_eq!(
            send(&mut db, &mut room, 100, Action::Safe { code: "472".into() }),
            Some(Feedback::MissingClues)
        );
        assert_eq!(
            send(&mut db, &mut room, 100, Action::Exit),
            Some(Feedback::NeedKey)
        );
        assert_eq!(
            send(&mut db, &mut room, 800, answer(Station::Desk, &[0])),
            Some(Feedback::Incorrect)
        );
        assert_eq!(room.remaining_ms, Some(284_000));
        assert_eq!(
            send(&mut db, &mut room, 0, answer(Station::Desk, &[1])),
            Some(Feedback::Correct)
        );
        assert_eq!(
            send(&mut db, &mut room, 0, answer(Station::Desk, &[1])),
            None
        );
        assert_eq!(room.inventory, [Item::Paper4]);
        assert_eq!(room.answers.len(), 2);
        assert_eq!(
            send(&mut db, &mut room, 0, answer(Station::Book, &[2])),
            Some(Feedback::Incorrect)
        );
        assert_eq!(
            send(&mut db, &mut room, 0, answer(Station::Book, &[2, 0])),
            Some(Feedback::Correct)
        );
        assert_eq!(
            send(&mut db, &mut room, 0, Action::Clock { hour: 3, minute: 0 }),
            Some(Feedback::WrongTime)
        );
        assert_eq!(
            send(
                &mut db,
                &mut room,
                0,
                Action::Clock {
                    hour: 3,
                    minute: 15
                }
            ),
            Some(Feedback::Correct)
        );
        send(&mut db, &mut room, 0, Action::Painting);
        send(&mut db, &mut room, 0, Action::Painting);
        assert_eq!(
            send(&mut db, &mut room, 0, Action::Hint),
            Some(Feedback::Hint)
        );
        assert_eq!(
            send(&mut db, &mut room, 0, Action::Safe { code: "427".into() }),
            Some(Feedback::WrongCode)
        );
        assert!(!room.inventory.contains(&Item::Key));
        assert_eq!(
            send(&mut db, &mut room, 0, Action::Safe { code: "472".into() }),
            Some(Feedback::Correct)
        );
        send(&mut db, &mut room, 0, Action::Safe { code: "472".into() });
        assert_eq!(
            room.inventory,
            [
                Item::Paper4,
                Item::Paper7,
                Item::Paper2,
                Item::PaintingNote,
                Item::Key
            ]
        );
        send(&mut db, &mut room, 200, Action::Exit);
        assert_eq!(room.status, Status::Completed);
        assert_eq!(
            (room.correct, room.wrong, room.hints_used, room.elapsed_ms),
            (2, 2, 1, 1_200)
        );
        assert!(change(&mut db, &room.id, room.revision, 1, Action::Exit).is_err());
        drop(db);

        let db = db::open(&path).unwrap();
        let history = list(&db, Some(&class)).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(snapshot(&history[0]).unwrap(), snapshot(&room).unwrap());
        let backup = temp.path().join("backup.sqlite");
        db::backup(&db, &backup).unwrap();
        let mut restored = db::open(&temp.path().join("restored.sqlite")).unwrap();
        db::restore(&mut restored, &backup, false).unwrap();
        assert_eq!(
            snapshot(&list(&restored, None).unwrap()[0]).unwrap(),
            snapshot(&room).unwrap()
        );
    }

    #[test]
    fn pause_resume_and_expire_are_persisted_without_charging_paused_time() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("room.sqlite");
        let mut db = db::open(&path).unwrap();
        let class = classroom(&mut db);
        let mut room = start(&mut db, &class, config(Some(5))).unwrap();
        let before = room.revision;
        send(&mut db, &mut room, 10_000, Action::Pause);
        assert!(change(&mut db, &room.id, before, 0, Action::Tick).is_err());
        assert!(change(&mut db, &room.id, room.revision, 999_999, Action::Tick).is_err());
        drop(db);
        let mut db = db::open(&path).unwrap();
        room = list(&db, Some(&class)).unwrap().remove(0);
        assert_eq!(room.status, Status::Paused);
        assert_eq!(room.remaining_ms, Some(290_000));
        send(&mut db, &mut room, 999_999, Action::Resume);
        assert_eq!(room.remaining_ms, Some(290_000));
        assert_eq!(
            send(&mut db, &mut room, 290_001, Action::Tick),
            Some(Feedback::Expired)
        );
        assert_eq!(room.remaining_ms, Some(0));
        assert_eq!(room.status, Status::Failed);
        assert_eq!(room.elapsed_ms, 300_000);

        let mut unlimited = start(&mut db, &class, config(None)).unwrap();
        send(&mut db, &mut unlimited, 999_000, Action::Tick);
        assert_eq!(unlimited.status, Status::Playing);
        assert_eq!(unlimited.remaining_ms, None);
        send(&mut db, &mut unlimited, 0, Action::Abandon);
        assert_eq!(unlimited.status, Status::Abandoned);
    }

    #[test]
    fn classroom_question_snapshot_requires_explicit_manual_grading_without_an_answer() {
        let temp = tempfile::tempdir().unwrap();
        let mut db = db::open(&temp.path().join("data.sqlite")).unwrap();
        let class = classroom(&mut db);
        let plan = |text| {
            serde_json::from_value(serde_json::json!({
                "bank": [{ "id": "room-question", "text": text, "answer": null }], "turns": []
            }))
            .unwrap()
        };
        db::save_question_plan(&mut db, &class, plan("Tại sao em thích đọc sách?")).unwrap();
        let mut settings = config(None);
        settings.desk_question_id = Some("room-question".into());
        settings.hints = false;
        let mut room = start(&mut db, &class, settings).unwrap();
        db::save_question_plan(&mut db, &class, plan("Câu hỏi đã sửa")).unwrap();
        assert_eq!(room.questions[0].text, "Tại sao em thích đọc sách?");
        assert!(change(&mut db, &room.id, room.revision, 0, Action::Hint).is_err());
        assert!(change(
            &mut db,
            &room.id,
            room.revision,
            0,
            answer(Station::Desk, &[])
        )
        .is_err());
        assert_eq!(
            send(
                &mut db,
                &mut room,
                0,
                Action::Answer {
                    station: Station::Desk,
                    selected: vec![],
                    manual: Some(false)
                }
            ),
            Some(Feedback::Incorrect)
        );
        assert!(room.inventory.is_empty());
        assert_eq!(
            send(
                &mut db,
                &mut room,
                0,
                Action::Answer {
                    station: Station::Desk,
                    selected: vec![],
                    manual: Some(true)
                }
            ),
            Some(Feedback::Correct)
        );
        assert_eq!(room.inventory, [Item::Paper4]);
    }
}
