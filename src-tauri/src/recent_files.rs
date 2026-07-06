use std::{
    cmp::Reverse,
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const RECENT_FILES_STORE_NAME: &str = "recent-files.json";
const RECENT_FILES_LIMIT: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub file_name: String,
    pub opened_at: u64,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedMarkdownFile {
    pub path: String,
    pub file_name: String,
    pub content: String,
    pub opened_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecentFilesStore {
    schema_version: u32,
    files: Vec<RecentFile>,
}

impl Default for RecentFilesStore {
    fn default() -> Self {
        Self {
            schema_version: 1,
            files: Vec::new(),
        }
    }
}

#[tauri::command]
pub fn list_recent_files(app: AppHandle) -> Result<Vec<RecentFile>, String> {
    let store_path = recent_files_store_path(&app)?;
    load_recent_files_from_path(&store_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_markdown_file(app: AppHandle, path: String) -> Result<OpenedMarkdownFile, String> {
    let path = PathBuf::from(path);

    if !is_supported_markdown_path(&path) {
        return Err("只支持打开 .md 或 .markdown 文件。".to_string());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("无法打开文件：{}", error))?;

    if !canonical_path.is_file() {
        return Err("路径不是一个 Markdown 文件。".to_string());
    }

    let content = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("读取 Markdown 文件失败：{}", error))?;
    let opened_at = current_timestamp_ms();
    let store_path = recent_files_store_path(&app)?;
    let recent = upsert_recent_file_in_path(&store_path, &canonical_path, opened_at)
        .map_err(|error| error.to_string())?;

    Ok(OpenedMarkdownFile {
        path: recent.path,
        file_name: recent.file_name,
        content,
        opened_at,
    })
}

pub fn is_supported_markdown_path(path: impl AsRef<Path>) -> bool {
    path.as_ref()
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            let normalized = extension.to_ascii_lowercase();
            normalized == "md" || normalized == "markdown"
        })
        .unwrap_or(false)
}

pub fn load_recent_files_from_path(path: &Path) -> io::Result<Vec<RecentFile>> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path)?;
    let mut store = serde_json::from_str::<RecentFilesStore>(&content).unwrap_or_default();

    for file in &mut store.files {
        file.exists = Path::new(&file.path).is_file();
    }

    store.files.sort_by_key(|file| Reverse(file.opened_at));
    store.files.truncate(RECENT_FILES_LIMIT);

    Ok(store.files)
}

pub fn upsert_recent_file_in_path(
    store_path: &Path,
    file_path: &Path,
    opened_at: u64,
) -> io::Result<RecentFile> {
    let canonical_path = file_path
        .canonicalize()
        .unwrap_or_else(|_| file_path.to_path_buf());
    let path_string = canonical_path.to_string_lossy().to_string();
    let file_name = canonical_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&path_string)
        .to_string();
    let mut files = load_recent_files_from_path(store_path)?;

    files.retain(|file| !paths_equal(&file.path, &path_string));

    let recent = RecentFile {
        path: path_string,
        file_name,
        opened_at,
        exists: canonical_path.is_file(),
    };
    files.insert(0, recent.clone());
    files.truncate(RECENT_FILES_LIMIT);

    write_recent_files_store(store_path, files)?;

    Ok(recent)
}

pub fn recent_files_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(RECENT_FILES_STORE_NAME))
        .map_err(|error| format!("无法定位应用数据目录：{}", error))
}

fn write_recent_files_store(path: &Path, files: Vec<RecentFile>) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let store = RecentFilesStore {
        schema_version: 1,
        files,
    };
    let content = serde_json::to_string_pretty(&store)?;
    let temp_path = path.with_extension("json.tmp");

    fs::write(&temp_path, content)?;
    fs::rename(temp_path, path)?;

    Ok(())
}

fn paths_equal(left: &str, right: &str) -> bool {
    if cfg!(windows) {
        left.eq_ignore_ascii_case(right)
    } else {
        left == right
    }
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        is_supported_markdown_path, load_recent_files_from_path, upsert_recent_file_in_path,
    };

    #[test]
    fn detects_supported_markdown_extensions_case_insensitively() {
        assert!(is_supported_markdown_path(r"E:\notes\readme.md"));
        assert!(is_supported_markdown_path(r"E:\notes\README.MARKDOWN"));
        assert!(!is_supported_markdown_path(r"E:\notes\readme.txt"));
    }

    #[test]
    fn upsert_persists_latest_file_first_and_deduplicates_paths() {
        let dir = unique_test_dir("recent-dedupe");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("recent-files.json");
        let old_file = dir.join("old.md");
        let new_file = dir.join("new.md");
        fs::write(&old_file, "# old").unwrap();
        fs::write(&new_file, "# new").unwrap();

        upsert_recent_file_in_path(&store_path, &old_file, 10).unwrap();
        upsert_recent_file_in_path(&store_path, &new_file, 30).unwrap();
        upsert_recent_file_in_path(&store_path, &old_file, 40).unwrap();

        let files = load_recent_files_from_path(&store_path).unwrap();

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].file_name, "old.md");
        assert_eq!(files[0].opened_at, 40);
        assert_eq!(files[1].file_name, "new.md");
    }

    #[test]
    fn load_recent_files_marks_missing_paths_without_dropping_them() {
        let dir = unique_test_dir("recent-missing");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("recent-files.json");
        let missing_file = dir.join("missing.md");

        upsert_recent_file_in_path(&store_path, &missing_file, 10).unwrap();

        let files = load_recent_files_from_path(&store_path).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(files[0].file_name, "missing.md");
        assert!(!files[0].exists);
    }

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("only-md-reader-{name}-{suffix}"))
    }
}
