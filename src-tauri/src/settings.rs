use std::{
    fs, io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

const SETTINGS_STORE_NAME: &str = "settings.json";
const CORRUPT_SETTINGS_STORE_NAME: &str = "settings.corrupt.json";
pub const READER_SETTINGS_CHANGED_EVENT: &str = "reader-settings-changed";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReaderSettings {
    pub schema_version: u32,
    pub color_theme_id: String,
    pub theme_mode: ThemeMode,
    pub body_font_family: Option<String>,
    pub code_font_family: Option<String>,
    pub body_font_size: f64,
    pub code_font_size: f64,
    pub line_height: f64,
    pub content_max_width: u32,
    pub light_code_theme: String,
    pub dark_code_theme: String,
    #[serde(default)]
    pub pdf_allow_global_scaling: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReaderSettingsPatch {
    pub color_theme_id: Option<String>,
    pub theme_mode: Option<ThemeMode>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub body_font_family: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_optional_patch_field")]
    pub code_font_family: Option<Option<String>>,
    pub body_font_size: Option<f64>,
    pub code_font_size: Option<f64>,
    pub line_height: Option<f64>,
    pub content_max_width: Option<u32>,
    pub light_code_theme: Option<String>,
    pub dark_code_theme: Option<String>,
    pub pdf_allow_global_scaling: Option<bool>,
}

impl Default for ReaderSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            color_theme_id: "warm-paper".to_string(),
            theme_mode: ThemeMode::System,
            body_font_family: None,
            code_font_family: None,
            body_font_size: 16.0,
            code_font_size: 16.0,
            line_height: 1.86,
            content_max_width: 860,
            light_code_theme: "Eva Light Bold".to_string(),
            dark_code_theme: "Eva Dark Bold".to_string(),
            pdf_allow_global_scaling: false,
        }
    }
}

#[tauri::command]
pub fn get_reader_settings(app: AppHandle) -> Result<ReaderSettings, String> {
    let store_path = settings_store_path(&app)?;
    load_reader_settings_from_path(&store_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_reader_settings(
    app: AppHandle,
    patch: ReaderSettingsPatch,
) -> Result<ReaderSettings, String> {
    let store_path = settings_store_path(&app)?;
    let mut settings =
        load_reader_settings_from_path(&store_path).map_err(|error| error.to_string())?;
    apply_reader_settings_patch(&mut settings, patch);
    write_reader_settings_to_path(&store_path, &settings).map_err(|error| error.to_string())?;
    emit_reader_settings_changed(&app, &settings)?;

    Ok(settings)
}

#[tauri::command]
pub fn reset_reader_settings(app: AppHandle) -> Result<ReaderSettings, String> {
    let store_path = settings_store_path(&app)?;
    let settings = ReaderSettings::default();
    write_reader_settings_to_path(&store_path, &settings).map_err(|error| error.to_string())?;
    emit_reader_settings_changed(&app, &settings)?;

    Ok(settings)
}

pub fn settings_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(SETTINGS_STORE_NAME))
        .map_err(|error| format!("无法定位应用数据目录：{error}"))
}

pub fn load_reader_settings_from_path(path: &Path) -> io::Result<ReaderSettings> {
    if !path.exists() {
        let settings = ReaderSettings::default();
        write_reader_settings_to_path(path, &settings)?;
        return Ok(settings);
    }

    let content = fs::read_to_string(path)?;
    let value = match serde_json::from_str::<Value>(&content) {
        Ok(value) => value,
        Err(_) => {
            backup_corrupt_settings_file(path)?;
            let settings = ReaderSettings::default();
            write_reader_settings_to_path(path, &settings)?;
            return Ok(settings);
        }
    };

    match serde_json::from_value::<ReaderSettings>(value.clone()) {
        Ok(settings) if settings.schema_version == 1 => Ok(settings),
        _ => {
            let settings = migrate_reader_settings_value(value);
            write_reader_settings_to_path(path, &settings)?;
            Ok(settings)
        }
    }
}

pub fn write_reader_settings_to_path(path: &Path, settings: &ReaderSettings) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let content = serde_json::to_string_pretty(settings)?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content)?;
    replace_file(&temp_path, path)?;

    Ok(())
}

fn apply_reader_settings_patch(settings: &mut ReaderSettings, patch: ReaderSettingsPatch) {
    if let Some(value) = patch.color_theme_id {
        settings.color_theme_id = value;
    }
    if let Some(value) = patch.theme_mode {
        settings.theme_mode = value;
    }
    if let Some(value) = patch.body_font_family {
        settings.body_font_family = value.and_then(empty_string_to_none);
    }
    if let Some(value) = patch.code_font_family {
        settings.code_font_family = value.and_then(empty_string_to_none);
    }
    if let Some(value) = patch.body_font_size {
        settings.body_font_size = value.clamp(12.0, 28.0);
    }
    if let Some(value) = patch.code_font_size {
        settings.code_font_size = value.clamp(11.0, 24.0);
    }
    if let Some(value) = patch.line_height {
        settings.line_height = value.clamp(1.2, 2.4);
    }
    if let Some(value) = patch.content_max_width {
        settings.content_max_width = value.clamp(560, 1200);
    }
    if let Some(value) = patch.light_code_theme {
        settings.light_code_theme = value;
    }
    if let Some(value) = patch.dark_code_theme {
        settings.dark_code_theme = value;
    }
    if let Some(value) = patch.pdf_allow_global_scaling {
        settings.pdf_allow_global_scaling = value;
    }
    settings.schema_version = 1;
}

fn migrate_reader_settings_value(value: Value) -> ReaderSettings {
    let mut settings = ReaderSettings::default();
    let Some(object) = value.as_object() else {
        return settings;
    };

    if let Some(Value::String(theme_mode)) = object.get("themeMode") {
        settings.theme_mode = match theme_mode.as_str() {
            "light" => ThemeMode::Light,
            "dark" => ThemeMode::Dark,
            _ => ThemeMode::System,
        };
    }
    if let Some(Value::Number(body_font_size)) = object.get("bodyFontSize") {
        if let Some(value) = body_font_size.as_f64() {
            settings.body_font_size = value.clamp(12.0, 28.0);
        }
    }
    if let Some(Value::Number(code_font_size)) = object.get("codeFontSize") {
        if let Some(value) = code_font_size.as_f64() {
            settings.code_font_size = value.clamp(11.0, 24.0);
        }
    }
    if let Some(Value::Number(line_height)) = object.get("lineHeight") {
        if let Some(value) = line_height.as_f64() {
            settings.line_height = value.clamp(1.2, 2.4);
        }
    }
    if let Some(Value::Number(content_max_width)) = object.get("contentMaxWidth") {
        if let Some(value) = content_max_width.as_u64() {
            settings.content_max_width = (value as u32).clamp(560, 1200);
        }
    }
    if let Some(Value::Bool(pdf_allow_global_scaling)) = object.get("pdfAllowGlobalScaling") {
        settings.pdf_allow_global_scaling = *pdf_allow_global_scaling;
    }

    settings
}

fn emit_reader_settings_changed(app: &AppHandle, settings: &ReaderSettings) -> Result<(), String> {
    app.emit(READER_SETTINGS_CHANGED_EVENT, settings.clone())
        .map_err(|error| format!("广播设置变更失败：{error}"))
}

fn backup_corrupt_settings_file(path: &Path) -> io::Result<()> {
    let backup_path = path.with_file_name(CORRUPT_SETTINGS_STORE_NAME);
    fs::copy(path, backup_path)?;
    Ok(())
}

fn replace_file(temp_path: &Path, path: &Path) -> io::Result<()> {
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temp_path, path)
}

fn empty_string_to_none(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn deserialize_optional_patch_field<'de, D>(
    deserializer: D,
) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        apply_reader_settings_patch, load_reader_settings_from_path, write_reader_settings_to_path,
        ReaderSettings, ReaderSettingsPatch, ThemeMode,
    };

    #[test]
    fn missing_settings_file_creates_default_camel_case_settings() {
        let dir = unique_test_dir("settings-default");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("settings.json");

        let settings = load_reader_settings_from_path(&store_path).unwrap();
        let content = fs::read_to_string(&store_path).unwrap();

        assert_eq!(settings, ReaderSettings::default());
        assert!(content.contains("\"schemaVersion\""));
        assert!(content.contains("\"themeMode\""));
        assert!(content.contains("\"contentMaxWidth\""));
        assert!(content.contains("\"pdfAllowGlobalScaling\": false"));
    }

    #[test]
    fn old_settings_without_schema_version_are_migrated_to_version_one() {
        let dir = unique_test_dir("settings-migrate");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("settings.json");
        fs::write(
            &store_path,
            r#"{"themeMode":"dark","bodyFontSize":18,"contentMaxWidth":920}"#,
        )
        .unwrap();

        let settings = load_reader_settings_from_path(&store_path).unwrap();

        assert_eq!(settings.schema_version, 1);
        assert_eq!(settings.theme_mode, ThemeMode::Dark);
        assert_eq!(settings.body_font_size, 18.0);
        assert_eq!(settings.content_max_width, 920);
        assert_eq!(
            serde_json::to_value(&settings).unwrap()["pdfAllowGlobalScaling"],
            false
        );
    }

    #[test]
    fn corrupt_settings_file_is_backed_up_and_replaced_with_defaults() {
        let dir = unique_test_dir("settings-corrupt");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("settings.json");
        fs::write(&store_path, "{not-json").unwrap();

        let settings = load_reader_settings_from_path(&store_path).unwrap();

        assert_eq!(settings, ReaderSettings::default());
        assert_eq!(
            fs::read_to_string(dir.join("settings.corrupt.json")).unwrap(),
            "{not-json"
        );
        assert!(fs::read_to_string(&store_path)
            .unwrap()
            .contains("\"schemaVersion\""));
    }

    #[test]
    fn settings_write_uses_a_temp_file_then_leaves_only_valid_json() {
        let dir = unique_test_dir("settings-write");
        fs::create_dir_all(&dir).unwrap();
        let store_path = dir.join("settings.json");
        let settings = ReaderSettings {
            theme_mode: ThemeMode::Light,
            ..ReaderSettings::default()
        };

        write_reader_settings_to_path(&store_path, &settings).unwrap();

        assert!(!store_path.with_extension("json.tmp").exists());
        assert_eq!(
            serde_json::from_str::<ReaderSettings>(&fs::read_to_string(store_path).unwrap())
                .unwrap(),
            settings
        );
    }

    #[test]
    fn explicit_null_font_patch_restores_the_bundled_default_font() {
        let mut settings = ReaderSettings {
            body_font_family: Some("Microsoft YaHei UI".to_string()),
            code_font_family: Some("Consolas".to_string()),
            ..ReaderSettings::default()
        };
        let patch = serde_json::from_str::<ReaderSettingsPatch>(
            r#"{"bodyFontFamily":null,"codeFontFamily":null}"#,
        )
        .unwrap();

        apply_reader_settings_patch(&mut settings, patch);

        assert_eq!(settings.body_font_family, None);
        assert_eq!(settings.code_font_family, None);
    }

    #[test]
    fn pdf_global_scaling_patch_is_persisted_in_the_settings_contract() {
        let mut settings = ReaderSettings::default();
        let patch =
            serde_json::from_str::<ReaderSettingsPatch>(r#"{"pdfAllowGlobalScaling":true}"#)
                .unwrap();

        apply_reader_settings_patch(&mut settings, patch);

        assert_eq!(
            serde_json::to_value(&settings).unwrap()["pdfAllowGlobalScaling"],
            true
        );
    }

    fn unique_test_dir(name: &str) -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("only-md-reader-{name}-{suffix}"))
    }
}
