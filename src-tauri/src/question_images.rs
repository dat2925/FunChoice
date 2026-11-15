use crate::{
    db::{self, QuestionPlan, Result},
    Data,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::{ipc::Response, Manager, State};

const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;
const MAX_BATCH_BYTES: usize = 24 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImportedQuestion {
    pub(crate) text: String,
    pub(crate) answer: Option<String>,
    pub(crate) options: Vec<String>,
    pub(crate) correct_options: Vec<usize>,
    pub(crate) images: Vec<usize>,
}

pub(crate) fn store(db: &Connection, images: Vec<String>) -> Result<Vec<String>> {
    if images.len() > 300 {
        return Err("Chỉ có thể lưu tối đa 300 ảnh mỗi lần.".into());
    }
    let mut total = 0;
    let mut insert = db
        .prepare_cached("INSERT OR IGNORE INTO question_images (id,bytes) VALUES (?1,?2)")
        .map_err(db::storage)?;
    // Immutable assets remain available to exam and game snapshots after a bank edit.
    images
        .into_iter()
        .map(|encoded| {
            if encoded.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
                return Err("Ảnh vượt quá 5 MB.".into());
            }
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|_| "Dữ liệu ảnh không hợp lệ.")?;
            if bytes.len() > MAX_IMAGE_BYTES
                || !(bytes.starts_with(b"\x89PNG\r\n\x1a\n") || bytes.starts_with(b"\xff\xd8\xff"))
            {
                return Err("Ảnh không hợp lệ hoặc lớn hơn 5 MB. Hãy dùng PNG hoặc JPEG.".into());
            }
            total += bytes.len();
            if total > MAX_BATCH_BYTES {
                return Err("Tổng dung lượng ảnh vượt 24 MB.".into());
            }
            let id = hex::encode(Sha256::digest(&bytes));
            insert.execute(params![id, bytes]).map_err(db::storage)?;
            Ok(id)
        })
        .collect()
}

pub(crate) fn read(db: &Connection, id: &str) -> Result<Vec<u8>> {
    db.query_row(
        "SELECT bytes FROM question_images WHERE id=?1",
        [id],
        |row| row.get(0),
    )
    .optional()
    .map_err(db::storage)?
    .ok_or_else(|| "Không tìm thấy ảnh đính kèm.".into())
}

#[tauri::command]
pub(crate) async fn append_word_questions(
    app: tauri::AppHandle,
    classroom_id: String,
    questions: Vec<ImportedQuestion>,
    images: Vec<String>,
) -> Result<QuestionPlan> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<Data>()
            .access(|db| db::append_word_questions(db, &classroom_id, questions, images))
    })
    .await
    .map_err(|_| "Không thể hoàn tất nhập câu hỏi Word.")?
}

#[tauri::command]
pub(crate) fn question_image(data: State<Data>, id: String) -> Result<Response> {
    data.access(|db| read(db, &id).map(Response::new))
}
