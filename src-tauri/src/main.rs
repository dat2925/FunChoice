#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod knight_rescue;
mod escape_room;
mod exams;
mod game_presets;
mod license;
mod payments;
mod question_images;
mod selection;

use db::{Classroom, Result, School, Session, Settings, Student, StudentInput};
use license::{License, LicenseInfo};
use rusqlite::Connection;
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};

struct Data {
    connection: Mutex<Connection>,
    path: PathBuf,
    music_path: PathBuf,
    license: Mutex<License>,
}
impl Data {
    fn access<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T>) -> Result<T> {
        let mut db = self
            .connection
            .lock()
            .map_err(|_| "Không thể khóa dữ liệu.")?;
        f(&mut db)
    }
    fn with_license<T>(&self, f: impl FnOnce(&mut License) -> Result<T>) -> Result<T> {
        let mut license = self
            .license
            .lock()
            .map_err(|_| "Không thể đọc trạng thái Pro.")?;
        f(&mut license)
    }
    fn licensed<T>(&self, f: impl FnOnce(&mut Connection, bool) -> Result<T>) -> Result<T> {
        self.access(|db| self.with_license(|license| f(db, license.pro())))
    }
    fn check_file(&self, path: &Path) -> Result<()> {
        if path
            .extension()
            .and_then(|s| s.to_str())
            .is_none_or(|s| !s.eq_ignore_ascii_case("sqlite"))
        {
            return Err("Vui lòng chọn tệp có đuôi .sqlite.".into());
        }
        if path
            .canonicalize()
            .ok()
            .zip(self.path.canonicalize().ok())
            .is_some_and(|(a, b)| a == b)
        {
            return Err("Hãy chọn một tệp khác với cơ sở dữ liệu đang sử dụng.".into());
        }
        Ok(())
    }
}

const MAX_MP3_BYTES: u64 = 50 * 1024 * 1024;

#[tauri::command]
fn set_background_music(data: State<Data>, path: PathBuf) -> Result<()> {
    use std::io::{Read, Write};
    data.with_license(|license| {
        if !license.pro() {
            return Err("Kích hoạt Pro để dùng nhạc MP3.".into());
        }
        if !path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("mp3"))
        {
            return Err("Hãy chọn tệp .mp3.".into());
        }
        let file = std::fs::File::open(&path).map_err(|_| "Không mở được tệp MP3.")?;
        let metadata = file.metadata().map_err(|_| "Không đọc được tệp MP3.")?;
        if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_MP3_BYTES {
            return Err("Tệp MP3 phải có dung lượng từ 1 byte đến 50 MB.".into());
        }
        let mut bytes = Vec::new();
        file.take(MAX_MP3_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Không đọc được tệp MP3.")?;
        if bytes.len() as u64 > MAX_MP3_BYTES
            || !(bytes.starts_with(b"ID3")
                || bytes.first() == Some(&0xff)
                    && bytes.get(1).is_some_and(|byte| byte & 0xe0 == 0xe0))
        {
            return Err("Tệp không có định dạng MP3 hợp lệ hoặc vượt quá 50 MB.".into());
        }
        let dir = data
            .music_path
            .parent()
            .ok_or("Không tìm thấy thư mục nhạc nền.")?;
        let mut temp =
            tempfile::NamedTempFile::new_in(dir).map_err(|_| "Không thể lưu nhạc nền.")?;
        temp.write_all(&bytes)
            .map_err(|_| "Không thể lưu nhạc nền.")?;
        temp.persist(&data.music_path)
            .map_err(|_| "Không thể lưu nhạc nền.")?;
        Ok(())
    })
}

#[tauri::command]
fn background_music(data: State<Data>) -> Result<tauri::ipc::Response> {
    data.with_license(|license| {
        if !license.pro() {
            return Err("Kích hoạt Pro để dùng nhạc MP3.".into());
        }
        let bytes = std::fs::read(&data.music_path)
            .map_err(|_| "Hãy chọn một tệp MP3 trong phần cấu hình.")?;
        Ok(tauri::ipc::Response::new(bytes))
    })
}

#[tauri::command]
fn has_background_music(data: State<Data>) -> bool {
    data.music_path.is_file()
}

#[tauri::command]
fn license_info(data: State<Data>) -> Result<LicenseInfo> {
    data.with_license(|license| Ok(license.info()))
}

#[tauri::command]
fn activate_pro(data: State<Data>, key: String) -> Result<LicenseInfo> {
    data.with_license(|license| license.activate(&key))
}

#[tauri::command]
fn list_schools(data: State<Data>) -> Result<Vec<School>> {
    data.access(|db| db::schools(db))
}
#[tauri::command]
fn list_classrooms(data: State<Data>, school_id: String) -> Result<Vec<Classroom>> {
    data.access(|db| db::classrooms(db, &school_id))
}
#[tauri::command]
fn list_students(data: State<Data>, classroom_id: String) -> Result<Vec<Student>> {
    data.access(|db| db::students(db, &classroom_id))
}
#[tauri::command]
fn save_school(
    data: State<Data>,
    id: Option<String>,
    name: String,
    theme: Option<String>,
) -> Result<String> {
    data.access(|db| db::save_school(db, id, &name, theme.as_deref()))
}
#[tauri::command]
fn save_classroom(
    data: State<Data>,
    school_id: String,
    id: Option<String>,
    name: String,
) -> Result<String> {
    data.licensed(|db, pro| {
        if !pro && id.is_none() {
            db::check_free_classes(db)?;
        }
        db::save_classroom(db, &school_id, id, &name)
    })
}
#[tauri::command]
fn save_student(
    data: State<Data>,
    classroom_id: String,
    id: Option<String>,
    student: StudentInput,
) -> Result<String> {
    data.licensed(|db, pro| {
        if !pro && id.is_none() {
            db::check_free_students(db, &classroom_id, 1)?;
        }
        db::save_student(db, &classroom_id, id, student)
    })
}
#[tauri::command]
fn import_students(
    data: State<Data>,
    classroom_id: String,
    students: Vec<StudentInput>,
) -> Result<usize> {
    data.licensed(|db, pro| {
        if !pro {
            db::check_free_students(db, &classroom_id, students.len())?;
        }
        db::import_students(db, &classroom_id, students)
    })
}
#[tauri::command]
fn archive(data: State<Data>, kind: String, id: String) -> Result<()> {
    data.access(|db| db::archive(db, &kind, &id))
}
#[tauri::command]
fn history(data: State<Data>) -> Result<Vec<Session>> {
    data.access(|db| db::history(db))
}
#[tauri::command]
fn pending_game(data: State<Data>) -> Result<Option<Session>> {
    data.access(|db| db::pending(db))
}
#[tauri::command]
fn class_question_plan(data: State<Data>, classroom_id: String) -> Result<db::QuestionPlan> {
    data.access(|db| db::question_plan(db, &classroom_id))
}
#[tauri::command]
fn save_class_question_plan(
    data: State<Data>,
    classroom_id: String,
    plan: db::QuestionPlan,
) -> Result<()> {
    data.access(|db| db::save_question_plan(db, &classroom_id, plan))
}
#[tauri::command]
fn start_game(data: State<Data>, classroom_id: String, settings: Settings) -> Result<Session> {
    data.licensed(|db, pro| {
        settings.check_license(pro)?;
        if settings.music == db::Music::Mp3 && !data.music_path.is_file() {
            return Err("Hãy chọn một tệp MP3 trong phần cấu hình.".into());
        }
        db::start(db, &classroom_id, settings)
    })
}
#[tauri::command]
fn draw_meteor(data: State<Data>, id: String, order: usize) -> Result<db::Selection> {
    data.access(|db| db::draw_meteor(db, &id, order))
}
#[tauri::command]
fn reveal(data: State<Data>, id: String, order: usize) -> Result<Session> {
    data.access(|db| db::reveal(db, &id, order))
}
#[tauri::command]
fn cancel_game(data: State<Data>, id: String) -> Result<()> {
    data.access(|db| db::cancel(db, &id))
}
#[tauri::command]
async fn backup(app: tauri::AppHandle, path: PathBuf) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = app.state::<Data>();
        data.check_file(&path)?;
        data.access(|db| db::backup(db, &path))
    })
    .await
    .map_err(|_| "Không thể hoàn tất sao lưu.")?
}
#[tauri::command]
async fn restore(app: tauri::AppHandle, path: PathBuf) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = app.state::<Data>();
        data.check_file(&path)?;
        data.licensed(|db, pro| db::restore(db, &path, pro))
    })
    .await
    .map_err(|_| "Không thể hoàn tất khôi phục.")?
}

fn main() {
    let context = tauri::generate_context!();
    let check_assets = std::env::args_os()
        .nth(1)
        .is_some_and(|arg| arg == "--check-assets");
    if check_assets || !tauri::is_dev() {
        let index = context
            .assets()
            .get(&tauri::utils::assets::AssetKey::from("index.html"));
        let ready = index.as_deref().is_some_and(|bytes| {
            let Ok(html) = std::str::from_utf8(bytes) else {
                return false;
            };
            let mut assets = html
                .split('"')
                .filter(|value| value.starts_with("/assets/"))
                .peekable();
            assets.peek().is_some()
                && assets.all(|path| {
                    context
                        .assets()
                        .get(&tauri::utils::assets::AssetKey::from(path))
                        .is_some_and(|bytes| !bytes.is_empty())
                })
        });
        if !ready {
            eprintln!("FunChoice: thiếu index.html hoặc tài nguyên giao diện đã đóng gói.");
            std::process::exit(1);
        }
        if check_assets {
            return;
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            #[cfg(debug_assertions)]
            let dir = std::env::var_os("SOLOTECH_TEST_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(dir);
            std::fs::create_dir_all(&dir)?;
            let path = dir.join("classroom.sqlite");
            let connection = db::open(&path).map_err(std::io::Error::other)?;
            app.manage(Data {
                connection: Mutex::new(connection),
                path,
                music_path: dir.join("background.mp3"),
                license: Mutex::new(License::load(&dir)),
            });
            app.manage(payments::Payments::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_background_music,
            background_music,
            has_background_music,
            license_info,
            activate_pro,
            payments::pro_purchase_available,
            payments::pro_plans,
            payments::pro_create_order,
            payments::pro_order_status,
            payments::pro_claim,
            payments::pro_recover,
            payments::pro_open_checkout,
            list_schools,
            list_classrooms,
            list_students,
            save_school,
            save_classroom,
            save_student,
            import_students,
            archive,
            history,
            pending_game,
            class_question_plan,
            save_class_question_plan,
            question_images::append_word_questions,
            question_images::question_image,
            exams::list_exams,
            exams::save_exam,
            exams::delete_exam,
            escape_room::escape_start,
            knight_rescue::knight_save,
            knight_rescue::knight_list,
            escape_room::escape_restart,
            game_presets::list_game_presets,
            game_presets::save_game_preset,
            game_presets::delete_game_preset,
            game_presets::start_meteor_preset,
            game_presets::start_escape_preset,
            escape_room::escape_list,
            escape_room::escape_action,
            start_game,
            draw_meteor,
            reveal,
            cancel_game,
            backup,
            restore
        ])
        .run(context)
        .expect("Không thể khởi động FunChoice");
}
