use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{
    utils::config::WebviewUrl, AppHandle, Manager, WebviewWindowBuilder, Window, WindowEvent,
};

use crate::recent_files::{
    is_supported_markdown_path, recent_files_store_path, upsert_recent_file_in_path,
};
use crate::startup_window::{startup_background_color_for_app, startup_boot_theme_script};
use crate::window_state::{get_window_state_for_path, WindowState};

const READER_WINDOW_RESTORED_WIDTH: f64 = 1320.0;
const READER_WINDOW_RESTORED_HEIGHT: f64 = 560.0;
const READER_WINDOW_MIN_WIDTH: f64 = 1320.0;
const READER_WINDOW_MIN_HEIGHT: f64 = 560.0;

#[derive(Debug, Default)]
pub struct ReaderWindowRegistry {
    file_path_to_window_label: Mutex<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedReaderWindow {
    pub path: String,
    pub file_name: String,
    pub window_label: String,
    pub created: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReaderWindowBootstrap {
    window_kind: &'static str,
    file: ReaderWindowFile,
    window_state: Option<WindowState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReaderWindowFile {
    path: String,
    file_name: String,
    content: String,
    opened_at: u64,
    file_size: u64,
    modified_at: Option<String>,
}

#[tauri::command]
pub async fn open_reader_window(
    app: AppHandle,
    path: String,
    source_window_label: Option<String>,
) -> Result<OpenedReaderWindow, String> {
    let source_window_label = source_window_label.as_deref();
    hide_source_window_before_open(&app, source_window_label)?;
    let opened = match open_reader_window_for_path(&app, path) {
        Ok(opened) => opened,
        Err(error) => {
            show_source_window_after_open_failure(&app, source_window_label)?;
            return Err(error);
        }
    };
    close_source_window_after_open(&app, source_window_label, &opened.window_label)?;

    Ok(opened)
}

pub fn open_reader_window_for_path(
    app: &AppHandle,
    path: impl AsRef<Path>,
) -> Result<OpenedReaderWindow, String> {
    let normalized_path = normalize_markdown_path(path)?;
    let window_label = reader_window_label(&normalized_path);
    let file_name = Path::new(&normalized_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&normalized_path)
        .to_string();

    if let Some(existing_label) = app
        .state::<ReaderWindowRegistry>()
        .window_label_for_path(&normalized_path)
    {
        if app.get_webview_window(&existing_label).is_some() {
            focus_existing_reader_window(app, existing_label.clone())?;
            return Ok(OpenedReaderWindow {
                path: normalized_path,
                file_name,
                window_label: existing_label,
                created: false,
            });
        }

        app.state::<ReaderWindowRegistry>()
            .unregister_window_label(&existing_label);
    }

    if let Some(window) = app.get_webview_window(&window_label) {
        app.state::<ReaderWindowRegistry>()
            .register(normalized_path.clone(), window_label.clone());
        let _ = window;
        focus_existing_reader_window(app, window_label.clone())?;
        return Ok(OpenedReaderWindow {
            path: normalized_path,
            file_name,
            window_label,
            created: false,
        });
    }

    let file = read_markdown_file(&normalized_path)?;
    allow_markdown_asset_directory(app, &normalized_path)?;
    let window_state = get_window_state_for_path(app, &normalized_path).unwrap_or(None);
    let opened_at = current_timestamp_ms();
    let store_path = recent_files_store_path(app)?;
    upsert_recent_file_in_path(&store_path, Path::new(&normalized_path), opened_at)
        .map_err(|error| error.to_string())?;

    let bootstrap = ReaderWindowBootstrap {
        window_kind: "reader",
        file: ReaderWindowFile {
            path: file.path.clone(),
            file_name: file.file_name.clone(),
            content: file.content,
            opened_at,
            file_size: file.file_size,
            modified_at: file.modified_at,
        },
        window_state: window_state.clone(),
    };
    let initialization_script = format!(
        "window.__ONLY_MD_READER_BOOTSTRAP__ = {};{}",
        serde_json::to_string(&bootstrap).map_err(|error| error.to_string())?,
        startup_boot_theme_script(app)
    );
    let background_color = startup_background_color_for_app(app);

    create_reader_window(
        app,
        window_label.clone(),
        format!("{file_name} - MD极简阅读"),
        background_color,
        initialization_script,
    )?;

    app.state::<ReaderWindowRegistry>()
        .register(normalized_path.clone(), window_label.clone());

    Ok(OpenedReaderWindow {
        path: normalized_path,
        file_name,
        window_label,
        created: true,
    })
}

fn read_markdown_file(path: impl AsRef<Path>) -> Result<ReaderWindowFile, String> {
    let normalized_path = normalize_markdown_path(path)?;
    let file_name = Path::new(&normalized_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&normalized_path)
        .to_string();
    let metadata = fs::metadata(&normalized_path)
        .map_err(|error| format!("读取 Markdown 文件元数据失败：{error}"))?;
    let modified_at = metadata
        .modified()
        .ok()
        .map(|modified| system_time_ms(modified).to_string());
    let content = fs::read_to_string(&normalized_path).map_err(format_read_markdown_error)?;

    Ok(ReaderWindowFile {
        path: normalized_path,
        file_name,
        content,
        opened_at: 0,
        file_size: metadata.len(),
        modified_at,
    })
}

fn format_read_markdown_error(error: std::io::Error) -> String {
    format!("读取 Markdown 文件失败：{}", error)
}

fn allow_markdown_asset_directory(app: &AppHandle, path: &str) -> Result<(), String> {
    let directory = Path::new(path)
        .parent()
        .ok_or_else(|| "无法解析 Markdown 文件所在目录。".to_string())?;

    app.asset_protocol_scope()
        .allow_directory(directory, true)
        .map_err(|error| format!("允许 Markdown 图片资源目录失败：{}", error))
}

pub fn handle_window_event(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        window
            .app_handle()
            .state::<ReaderWindowRegistry>()
            .unregister_window_label(window.label());
    }
}

pub fn open_startup_markdown_arg(app: &AppHandle) -> Result<bool, String> {
    let Some(path) = first_supported_markdown_arg(
        std::env::args_os().map(|arg| arg.to_string_lossy().into_owned()),
    ) else {
        return Ok(false);
    };

    open_reader_window_for_path(app, path).map(|_| true)
}

pub fn normalize_markdown_path(path: impl AsRef<Path>) -> Result<String, String> {
    let path = path.as_ref();

    if !is_supported_markdown_path(path) {
        return Err("只支持打开 .md 或 .markdown 文件。".to_string());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("无法打开文件：{}", error))?;

    if !canonical_path.is_file() {
        return Err("路径不是一个 Markdown 文件。".to_string());
    }

    Ok(canonical_path.to_string_lossy().to_string())
}

pub fn reader_window_label(path: impl AsRef<Path>) -> String {
    let key = registry_key_for_path(path.as_ref().to_string_lossy().as_ref());
    format!("reader-{:016x}", stable_hash(key.as_bytes()))
}

pub fn first_supported_markdown_arg<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .map(|arg| arg.as_ref().to_string())
        .find(|arg| is_supported_markdown_path(arg))
}

impl ReaderWindowRegistry {
    fn register(&self, normalized_path: String, window_label: String) {
        self.file_path_to_window_label
            .lock()
            .expect("reader window registry lock poisoned")
            .insert(registry_key_for_path(&normalized_path), window_label);
    }

    fn window_label_for_path(&self, normalized_path: &str) -> Option<String> {
        self.file_path_to_window_label
            .lock()
            .expect("reader window registry lock poisoned")
            .get(&registry_key_for_path(normalized_path))
            .cloned()
    }

    fn unregister_window_label(&self, window_label: &str) {
        self.file_path_to_window_label
            .lock()
            .expect("reader window registry lock poisoned")
            .retain(|_, label| label != window_label);
    }
}

fn create_reader_window(
    app: &AppHandle,
    window_label: String,
    title: String,
    background_color: tauri::utils::config::Color,
    initialization_script: String,
) -> Result<(), String> {
    let builder =
        WebviewWindowBuilder::new(app, &window_label, WebviewUrl::App("index.html".into()))
            .title(title)
            .inner_size(READER_WINDOW_RESTORED_WIDTH, READER_WINDOW_RESTORED_HEIGHT)
            .min_inner_size(READER_WINDOW_MIN_WIDTH, READER_WINDOW_MIN_HEIGHT)
            .resizable(true)
            .maximizable(true)
            .maximized(true)
            .visible(false)
            .background_color(background_color)
            .initialization_script(initialization_script);

    builder
        .build()
        .map(|_| ())
        .map_err(|error| format!("创建阅读窗口失败：{}", error))
}

fn hide_source_window_before_open(
    app: &AppHandle,
    source_window_label: Option<&str>,
) -> Result<(), String> {
    let Some("main") = source_window_label else {
        return Ok(());
    };

    if let Some(window) = app.get_webview_window("main") {
        window
            .hide()
            .map_err(|error| format!("hide source open-file window failed: {}", error))?;
    }

    Ok(())
}

fn show_source_window_after_open_failure(
    app: &AppHandle,
    source_window_label: Option<&str>,
) -> Result<(), String> {
    let Some("main") = source_window_label else {
        return Ok(());
    };

    if let Some(window) = app.get_webview_window("main") {
        window
            .show()
            .map_err(|error| format!("show source open-file window failed: {}", error))?;
        window
            .set_focus()
            .map_err(|error| format!("focus source open-file window failed: {}", error))?;
    }

    Ok(())
}

fn close_source_window_after_open(
    app: &AppHandle,
    source_window_label: Option<&str>,
    opened_window_label: &str,
) -> Result<(), String> {
    let Some(source_window_label) = source_window_label else {
        return Ok(());
    };

    if source_window_label == opened_window_label {
        return Ok(());
    }

    if let Some(window) = app.get_webview_window(source_window_label) {
        window
            .close()
            .map_err(|error| format!("关闭打开文件窗口失败：{}", error))?;
    }

    Ok(())
}

fn focus_existing_reader_window(app: &AppHandle, window_label: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&window_label)
        .ok_or_else(|| "已有阅读窗口不存在。".to_string())?;

    if window
        .is_minimized()
        .map_err(|error| format!("检查阅读窗口最小化状态失败：{}", error))?
    {
        window
            .unminimize()
            .map_err(|error| format!("恢复阅读窗口失败：{}", error))?;
    }

    window
        .set_focus()
        .map_err(|error| format!("聚焦已有阅读窗口失败：{}", error))
}

fn registry_key_for_path(path: &str) -> String {
    if cfg!(windows) {
        path.to_ascii_lowercase()
    } else {
        path.to_string()
    }
}

fn stable_hash(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;

    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }

    hash
}

fn current_timestamp_ms() -> u64 {
    system_time_ms(SystemTime::now())
}

fn system_time_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        first_supported_markdown_arg, format_read_markdown_error, normalize_markdown_path,
        read_markdown_file, reader_window_label,
    };

    #[test]
    fn normalizes_existing_markdown_files_to_absolute_canonical_paths() {
        let dir = unique_test_dir("normalize");
        fs::create_dir_all(dir.join("notes")).unwrap();
        let markdown = dir.join("notes").join("readme.md");
        fs::write(&markdown, "# Readme").unwrap();

        let relative_shape = dir.join("notes").join("..").join("notes").join("readme.md");
        let normalized = normalize_markdown_path(relative_shape).unwrap();

        assert_eq!(
            normalized,
            markdown.canonicalize().unwrap().to_string_lossy()
        );
    }

    #[test]
    fn rejects_non_markdown_or_missing_paths_before_window_creation() {
        let dir = unique_test_dir("reject");
        fs::create_dir_all(&dir).unwrap();
        let text_file = dir.join("notes.txt");
        fs::write(&text_file, "plain text").unwrap();

        assert!(normalize_markdown_path(&text_file)
            .unwrap_err()
            .contains(".md 或 .markdown"));
        assert!(normalize_markdown_path(dir.join("missing.md"))
            .unwrap_err()
            .contains("无法打开文件"));
    }

    #[test]
    fn derives_stable_alphanumeric_reader_window_labels_from_paths() {
        let left = reader_window_label(r"E:\notes\readme.md");
        let right = reader_window_label(r"E:\notes\README.md");

        assert!(left.starts_with("reader-"));
        assert!(left.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        }));

        if cfg!(windows) {
            assert_eq!(left, right);
        }
    }

    #[test]
    fn selects_first_supported_command_line_markdown_path() {
        let selected = first_supported_markdown_arg([
            "only-md-reader.exe",
            "--flag",
            "E:\\notes\\readme.txt",
            "E:\\notes\\readme.markdown",
            "E:\\notes\\later.md",
        ]);

        assert_eq!(selected.as_deref(), Some("E:\\notes\\readme.markdown"));
    }

    #[test]
    fn reads_utf8_markdown_file_with_basic_metadata() {
        let dir = unique_test_dir("read-file");
        fs::create_dir_all(&dir).unwrap();
        let markdown = dir.join("readme.md");
        fs::write(&markdown, "# 标题\n\n正文").unwrap();

        let file = read_markdown_file(&markdown).unwrap();

        assert_eq!(
            file.path,
            markdown.canonicalize().unwrap().to_string_lossy()
        );
        assert_eq!(file.file_name, "readme.md");
        assert_eq!(file.content, "# 标题\n\n正文");
        assert_eq!(file.opened_at, 0);
        assert_eq!(file.file_size, "# 标题\n\n正文".len() as u64);
        assert!(file.modified_at.is_some());
    }

    #[test]
    fn reports_clear_error_when_markdown_file_cannot_be_read_as_utf8() {
        let dir = unique_test_dir("invalid-utf8");
        fs::create_dir_all(&dir).unwrap();
        let markdown = dir.join("broken.md");
        fs::write(&markdown, [0xff, 0xfe, 0xfd]).unwrap();

        let error = read_markdown_file(&markdown).unwrap_err();

        assert!(error.contains("读取 Markdown 文件失败"));
    }

    #[test]
    fn reports_clear_error_for_permission_denied_file_reads() {
        let error = format_read_markdown_error(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "access denied",
        ));

        assert!(error.contains("读取 Markdown 文件失败"));
        assert!(error.contains("access denied"));
    }

    #[test]
    fn rejects_directory_paths_with_markdown_extension_before_reading() {
        let dir = unique_test_dir("directory-path");
        let markdown_dir = dir.join("folder.md");
        fs::create_dir_all(&markdown_dir).unwrap();

        let error = normalize_markdown_path(&markdown_dir).unwrap_err();

        assert!(error.contains("路径不是一个 Markdown 文件"));
    }

    #[test]
    fn reads_readonly_markdown_files_without_requiring_write_access() {
        let dir = unique_test_dir("readonly-file");
        fs::create_dir_all(&dir).unwrap();
        let markdown = dir.join("readonly.md");
        fs::write(&markdown, "# Readonly\n\nBody").unwrap();
        let mut permissions = fs::metadata(&markdown).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&markdown, permissions.clone()).unwrap();

        let file = read_markdown_file(&markdown).unwrap();

        assert_eq!(file.file_name, "readonly.md");
        assert_eq!(file.content, "# Readonly\n\nBody");

        #[cfg(windows)]
        {
            #[allow(clippy::permissions_set_readonly_false)]
            {
                permissions.set_readonly(false);
                fs::set_permissions(&markdown, permissions).unwrap();
            }
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            permissions.set_mode(permissions.mode() | 0o200);
            fs::set_permissions(&markdown, permissions).unwrap();
        }
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("only-md-reader-window-{name}-{suffix}"))
    }
}
