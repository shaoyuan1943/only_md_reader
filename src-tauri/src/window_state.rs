use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::reader_windows::normalize_markdown_path;

const WINDOW_STATE_STORE_NAME: &str = "window-state.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowStateStore {
    pub schema_version: u32,
    pub files: HashMap<String, WindowState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub file_path: String,
    pub scroll_top: Option<f64>,
    pub scroll_ratio: Option<f64>,
    pub active_heading_id: Option<String>,
    pub active_heading_offset: Option<f64>,
    pub file_modified_at: Option<String>,
    pub file_size: Option<u64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWindowStateRequest {
    pub file_path: String,
    pub scroll_top: Option<f64>,
    pub scroll_ratio: Option<f64>,
    pub active_heading_id: Option<String>,
    pub active_heading_offset: Option<f64>,
    pub file_modified_at: Option<String>,
    pub file_size: Option<u64>,
}

impl Default for WindowStateStore {
    fn default() -> Self {
        Self {
            schema_version: 1,
            files: HashMap::new(),
        }
    }
}

#[tauri::command]
pub fn get_window_state(app: AppHandle, file_path: String) -> Result<Option<WindowState>, String> {
    let normalized_path = normalize_markdown_path(file_path)?;
    get_window_state_for_path(&app, &normalized_path)
}

#[tauri::command]
pub fn save_window_state(
    app: AppHandle,
    state: SaveWindowStateRequest,
) -> Result<WindowState, String> {
    let normalized_path = normalize_markdown_path(&state.file_path)?;
    let saved = WindowState {
        file_path: normalized_path,
        scroll_top: state.scroll_top,
        scroll_ratio: state.scroll_ratio,
        active_heading_id: state.active_heading_id,
        active_heading_offset: state.active_heading_offset,
        file_modified_at: state.file_modified_at,
        file_size: state.file_size,
        updated_at: current_timestamp_ms().to_string(),
    };
    let store_path = window_state_store_path(&app)?;
    upsert_window_state_in_path(&store_path, saved).map_err(|error| error.to_string())
}

pub fn get_window_state_for_path(
    app: &AppHandle,
    normalized_file_path: &str,
) -> Result<Option<WindowState>, String> {
    let store_path = window_state_store_path(app)?;
    let store =
        load_window_state_store_from_path(&store_path).map_err(|error| error.to_string())?;
    Ok(store
        .files
        .get(&window_state_store_key(normalized_file_path))
        .cloned())
}

pub fn load_window_state_store_from_path(path: &Path) -> io::Result<WindowStateStore> {
    if !path.exists() {
        return Ok(WindowStateStore::default());
    }

    let content = fs::read_to_string(path)?;
    let mut store = serde_json::from_str::<WindowStateStore>(&content).unwrap_or_default();
    store.schema_version = 1;

    Ok(store)
}

pub fn upsert_window_state_in_path(
    store_path: &Path,
    state: WindowState,
) -> io::Result<WindowState> {
    let mut store = load_window_state_store_from_path(store_path)?;
    store
        .files
        .insert(window_state_store_key(&state.file_path), state.clone());
    write_window_state_store_to_path(store_path, &store)?;

    Ok(state)
}

pub fn write_window_state_store_to_path(path: &Path, store: &WindowStateStore) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let content = serde_json::to_string_pretty(store)?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temp_path, path)
}

pub fn window_state_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(WINDOW_STATE_STORE_NAME))
        .map_err(|error| format!("无法定位应用数据目录：{error}"))
}

pub fn window_state_store_key(path: &str) -> String {
    if cfg!(windows) {
        path.to_ascii_lowercase()
    } else {
        path.to_string()
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
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        load_window_state_store_from_path, upsert_window_state_in_path, window_state_store_key,
        WindowState,
    };

    #[test]
    fn window_state_is_saved_under_a_normalized_path_key() {
        let dir = unique_test_dir("window-state-key");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("window-state.json");
        let state = sample_state("E:\\Notes\\Guide.md");

        upsert_window_state_in_path(&store_path, state.clone()).unwrap();
        let store = load_window_state_store_from_path(&store_path).unwrap();

        assert_eq!(
            store
                .files
                .get(&window_state_store_key("E:\\Notes\\Guide.md"))
                .unwrap(),
            &state
        );
    }

    fn sample_state(file_path: &str) -> WindowState {
        WindowState {
            file_path: file_path.to_string(),
            scroll_top: Some(300.0),
            scroll_ratio: Some(0.4),
            active_heading_id: Some("chapter-two".to_string()),
            active_heading_offset: Some(16.0),
            file_modified_at: Some("2026-06-30T01:00:00.000Z".to_string()),
            file_size: Some(2048),
            updated_at: "2026-06-30T01:01:00.000Z".to_string(),
        }
    }

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("only-md-reader-{name}-{suffix}"))
    }
}
