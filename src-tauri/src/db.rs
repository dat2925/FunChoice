use crate::selection::draw;
use rand::{seq::SliceRandom, Rng};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, Row, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, time::Duration};
use uuid::Uuid;

type Sql<T> = rusqlite::Result<T>;
pub type Result<T> = std::result::Result<T, String>;

const NOW: &str = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const SESSION_FIELDS: &str = "id,classroom_id,school_name,classroom_name,target_count,selection_mode,started_at,finished_at,cancelled,settings,school_theme";
const APPLICATION_ID: i64 = 1397705812;

fn id() -> String {
    Uuid::new_v4().to_string()
}
pub(crate) fn storage(error: rusqlite::Error) -> String {
    eprintln!("SQLite: {error}");
    "Không thể truy cập dữ liệu SQLite. Hãy kiểm tra tệp và quyền truy cập.".into()
}
pub(crate) fn collect<T>(
    db: &Connection,
    sql: &str,
    args: impl rusqlite::Params,
    read: impl FnMut(&Row) -> Sql<T>,
) -> Result<Vec<T>> {
    let mut query = db.prepare(sql).map_err(storage)?;
    let rows = query.query_map(args, read).map_err(storage)?;
    rows.collect::<Sql<Vec<_>>>().map_err(storage)
}
pub(crate) fn clean(value: &str, max: usize) -> Result<String> {
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if value.is_empty() || value.chars().count() > max || value.chars().any(char::is_control) {
        return Err(format!("Vui lòng nhập từ 1 đến {max} ký tự hợp lệ."));
    }
    Ok(value)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct School {
    theme: String,
    id: String,
    name: String,
    count: i64,
    created_at: String,
    updated_at: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Classroom {
    id: String,
    school_id: String,
    name: String,
    count: i64,
    created_at: String,
    updated_at: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Student {
    id: String,
    classroom_id: String,
    full_name: String,
    student_code: Option<String>,
    character_variant: u8,
    gender: Option<String>,
    is_active: bool,
    created_at: String,
    updated_at: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StudentInput {
    full_name: String,
    student_code: Option<String>,
    gender: Option<String>,
    is_active: bool,
}
#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub(crate) count: usize,
    mode: String,
    pub lead: u32,
    pub gap: u32,
    pub sound: bool,
    pub shake: bool,
    pub quality: String,
    pub speed: f32,
    #[serde(default)]
    pub music: Music,
    #[serde(default)]
    pub meteor_style: MeteorStyle,
    #[serde(default)]
    repeat_students: bool,
    #[serde(default)]
    pub(crate) with_questions: bool,
    #[serde(default)]
    pub(crate) questions: Vec<Question>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub(crate) id: String,
    pub(crate) text: String,
    pub(crate) answer: Option<String>,
    #[serde(default)]
    pub(crate) options: Vec<String>,
    #[serde(default)]
    pub(crate) correct_options: Vec<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) image_ids: Vec<String>,
}

#[derive(Deserialize, Serialize)]
pub struct QuestionPlan {
    #[serde(default, rename = "examId", skip_serializing_if = "Option::is_none")]
    exam_id: Option<String>,
    pub(crate) bank: Vec<Question>,
    turns: Vec<Option<String>>,
}
#[derive(Deserialize, Serialize, Clone, Copy, Default)]
#[serde(rename_all = "camelCase")]
pub enum MeteorStyle {
    #[default]
    Straight,
    Curve,
    Mixed,
}
#[derive(Deserialize, Serialize, Clone, Copy, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Music {
    #[default]
    Suspense,
    Adventure,
    Arcade,
    Mp3,
}

impl Settings {
    pub fn check_license(&self, pro: bool) -> Result<()> {
        if !pro && self.count > 1 {
            return Err(
                "Bản miễn phí chọn tối đa 1 học sinh mỗi lượt. Kích hoạt Pro để chọn nhiều hơn."
                    .into(),
            );
        }
        if !pro && self.music != Music::Suspense {
            return Err("Kích hoạt Pro để đổi nhạc nền.".into());
        }
        Ok(())
    }

    pub(crate) fn validate(&self) -> Result<()> {
        if self.count == 0
            || !matches!(self.mode.as_str(), "random" | "cycle" | "weighted")
            || !matches!(self.quality.as_str(), "high" | "low")
            || self.lead > 20
            || !(1..=10).contains(&self.gap)
            || !(0.5..=2.0).contains(&self.speed)
        {
            return Err("Cấu hình trò chơi không hợp lệ.".into());
        }
        Ok(())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    classroom_id: String,
    school_name: String,
    school_theme: String,
    classroom_name: String,
    target_count: usize,
    selection_mode: String,
    started_at: String,
    finished_at: Option<String>,
    cancelled: bool,
    settings: Settings,
    pub results: Vec<Selection>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    student_id: String,
    full_name: String,
    student_code: Option<String>,
    selection_order: usize,
    pub selected_at: Option<String>,
}
fn read_session(row: &Row) -> Sql<Session> {
    let settings: String = row.get(9)?;
    let settings = serde_json::from_str(&settings).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(9, rusqlite::types::Type::Text, Box::new(error))
    })?;
    Ok(Session {
        id: row.get(0)?,
        classroom_id: row.get(1)?,
        school_name: row.get(2)?,
        school_theme: row.get(10)?,
        classroom_name: row.get(3)?,
        target_count: row.get(4)?,
        selection_mode: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
        cancelled: row.get(8)?,
        settings,
        results: Vec::new(),
    })
}
fn attach(db: &Connection, session: &mut Session, show_planned: bool) -> Result<()> {
    session.results = collect(db,
        "SELECT student_id,full_name,student_code,selection_order,selected_at FROM selection_results
         WHERE session_id=?1 AND (?2 OR selected_at IS NOT NULL) ORDER BY selection_order",
        params![session.id, show_planned], |r| Ok(Selection {
            student_id:r.get(0)?, full_name:r.get(1)?, student_code:r.get(2)?,
            selection_order:r.get(3)?, selected_at:r.get(4)?,
        }))?;
    Ok(())
}

pub fn open(path: &Path) -> Result<Connection> {
    let mut db = Connection::open(path).map_err(storage)?;
    db.busy_timeout(Duration::from_secs(5)).map_err(storage)?;
    db.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
        .map_err(storage)?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    migrate(&tx)?;
    tx.commit().map_err(storage)?;
    Ok(db)
}

fn migrate(db: &Connection) -> Result<()> {
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(storage)?;
    if !(0..=8).contains(&version) {
        return Err("Phiên bản dữ liệu không tương thích.".into());
    }
    if version == 0 {
        db.execute_batch(include_str!("../migrations/001_initial.sql"))
            .map_err(storage)?;
    }
    if version < 2 {
        db.execute_batch(include_str!("../migrations/002_gender_and_live_draw.sql"))
            .map_err(storage)?;
    }
    if version < 3 {
        db.execute_batch(include_str!("../migrations/003_school_theme.sql"))
            .map_err(storage)?;
    }
    if version < 4 {
        db.execute_batch(include_str!("../migrations/004_class_questions.sql"))
            .map_err(storage)?;
    }
    if version < 5 {
        db.execute_batch(include_str!("../migrations/005_escape_room.sql"))
            .map_err(storage)?;
    }
    if version < 6 {
        db.execute_batch(include_str!("../migrations/006_exams.sql"))
            .map_err(storage)?;
    }
    if version < 7 {
        db.execute_batch(include_str!("../migrations/007_question_images.sql"))
            .map_err(storage)?;
    }
    if version < 8 {
        db.execute_batch(include_str!("../migrations/008_game_presets.sql"))
            .map_err(storage)?;
    }
    Ok(())
}

pub fn schools(db: &Connection) -> Result<Vec<School>> {
    collect(
        db,
        "SELECT s.id,s.name,COUNT(c.id),s.created_at,s.updated_at,s.theme FROM schools s
        LEFT JOIN classrooms c ON c.school_id=s.id AND c.deleted=0 WHERE s.deleted=0
        GROUP BY s.id ORDER BY s.created_at,s.rowid",
        [],
        |r| {
            Ok(School {
                theme: r.get(5)?,
                id: r.get(0)?,
                name: r.get(1)?,
                count: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
            })
        },
    )
}
pub fn classrooms(db: &Connection, school: &str) -> Result<Vec<Classroom>> {
    collect(
        db,
        "SELECT c.id,c.school_id,c.name,COUNT(s.id),c.created_at,c.updated_at FROM classrooms c
        JOIN schools p ON p.id=c.school_id AND p.deleted=0
        LEFT JOIN students s ON s.classroom_id=c.id AND s.deleted=0
        WHERE c.school_id=?1 AND c.deleted=0 GROUP BY c.id ORDER BY c.name_key",
        [school],
        |r| {
            Ok(Classroom {
                id: r.get(0)?,
                school_id: r.get(1)?,
                name: r.get(2)?,
                count: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        },
    )
}
pub fn students(db: &Connection, class: &str) -> Result<Vec<Student>> {
    collect(db, "SELECT s.id,s.classroom_id,s.full_name,s.student_code,s.character_variant,s.is_active,s.created_at,s.updated_at,s.gender
        FROM students s JOIN classrooms c ON c.id=s.classroom_id AND c.deleted=0
        JOIN schools p ON p.id=c.school_id AND p.deleted=0
        WHERE s.classroom_id=?1 AND s.deleted=0 ORDER BY s.created_at,s.rowid",
        [class], |r| Ok(Student {
            id:r.get(0)?, classroom_id:r.get(1)?, full_name:r.get(2)?, student_code:r.get(3)?,
            character_variant:r.get(4)?, is_active:r.get(5)?, created_at:r.get(6)?, updated_at:r.get(7)?, gender:r.get(8)?,
        }))
}

fn unlocked(db: &Connection) -> Result<()> {
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM game_sessions WHERE finished_at IS NULL)",
            [],
            |r| r.get(0),
        )
        .map_err(storage)?;
    if exists {
        Err("Hãy tiếp tục hoặc kết thúc lượt đang chơi trước khi sửa dữ liệu.".into())
    } else {
        Ok(())
    }
}
fn changed(rows: usize) -> Result<()> {
    if rows == 0 {
        Err("Không tìm thấy dữ liệu đã chọn.".into())
    } else {
        Ok(())
    }
}
pub fn save_school(
    db: &Connection,
    key: Option<String>,
    name: &str,
    theme: Option<&str>,
) -> Result<String> {
    unlocked(db)?;
    let name = clean(name, 120)?;
    if theme.is_some_and(|theme| !matches!(theme, "rural" | "city" | "mountain")) {
        return Err("Nền sân trường không hợp lệ.".into());
    }
    let key = if let Some(key) = key {
        changed(
            db.execute(
                &format!("UPDATE schools SET name=?1,theme=COALESCE(?3,theme),updated_at={NOW} WHERE id=?2 AND deleted=0"),
                params![name, key, theme],
            )
            .map_err(storage)?,
        )?;
        key
    } else {
        let key = id();
        db.execute(
            "INSERT INTO schools(id,name,theme) VALUES (?1,?2,COALESCE(?3,'rural'))",
            params![key, name, theme],
        )
        .map_err(storage)?;
        key
    };
    Ok(key)
}
pub fn check_free_classes(db: &Connection) -> Result<()> {
    let total: usize = db
        .query_row(
            "SELECT COUNT(*) FROM classrooms WHERE deleted=0",
            [],
            |row| row.get(0),
        )
        .map_err(storage)?;
    if total >= crate::license::FREE_CLASSES {
        return Err(
            "Bản miễn phí có tối đa 2 lớp trên toàn ứng dụng. Kích hoạt Pro để thêm lớp.".into(),
        );
    }
    Ok(())
}

pub fn check_free_students(db: &Connection, class: &str, added: usize) -> Result<()> {
    let total: usize = db
        .query_row(
            "SELECT COUNT(*) FROM students WHERE classroom_id=?1 AND deleted=0",
            [class],
            |row| row.get(0),
        )
        .map_err(storage)?;
    if total.saturating_add(added) > crate::license::FREE_STUDENTS {
        return Err(
            "Bản miễn phí có tối đa 30 học sinh mỗi lớp. Kích hoạt Pro để thêm học sinh.".into(),
        );
    }
    Ok(())
}

pub fn save_classroom(
    db: &Connection,
    school: &str,
    key: Option<String>,
    name: &str,
) -> Result<String> {
    unlocked(db)?;
    let name = clean(name, 80)?;
    let name_key = name.to_lowercase();
    let key = if let Some(key) = key {
        let rows = db.execute(&format!("UPDATE classrooms SET name=?1,name_key=?2,updated_at={NOW} WHERE id=?3 AND school_id=?4 AND deleted=0"),
            params![name,name_key,key,school]).map_err(class_error)?;
        changed(rows)?;
        key
    } else {
        let key = id();
        changed(
            db.execute(
                "INSERT INTO classrooms(id,school_id,name,name_key)
            SELECT ?1,id,?3,?4 FROM schools WHERE id=?2 AND deleted=0",
                params![key, school, name, name_key],
            )
            .map_err(class_error)?,
        )?;
        key
    };
    Ok(key)
}
fn class_error(error: rusqlite::Error) -> String {
    if let rusqlite::Error::SqliteFailure(code, _) = &error {
        if code.extended_code == 2067 {
            return "Tên lớp đã tồn tại trong trường này.".into();
        }
    }
    storage(error)
}

fn write_student(
    db: &Connection,
    class: &str,
    key: Option<String>,
    student: StudentInput,
) -> Result<String> {
    let name = clean(&student.full_name, 120)?;
    let code = student
        .student_code
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .map(|s| clean(s, 48))
        .transpose()?;
    if student
        .gender
        .as_deref()
        .is_some_and(|gender| !matches!(gender, "male" | "female"))
    {
        return Err("Giới tính học sinh không hợp lệ.".into());
    }
    let key = if let Some(key) = key {
        changed(
            db.execute(
                &format!(
                    "UPDATE students SET full_name=?1,student_code=?2,
            character_variant=CASE WHEN gender IS NOT ?7 THEN (character_variant + ?3) % 24 ELSE character_variant END,
            is_active=?4,gender=?7,updated_at={NOW}
            WHERE id=?5 AND classroom_id=?6 AND deleted=0"
                ),
                params![
                    name,
                    code,
                    rand::rng().random_range(1..24),
                    student.is_active,
                    key,
                    class,
                    student.gender
                ],
            )
            .map_err(storage)?,
        )?;
        key
    } else {
        let key = id();
        let variant = rand::rng().random_range(0..24);
        changed(db.execute("INSERT INTO students(id,classroom_id,full_name,student_code,character_variant,is_active,gender)
            SELECT ?1,c.id,?3,?4,?5,?6,?7 FROM classrooms c JOIN schools p ON p.id=c.school_id
            WHERE c.id=?2 AND c.deleted=0 AND p.deleted=0",
            params![key,class,name,code,variant,student.is_active,student.gender]).map_err(storage)?)?;
        key
    };
    Ok(key)
}
pub fn save_student(
    db: &mut Connection,
    class: &str,
    key: Option<String>,
    student: StudentInput,
) -> Result<String> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    unlocked(&tx)?;
    let student_id = write_student(&tx, class, key, student)?;
    tx.execute(
        "DELETE FROM cycle_members WHERE student_id=?1 AND
        EXISTS(SELECT 1 FROM students WHERE id=?1 AND is_active=0)",
        [&student_id],
    )
    .map_err(storage)?;
    tx.commit().map_err(storage)?;
    Ok(student_id)
}
pub fn import_students(
    db: &mut Connection,
    class: &str,
    students: Vec<StudentInput>,
) -> Result<usize> {
    if students.is_empty() {
        return Err("Tệp phải có ít nhất một học sinh.".into());
    }
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    unlocked(&tx)?;
    let count = students.len();
    for (i, student) in students.into_iter().enumerate() {
        write_student(&tx, class, None, student)
            .map_err(|error| format!("Học sinh thứ {}: {error}", i + 1))?;
    }
    tx.commit().map_err(storage)?;
    Ok(count)
}
pub fn archive(db: &mut Connection, kind: &str, key: &str) -> Result<()> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    unlocked(&tx)?;
    let statements: &[&str] = match kind {
        "school" => &[
            "UPDATE schools SET deleted=1 WHERE id=?1 AND deleted=0",
            "UPDATE classrooms SET deleted=1 WHERE school_id=?1 AND deleted=0",
            "UPDATE students SET deleted=1 WHERE classroom_id IN (SELECT id FROM classrooms WHERE school_id=?1) AND deleted=0",
        ],
        "classroom" => &[
            "UPDATE classrooms SET deleted=1 WHERE id=?1 AND deleted=0",
            "UPDATE students SET deleted=1 WHERE classroom_id=?1 AND deleted=0",
        ],
        "student" => &["UPDATE students SET deleted=1 WHERE id=?1 AND deleted=0"],
        _ => return Err("Loại dữ liệu không hợp lệ.".into()),
    };
    for (i, statement) in statements.iter().enumerate() {
        let sql = statement.replacen(
            "SET deleted=1",
            &format!("SET deleted=1,updated_at={NOW}"),
            1,
        );
        let rows = tx.execute(&sql, [key]).map_err(storage)?;
        if i == 0 {
            changed(rows)?;
        }
    }
    tx.execute(
        "DELETE FROM cycle_members WHERE student_id IN (SELECT id FROM students WHERE deleted=1)",
        [],
    )
    .map_err(storage)?;
    tx.commit().map_err(storage)
}

pub fn pending(db: &Connection) -> Result<Option<Session>> {
    let mut session = db
        .query_row(
            &format!("SELECT {SESSION_FIELDS} FROM game_sessions WHERE finished_at IS NULL"),
            [],
            read_session,
        )
        .optional()
        .map_err(storage)?;
    if let Some(session) = session.as_mut() {
        attach(db, session, true)?;
    }
    Ok(session)
}
pub fn history(db: &Connection) -> Result<Vec<Session>> {
    let mut sessions = collect(
        db,
        &format!(
            "SELECT {SESSION_FIELDS} FROM game_sessions
        WHERE finished_at IS NOT NULL ORDER BY started_at DESC,rowid DESC"
        ),
        [],
        read_session,
    )?;
    for session in &mut sessions {
        attach(db, session, false)?;
    }
    Ok(sessions)
}
pub fn question_plan(db: &Connection, class: &str) -> Result<QuestionPlan> {
    let json: String = db
        .query_row(
            "SELECT c.question_plan FROM classrooms c JOIN schools s ON s.id=c.school_id
         WHERE c.id=?1 AND c.deleted=0 AND s.deleted=0",
            [class],
            |row| row.get(0),
        )
        .optional()
        .map_err(storage)?
        .ok_or("Không tìm thấy lớp học.")?;
    serde_json::from_str(&json).map_err(|_| "Không thể đọc danh sách câu hỏi.".into())
}

fn write_question_plan(
    db: &Connection,
    class: &str,
    mut plan: QuestionPlan,
) -> Result<QuestionPlan> {
    let mut ids = HashSet::new();
    let mut image_exists = db
        .prepare_cached("SELECT 1 FROM question_images WHERE id=?1")
        .map_err(storage)?;
    for question in &mut plan.bank {
        question.text = question.text.trim().to_owned();
        question.answer = question
            .answer
            .take()
            .map(|answer| answer.trim().to_owned())
            .filter(|answer| !answer.is_empty());
        if question.id.is_empty()
            || !ids.insert(question.id.as_str())
            || question.text.is_empty()
            || question.text.chars().count() > 2000
            || question
                .answer
                .as_ref()
                .is_some_and(|answer| answer.chars().count() > 4000)
        {
            return Err("Mỗi câu hỏi cần từ 1 đến 2000 ký tự. Đáp án tối đa 4000 ký tự.".into());
        }
        for option in &mut question.options {
            *option = option.trim().to_owned();
        }
        if (!question.options.is_empty()
            && (!(2..=8).contains(&question.options.len())
                || question
                    .options
                    .iter()
                    .any(|option| option.is_empty() || option.chars().count() > 500)))
            || question
                .correct_options
                .iter()
                .any(|index| *index >= question.options.len())
        {
            return Err("Câu trắc nghiệm cần 2 đến 8 phương án, mỗi phương án tối đa 500 ký tự. Hãy kiểm tra đáp án đúng.".into());
        }
        question.correct_options.sort_unstable();
        question.correct_options.dedup();
        if question.image_ids.len() > 300 {
            return Err("Mỗi câu hỏi được phép đính kèm tối đa 300 ảnh.".into());
        }
        for id in &question.image_ids {
            if id.len() != 64 || !image_exists.exists([id]).map_err(storage)? {
                return Err("Không tìm thấy ảnh đính kèm của câu hỏi.".into());
            }
        }
    }
    let exam = plan
        .exam_id
        .as_ref()
        .map(|id| crate::exams::find(db, class, id))
        .transpose()?;
    let source_ids = exam
        .as_ref()
        .map(|exam| {
            exam.questions
                .iter()
                .map(|q| q.id.as_str())
                .collect::<HashSet<_>>()
        })
        .unwrap_or(ids);
    if plan
        .turns
        .iter()
        .flatten()
        .any(|id| !source_ids.contains(id.as_str()))
    {
        return Err("Có lượt được gán câu hỏi không còn trong danh sách.".into());
    }
    let json = serde_json::to_string(&plan).map_err(|_| "Không thể lưu câu hỏi.")?;
    changed(
        db.execute(
            "UPDATE classrooms SET question_plan=?2 WHERE id=?1 AND deleted=0
         AND EXISTS (SELECT 1 FROM schools s WHERE s.id=classrooms.school_id AND s.deleted=0)",
            params![class, json],
        )
        .map_err(storage)?,
    )?;
    Ok(plan)
}

pub(crate) fn game_question_plan(db: &Connection, class: &str) -> Result<QuestionPlan> {
    let mut plan = question_plan(db, class)?;
    if let Some(id) = &plan.exam_id {
        plan.bank = crate::exams::find(db, class, id)?.questions;
    }
    Ok(plan)
}

pub fn save_question_plan(db: &mut Connection, class: &str, plan: QuestionPlan) -> Result<()> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    unlocked(&tx)?;
    write_question_plan(&tx, class, plan)?;
    tx.commit().map_err(storage)
}

pub(crate) fn append_word_questions(
    db: &mut Connection,
    class: &str,
    input: Vec<crate::question_images::ImportedQuestion>,
    images: Vec<String>,
) -> Result<QuestionPlan> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    unlocked(&tx)?;
    let mut plan = question_plan(&tx, class)?;
    if input.is_empty() || input.len() > 500 {
        return Err("Hãy nhập từ 1 đến 500 câu hỏi mỗi lần.".into());
    }
    let used: HashSet<_> = input
        .iter()
        .flat_map(|item| item.images.iter().copied())
        .collect();
    if used.len() != images.len() || used.iter().any(|&index| index >= images.len()) {
        return Err("Danh sách ảnh đính kèm không hợp lệ.".into());
    }
    let stored = crate::question_images::store(&tx, images)?;
    for item in input {
        plan.bank.push(Question {
            id: Uuid::new_v4().to_string(),
            text: item.text,
            answer: item.answer,
            options: item.options,
            correct_options: item.correct_options,
            image_ids: item
                .images
                .into_iter()
                .map(|index| stored[index].clone())
                .collect(),
        });
    }
    let updated = write_question_plan(&tx, class, plan)?;
    tx.commit().map_err(storage)?;
    Ok(updated)
}

fn questions_for_game(
    plan: &QuestionPlan,
    count: usize,
    rng: &mut impl Rng,
) -> Result<Vec<Question>> {
    if plan.bank.is_empty() {
        return Err("Hãy thêm ít nhất một câu trong mục Chuẩn bị câu hỏi của lớp.".into());
    }
    let mut fixed = std::collections::HashMap::new();
    let questions: std::collections::HashMap<_, _> =
        plan.bank.iter().map(|q| (q.id.as_str(), q)).collect();
    for (turn, id) in plan.turns.iter().take(count).enumerate() {
        if let Some(id) = id {
            fixed.insert(
                turn,
                *questions
                    .get(id.as_str())
                    .ok_or("Không tìm thấy câu hỏi đã gán.")?,
            );
        }
    }
    let assigned: HashSet<_> = fixed.values().map(|q| q.id.as_str()).collect();
    let mut pool: Vec<_> = plan
        .bank
        .iter()
        .filter(|q| !assigned.contains(q.id.as_str()))
        .collect();
    pool.shuffle(rng);
    Ok((0..count)
        .map(|turn| {
            if let Some(question) = fixed.get(&turn) {
                return (*question).clone();
            }
            if pool.is_empty() {
                pool.extend(plan.bank.iter());
                pool.shuffle(rng);
            }
            pool.pop().expect("question bank is nonempty").clone()
        })
        .collect())
}

pub fn start(db: &mut Connection, class: &str, settings: Settings) -> Result<Session> {
    start_with_questions(db, class, settings, None)
}

pub(crate) fn start_with_questions(
    db: &mut Connection,
    class: &str,
    mut settings: Settings,
    saved: Option<&[Question]>,
) -> Result<Session> {
    settings.validate()?;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    unlocked(&tx)?;
    let (school_name, class_name, school_theme): (String, String, String) = tx
        .query_row(
            "SELECT p.name,c.name,p.theme FROM classrooms c JOIN schools p ON c.school_id=p.id
         WHERE c.id=?1 AND c.deleted=0 AND p.deleted=0",
            [class],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(storage)?
        .ok_or("Không tìm thấy lớp học.")?;
    let eligible: usize = tx
        .query_row(
            "SELECT COUNT(*) FROM students WHERE classroom_id=?1 AND is_active=1 AND deleted=0",
            [class],
            |r| r.get(0),
        )
        .map_err(storage)?;
    if settings.count == 0
        || eligible == 0
        || (!settings.repeat_students && settings.count > eligible)
    {
        return Err(format!(
            "Số học sinh có thể chọn trong lớp này là {eligible}."
        ));
    }
    settings.questions = match saved {
        Some(questions) => questions.iter().cycle().take(settings.count).cloned().collect(),
        None if settings.with_questions => questions_for_game(
            &game_question_plan(&tx, class)?,
            settings.count,
            &mut rand::rng(),
        )?,
        None => Vec::new(),
    };
    let key = id();
    let json = serde_json::to_string(&settings).map_err(|_| "Không thể lưu cấu hình.")?;
    tx.execute("INSERT INTO game_sessions(id,classroom_id,school_name,classroom_name,target_count,selection_mode,settings,school_theme)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8)", params![key,class,school_name,class_name,settings.count,settings.mode,json,school_theme]).map_err(storage)?;
    let session = pending(&tx)?.ok_or("Không thể tải lượt vừa tạo.")?;
    tx.commit().map_err(storage)?;
    Ok(session)
}

pub fn draw_meteor(db: &mut Connection, key: &str, order: usize) -> Result<Selection> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    let mut session = pending(&tx)?
        .filter(|session| session.id == key)
        .ok_or("Không tìm thấy lượt đang chơi.")?;
    let next = session
        .results
        .iter()
        .filter(|pick| pick.selected_at.is_some())
        .count()
        + 1;
    if order != next || order > session.target_count {
        return Err("Thứ tự rơi của thiên thạch không hợp lệ.".into());
    }
    if let Some(existing) = session
        .results
        .pop()
        .filter(|pick| pick.selection_order == order)
    {
        return Ok(existing);
    }
    let candidates = collect(&tx,
        "SELECT s.id,COUNT(r.id) FROM students s
         LEFT JOIN selection_results r ON r.student_id=s.id AND r.selected_at IS NOT NULL
         WHERE s.classroom_id=?1 AND s.is_active=1 AND s.deleted=0
           AND (?3 OR NOT EXISTS(SELECT 1 FROM selection_results p WHERE p.session_id=?2 AND p.student_id=s.id))
         GROUP BY s.id",
        params![session.classroom_id,key,session.settings.repeat_students], |r| Ok((r.get::<_,String>(0)?,r.get::<_,u32>(1)?)))?;
    let cycle: HashSet<String> = if session.selection_mode == "cycle" {
        collect(
            &tx,
            "SELECT student_id FROM cycle_members WHERE classroom_id=?1",
            [&session.classroom_id],
            |r| r.get(0),
        )?
        .into_iter()
        .collect()
    } else {
        HashSet::new()
    };
    let (student, reset) = draw(
        &candidates,
        &cycle,
        &session.selection_mode,
        &mut rand::rng(),
    )
    .ok_or("Không còn học sinh đủ điều kiện.")?;
    tx.execute("INSERT INTO selection_results(id,session_id,student_id,full_name,student_code,selection_order,reset_cycle)
        SELECT ?1,?2,id,full_name,student_code,?4,?5 FROM students WHERE id=?3",
        params![id(),key,student,order,reset]).map_err(storage)?;
    attach(&tx, &mut session, true)?;
    let pick = session
        .results
        .pop()
        .ok_or("Không thể tải kết quả vừa chọn.")?;
    tx.commit().map_err(storage)?;
    Ok(pick)
}

pub fn reveal(db: &mut Connection, key: &str, order: usize) -> Result<Session> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(storage)?;
    let mut session = tx
        .query_row(
            &format!("SELECT {SESSION_FIELDS} FROM game_sessions WHERE id=?1"),
            [key],
            read_session,
        )
        .optional()
        .map_err(storage)?
        .ok_or("Không tìm thấy lượt chơi.")?;
    let (student, reset, selected): (String, bool, Option<String>) = tx.query_row(
        "SELECT student_id,reset_cycle,selected_at FROM selection_results WHERE session_id=?1 AND selection_order=?2",
        params![key,order], |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)))
        .optional().map_err(storage)?.ok_or("Không tìm thấy kết quả.")?;
    if selected.is_none() {
        let revealed: usize = tx.query_row("SELECT COUNT(*) FROM selection_results WHERE session_id=?1 AND selected_at IS NOT NULL", [key], |r| r.get(0)).map_err(storage)?;
        if session.finished_at.is_some() || order != revealed + 1 {
            return Err("Thứ tự công bố kết quả không hợp lệ.".into());
        }
        if session.selection_mode == "cycle" {
            if reset {
                tx.execute(
                    "DELETE FROM cycle_members WHERE classroom_id=?1",
                    [&session.classroom_id],
                )
                .map_err(storage)?;
            }
            tx.execute(
                "INSERT INTO cycle_members(classroom_id,student_id) VALUES (?1,?2)",
                params![session.classroom_id, student],
            )
            .map_err(storage)?;
        }
        tx.execute(&format!("UPDATE selection_results SET selected_at={NOW} WHERE session_id=?1 AND selection_order=?2"), params![key,order]).map_err(storage)?;
        if order == session.target_count {
            tx.execute(
                &format!("UPDATE game_sessions SET finished_at={NOW} WHERE id=?1"),
                [key],
            )
            .map_err(storage)?;
            session.finished_at = tx
                .query_row(
                    "SELECT finished_at FROM game_sessions WHERE id=?1",
                    [key],
                    |r| r.get(0),
                )
                .map_err(storage)?;
        }
    }
    let show_planned = !session.cancelled;
    attach(&tx, &mut session, show_planned)?;
    tx.commit().map_err(storage)?;
    Ok(session)
}
pub fn cancel(db: &Connection, key: &str) -> Result<()> {
    changed(db.execute(&format!("UPDATE game_sessions SET finished_at={NOW},cancelled=1 WHERE id=?1 AND finished_at IS NULL"), [key]).map_err(storage)?)
}

fn validate_backup(db: &Connection) -> Result<()> {
    let app: i64 = db
        .query_row("PRAGMA application_id", [], |r| r.get(0))
        .map_err(storage)?;
    let version: i64 = db
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(storage)?;
    let integrity: String = db
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(storage)?;
    let foreign_error = db
        .query_row("PRAGMA foreign_key_check", [], |_| Ok(()))
        .optional()
        .map_err(storage)?
        .is_some();
    let schema: i64 = db.query_row("SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND
        name IN ('schools','classrooms','students','game_sessions','selection_results','cycle_members')", [], |r| r.get(0)).map_err(storage)?;
    if app != APPLICATION_ID
        || !(1..=8).contains(&version)
        || integrity != "ok"
        || foreign_error
        || schema != 6
    {
        return Err("Tệp sao lưu không hợp lệ hoặc khác phiên bản.".into());
    }
    Ok(())
}
pub fn backup(db: &Connection, destination: &Path) -> Result<()> {
    let parent = destination
        .parent()
        .ok_or("Đường dẫn sao lưu không hợp lệ.")?;
    let temp = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Không thể tạo tệp sao lưu.")?;
    db.backup(rusqlite::MAIN_DB, temp.path(), None)
        .map_err(storage)?;
    temp.persist(destination)
        .map_err(|_| "Không thể ghi tệp sao lưu.")?;
    Ok(())
}
pub fn restore(db: &mut Connection, source: &Path, pro: bool) -> Result<()> {
    unlocked(db)?;
    let source =
        Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(storage)?;
    let mut staged = Connection::open_in_memory().map_err(storage)?;
    rusqlite::backup::Backup::new(&source, &mut staged)
        .map_err(storage)?
        .run_to_completion(128, Duration::from_millis(10), None)
        .map_err(storage)?;
    validate_backup(&staged)?;
    let migration = staged.transaction().map_err(storage)?;
    migrate(&migration)?;
    migration
        .prepare("SELECT id,bytes FROM question_images LIMIT 0")
        .map_err(storage)?;
    migration.commit().map_err(storage)?;
    schools(&staged)?;
    pending(&staged)?;
    history(&staged)?;
    crate::escape_room::list(&staged, None)?;
    crate::exams::list(&staged, None)?;
    crate::game_presets::list(&staged, None)?;
    if !pro {
        let over_limit: bool = staged.query_row(
            "SELECT (SELECT COUNT(*) FROM classrooms WHERE deleted=0) > ?1
                OR EXISTS(SELECT 1 FROM students WHERE deleted=0 GROUP BY classroom_id HAVING COUNT(*) > ?2)",
            params![crate::license::FREE_CLASSES,crate::license::FREE_STUDENTS], |row| row.get(0)
        ).map_err(storage)?;
        if over_limit {
            return Err("Bản sao lưu vượt giới hạn miễn phí. Kích hoạt Pro để khôi phục.".into());
        }
    }
    rusqlite::backup::Backup::new(&staged, db)
        .map_err(storage)?
        .run_to_completion(128, Duration::from_millis(10), None)
        .map_err(storage)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(db: &mut Connection) -> (String, String, Vec<String>) {
        let school = save_school(db, None, "Tiểu học Hoa Sen", None).unwrap();
        let class = save_classroom(db, &school, None, "Lớp 5A").unwrap();
        let ids = (0..3)
            .map(|n| save_student(db, &class, None, person("Nguyễn Minh Anh", n)).unwrap())
            .collect();
        (school, class, ids)
    }

    fn person(name: &str, n: usize) -> StudentInput {
        StudentInput {
            full_name: name.into(),
            student_code: Some(format!("{n:03}")),
            gender: None,
            is_active: true,
        }
    }

    fn settings(count: usize, mode: &str) -> Settings {
        Settings {
            count,
            mode: mode.into(),
            lead: 0,
            gap: 1,
            sound: false,
            shake: false,
            quality: "high".into(),
            speed: 1.0,
            music: Music::default(),
            meteor_style: MeteorStyle::default(),
            repeat_students: false,
            with_questions: false,
            questions: Vec::new(),
        }
    }

    #[test]
    fn word_import_migrates_legacy_backup_and_keeps_images_in_new_backup() {
        use crate::question_images::ImportedQuestion;
        const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X12sAAAAASUVORK5CYII=";
        let folder = tempfile::tempdir().unwrap();
        let original = folder.path().join("original.sqlite");
        let mut db = open(&original).unwrap();
        let (_, class, _) = sample(&mut db);
        save_question_plan(&mut db, &class, serde_json::from_str(
            r#"{"bank":[{"id":"old","text":"Câu đã có","answer":"Đáp án cũ"}],"turns":["old"]}"#
        ).unwrap()).unwrap();
        db.execute_batch("DROP TABLE game_presets; DROP TABLE question_images; PRAGMA user_version=6;")
            .unwrap();
        let legacy = folder.path().join("legacy.sqlite");
        backup(&db, &legacy).unwrap();
        let mut db = open(&folder.path().join("destination.sqlite")).unwrap();
        restore(&mut db, &legacy, false).unwrap();

        let question = |text: &str| ImportedQuestion {
            text: text.to_owned(),
            answer: None,
            options: vec!["Một".into(), "Hai".into()],
            correct_options: vec![1],
            images: vec![0],
        };
        assert!(
            append_word_questions(&mut db, &class, vec![question("")], vec![PNG.into()]).is_err()
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM question_images", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        let plan = append_word_questions(
            &mut db,
            &class,
            vec![
                question("Một cộng một bằng bao nhiêu?"),
                question("Hình minh họa có mấy phần?"),
            ],
            vec![PNG.into()],
        )
        .unwrap();
        assert_eq!(plan.bank.len(), 3);
        assert_eq!(plan.turns[0].as_deref(), Some("old"));
        assert_eq!(plan.bank[0].answer.as_deref(), Some("Đáp án cũ"));
        assert!(plan.bank[0].image_ids.is_empty());
        let id = &plan.bank[1].image_ids[0];
        assert_eq!(plan.bank[2].image_ids, [id.clone()]);
        let image = crate::question_images::read(&db, id).unwrap();
        assert!(image.starts_with(b"\x89PNG\r\n\x1a\n"));

        let backup_file = folder.path().join("with-images.sqlite");
        backup(&db, &backup_file).unwrap();
        let mut restored = open(&folder.path().join("restored.sqlite")).unwrap();
        restore(&mut restored, &backup_file, false).unwrap();
        let mut reloaded = question_plan(&restored, &class).unwrap();
        assert_eq!(&reloaded.bank[1].image_ids[0], id);
        assert_eq!(crate::question_images::read(&restored, id).unwrap(), image);

        reloaded.turns[0] = Some(reloaded.bank[1].id.clone());
        save_question_plan(&mut restored, &class, reloaded).unwrap();
        let mut config = settings(1, "random");
        config.with_questions = true;
        let game = start(&mut restored, &class, config).unwrap();
        assert_eq!(game.settings.questions[0].image_ids, [id.clone()]);
    }

    #[test]
    fn exam_turns_use_saved_questions_without_changing_the_bank() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("exam-turns.sqlite");
        let mut db = open(&path).unwrap();
        let school = save_school(&db, None, "Hoa Sen", None).unwrap();
        let class = save_classroom(&db, &school, None, "5A").unwrap();
        let other = save_classroom(&db, &school, None, "5B").unwrap();
        save_student(&mut db, &class, None, person("Minh", 1)).unwrap();
        let questions = serde_json::json!([
            {"id":"saved-a","text":"Câu trong đề A","answer":"Đáp án gốc"},
            {"id":"saved-b","text":"Câu trong đề B","answer":null}
        ]);
        db.execute(
            "INSERT INTO exams(id,classroom_id,title,questions) VALUES ('paper',?1,'Đề Toán',?2)",
            params![class, questions.to_string()],
        )
        .unwrap();
        let plan = |exam, turns| {
            serde_json::from_value(serde_json::json!({
            "bank":[{"id":"outside","text":"Ngoài đề","answer":null}], "examId":exam, "turns":turns
        })).unwrap()
        };
        assert!(save_question_plan(&mut db, &other, plan("paper", vec!["saved-b"])).is_err());
        assert!(save_question_plan(&mut db, &class, plan("paper", vec!["outside"])).is_err());
        save_question_plan(&mut db, &class, plan("paper", vec!["saved-b"])).unwrap();
        drop(db);
        let mut db = open(&path).unwrap();
        assert_eq!(question_plan(&db, &class).unwrap().bank[0].id, "outside");
        let mut config = settings(4, "random");
        config.repeat_students = true;
        config.with_questions = true;
        let room = start(&mut db, &class, config).unwrap();
        assert_eq!(room.settings.questions[0].id, "saved-b");
        assert!(room
            .settings
            .questions
            .iter()
            .all(|q| q.id.starts_with("saved-")));
        assert!(room
            .settings
            .questions
            .iter()
            .any(|q| q.answer.as_deref() == Some("Đáp án gốc")));
    }

    #[test]
    fn question_schedule_and_repeated_student_survive_resume() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.sqlite");
        let mut db = open(&path).unwrap();
        let school = save_school(&mut db, None, "Hoa Sen", None).unwrap();
        let class = save_classroom(&mut db, &school, None, "5A").unwrap();
        let student = save_student(&mut db, &class, None, person("Minh", 1)).unwrap();
        let mut config = settings(2, "random");
        config.repeat_students = true;
        config.with_questions = true;
        assert!(start(&mut db, &class, config.clone()).is_err());
        save_question_plan(
            &mut db,
            &class,
            QuestionPlan {
                exam_id: None,
                bank: vec![
                    Question {
                        id: "a".into(),
                        text: "2 + 3?".into(),
                        answer: Some("5".into()),
                        options: Vec::new(),
                        correct_options: Vec::new(),
                        image_ids: Vec::new(),
                    },
                    Question {
                        id: "b".into(),
                        text: "Em thích sách gì?".into(),
                        answer: None,
                        options: Vec::new(),
                        correct_options: Vec::new(),
                        image_ids: Vec::new(),
                    },
                ],
                turns: vec![Some("a".into()), None],
            },
        )
        .unwrap();
        let game = start(&mut db, &class, config).unwrap();
        assert_eq!(game.settings.questions[0].answer.as_deref(), Some("5"));
        assert_eq!(game.settings.questions[1].id, "b");
        assert_eq!(
            draw_meteor(&mut db, &game.id, 1).unwrap().student_id,
            student
        );
        drop(db);
        let mut db = open(&path).unwrap();
        let resumed = pending(&db).unwrap().unwrap();
        assert_eq!(resumed.settings.questions[1].id, "b");
        assert_eq!(
            draw_meteor(&mut db, &game.id, 1).unwrap().student_id,
            student
        );
        reveal(&mut db, &game.id, 1).unwrap();
        assert_eq!(
            draw_meteor(&mut db, &game.id, 2).unwrap().student_id,
            student
        );
        let finished = reveal(&mut db, &game.id, 2).unwrap();
        assert!(finished.finished_at.is_some());
        assert_eq!(finished.results.len(), 2);
    }

    #[test]
    fn free_limits_are_global_and_apply_to_imports_and_new_rounds() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = open(&dir.path().join("test.sqlite")).unwrap();
        let (_, class, _) = sample(&mut db);
        assert!(check_free_classes(&db).is_ok());
        let other = save_school(&db, None, "Trường khác", None).unwrap();
        save_classroom(&db, &other, None, "5B").unwrap();
        assert!(check_free_classes(&db).is_err());
        assert!(check_free_students(&db, &class, 27).is_ok());
        assert!(check_free_students(&db, &class, 28).is_err());
        assert!(settings(1, "random").check_license(false).is_ok());
        assert!(settings(2, "random").check_license(false).is_err());
        let mut custom = settings(1, "random");
        custom.music = Music::Arcade;
        assert!(custom.check_license(false).is_err());
        assert!(custom.check_license(true).is_ok());
        import_students(
            &mut db,
            &class,
            (0..28).map(|n| person("Học sinh", n)).collect(),
        )
        .unwrap();
        let copy = dir.path().join("over-limit.sqlite");
        backup(&db, &copy).unwrap();
        assert!(restore(&mut db, &copy, false).is_err());
        assert!(restore(&mut db, &copy, true).is_ok());
    }

    #[test]
    fn chibi_is_assigned_automatically_and_changes_only_with_gender() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = open(&dir.path().join("test.sqlite")).unwrap();
        let school = save_school(&db, None, "Hoa Sen", None).unwrap();
        let class = save_classroom(&db, &school, None, "5A").unwrap();
        let input = |gender: &str| StudentInput {
            gender: Some(gender.into()),
            ..person("Minh Anh", 1)
        };
        let id = save_student(&mut db, &class, None, input("male")).unwrap();
        let initial = students(&db, &class).unwrap().remove(0);
        assert_eq!(initial.gender.as_deref(), Some("male"));
        assert!(initial.character_variant < 24);
        save_student(&mut db, &class, Some(id.clone()), input("male")).unwrap();
        assert_eq!(
            students(&db, &class).unwrap()[0].character_variant,
            initial.character_variant
        );
        save_student(&mut db, &class, Some(id), input("female")).unwrap();
        let updated = students(&db, &class).unwrap().remove(0);
        assert_eq!(updated.gender.as_deref(), Some("female"));
        assert_ne!(updated.character_variant, initial.character_variant);
        assert!(updated.character_variant < 24);
    }

    #[test]
    fn migration_foreign_keys_crud_and_transactional_import() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("data.sqlite");
        let mut db = open(&path).unwrap();
        assert!(db
            .execute(
                "INSERT INTO classrooms(id,school_id,name,name_key) VALUES ('x','missing','a','a')",
                []
            )
            .is_err());
        let (school, class, ids) = sample(&mut db);
        assert_eq!(schools(&db).unwrap()[0].count, 1);
        assert_eq!(classrooms(&db, &school).unwrap()[0].count, 3);
        assert!(save_classroom(&db, &school, None, "  LỚP   5a ").is_err());
        save_school(&db, Some(school.clone()), "Tiểu học Hoa Mai", None).unwrap();
        save_classroom(&db, &school, Some(class.clone()), "Lớp 5B").unwrap();
        save_student(
            &mut db,
            &class,
            Some(ids[0].clone()),
            person("Trần Bình", 7),
        )
        .unwrap();
        assert_eq!(schools(&db).unwrap()[0].name, "Tiểu học Hoa Mai");
        assert_eq!(classrooms(&db, &school).unwrap()[0].name, "Lớp 5B");
        assert_eq!(students(&db, &class).unwrap()[0].full_name, "Trần Bình");
        assert!(
            import_students(&mut db, &class, vec![person("Hợp lệ", 1), person("", 2)]).is_err()
        );
        assert_eq!(students(&db, &class).unwrap().len(), 3);
        assert_eq!(
            import_students(
                &mut db,
                &class,
                (0..100).map(|n| person("Trần Hà", n)).collect()
            )
            .unwrap(),
            100
        );
        archive(&mut db, "student", &ids[1]).unwrap();
        assert_eq!(students(&db, &class).unwrap().len(), 102);
        archive(&mut db, "classroom", &class).unwrap();
        assert!(classrooms(&db, &school).unwrap().is_empty());
        assert!(students(&db, &class).unwrap().is_empty());
        archive(&mut db, "school", &school).unwrap();
        drop(db);
        assert!(schools(&open(&path).unwrap()).unwrap().is_empty());
    }

    #[test]
    fn pending_plan_and_cycle_survive_restart_and_history_keeps_snapshots() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("data.sqlite");
        let mut db = open(&path).unwrap();
        let (school, class, _) = sample(&mut db);
        let first = start(&mut db, &class, settings(2, "cycle")).unwrap();
        assert!(start(&mut db, &class, settings(1, "cycle")).is_err());
        assert!(reveal(&mut db, &first.id, 2).is_err());
        assert!(first.results.is_empty());
        assert!(draw_meteor(&mut db, &first.id, 2).is_err());
        assert!(reveal(&mut db, &first.id, 1).is_err());
        draw_meteor(&mut db, &first.id, 1).unwrap();
        reveal(&mut db, &first.id, 1).unwrap();
        let in_flight = draw_meteor(&mut db, &first.id, 2).unwrap();
        drop(db);
        let mut db = open(&path).unwrap();
        let resumed = pending(&db).unwrap().unwrap();
        assert_eq!(first.id, resumed.id);
        assert_eq!(in_flight.student_id, resumed.results[1].student_id);
        assert_eq!(
            draw_meteor(&mut db, &first.id, 2).unwrap().student_id,
            in_flight.student_id
        );
        let time = resumed.results[0].selected_at.clone();
        assert_eq!(
            reveal(&mut db, &first.id, 1).unwrap().results[0].selected_at,
            time
        );
        reveal(&mut db, &first.id, 2).unwrap();
        drop(db);
        let mut db = open(&path).unwrap();
        let second = start(&mut db, &class, settings(3, "cycle")).unwrap();
        assert!(second.results.is_empty());
        let pick = draw_meteor(&mut db, &second.id, 1).unwrap();
        assert!(resumed
            .results
            .iter()
            .all(|p| p.student_id != pick.student_id));
        reveal(&mut db, &second.id, 1).unwrap();
        let second_pick = draw_meteor(&mut db, &second.id, 2).unwrap();
        assert_ne!(pick.student_id, second_pick.student_id);
        cancel(&db, &second.id).unwrap();
        archive(&mut db, "school", &school).unwrap();
        let log = history(&db).unwrap();
        assert!(log[0].cancelled);
        assert_eq!(log[0].results.len(), 1);
        assert_eq!(log[1].results.len(), 2);
        assert_eq!(log[0].school_name, "Tiểu học Hoa Sen");
        assert_eq!(log[0].results[0].full_name, "Nguyễn Minh Anh");
    }

    #[test]
    fn legacy_backup_keeps_revealed_history_and_removes_preselected_targets() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("legacy.sqlite");
        let legacy = Connection::open(&path).unwrap();
        legacy
            .execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        legacy
            .execute_batch(
                "INSERT INTO schools(id,name) VALUES ('s','Hoa Sen');
            INSERT INTO classrooms(id,school_id,name,name_key) VALUES ('c','s','5A','5a');
            INSERT INTO students(id,classroom_id,full_name,character_variant)
                VALUES ('a','c','Minh Anh',1),('b','c','Ngọc Anh',2);",
            )
            .unwrap();
        let json = serde_json::to_string(&settings(2, "random")).unwrap();
        legacy.execute("INSERT INTO game_sessions(id,classroom_id,school_name,classroom_name,target_count,selection_mode,settings)
            VALUES ('g','c','Hoa Sen','5A',2,'random',?1)", [json]).unwrap();
        legacy.execute_batch("INSERT INTO selection_results(id,session_id,student_id,full_name,selection_order,selected_at)
            VALUES ('r1','g','a','Minh Anh',1,'2026-11-13'),('r2','g','b','Ngọc Anh',2,NULL);").unwrap();
        drop(legacy);
        let mut db = open(&tmp.path().join("data.sqlite")).unwrap();
        restore(&mut db, &path, false).unwrap();
        let restored = pending(&db).unwrap().unwrap();
        assert_eq!(restored.results.len(), 1);
        assert_eq!(restored.results[0].student_id, "a");
        assert!(students(&db, "c")
            .unwrap()
            .iter()
            .all(|student| student.gender.is_none()));
        assert_eq!(draw_meteor(&mut db, "g", 2).unwrap().student_id, "b");
    }

    #[test]
    fn backup_and_restore_preserve_roster_and_history() {
        let tmp = tempfile::tempdir().unwrap();
        let backup_path = tmp.path().join("backup.sqlite");
        let mut db = open(&tmp.path().join("data.sqlite")).unwrap();
        let (school, class, _) = sample(&mut db);
        let game = start(&mut db, &class, settings(1, "random")).unwrap();
        draw_meteor(&mut db, &game.id, 1).unwrap();
        reveal(&mut db, &game.id, 1).unwrap();
        backup(&db, &backup_path).unwrap();
        backup(&db, &backup_path).unwrap();
        archive(&mut db, "school", &school).unwrap();
        let invalid = tmp.path().join("invalid.sqlite");
        std::fs::write(&invalid, "not a database").unwrap();
        assert!(restore(&mut db, &invalid, false).is_err());
        assert!(schools(&db).unwrap().is_empty());
        restore(&mut db, &backup_path, false).unwrap();
        assert_eq!(schools(&db).unwrap()[0].id, school);
        assert_eq!(students(&db, &class).unwrap().len(), 3);
        assert_eq!(history(&db).unwrap()[0].id, game.id);
        assert!(db
            .execute(
                "INSERT INTO classrooms(id,school_id,name,name_key) VALUES ('x','missing','a','a')",
                []
            )
            .is_err());
    }
}
