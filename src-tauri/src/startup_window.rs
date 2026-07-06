use tauri::{
    utils::config::{Color, WindowConfig},
    App, AppHandle, Theme, WebviewWindow, WebviewWindowBuilder,
};

use crate::settings::{get_reader_settings, ThemeMode};

pub const STARTUP_LIGHT_BACKGROUND: Color = Color(237, 228, 215, 255);
pub const STARTUP_DARK_BACKGROUND: Color = Color(21, 18, 16, 255);

pub fn create_main_window(app: &mut App) -> tauri::Result<WebviewWindow> {
    let config = main_window_config(app.config())?;
    let background_color = startup_background_color_for_app(app.handle());
    let initialization_script = startup_boot_theme_script(app.handle());

    WebviewWindowBuilder::from_config(app.handle(), config)?
        .background_color(background_color)
        .initialization_script(&initialization_script)
        .build()
}

pub fn startup_background_color(theme: Option<Theme>) -> Color {
    match theme {
        Some(Theme::Dark) => STARTUP_DARK_BACKGROUND,
        _ => STARTUP_LIGHT_BACKGROUND,
    }
}

pub fn startup_background_color_for_app(app: &AppHandle) -> Color {
    startup_background_color(effective_theme_for_app(app))
}

#[cfg(test)]
fn startup_background_color_for_theme_mode(
    theme_mode: &ThemeMode,
    system_theme: Option<Theme>,
) -> Color {
    startup_background_color(effective_theme_for_mode(theme_mode, system_theme))
}

pub fn detect_system_theme() -> Option<Theme> {
    detect_platform_system_theme()
}

pub fn effective_theme_for_app(app: &AppHandle) -> Option<Theme> {
    let settings = get_reader_settings(app.clone()).ok()?;

    effective_theme_for_mode(&settings.theme_mode, detect_system_theme())
}

pub fn startup_boot_theme_script(app: &AppHandle) -> String {
    let boot_theme = match effective_theme_for_app(app) {
        Some(Theme::Dark) => "dark",
        _ => "light",
    };

    format!(r#"window.__ONLY_MD_READER_BOOT_THEME__ = "{boot_theme}";"#)
}

fn effective_theme_for_mode(theme_mode: &ThemeMode, system_theme: Option<Theme>) -> Option<Theme> {
    match theme_mode {
        ThemeMode::Light => Some(Theme::Light),
        ThemeMode::Dark => Some(Theme::Dark),
        ThemeMode::System => system_theme,
    }
}

#[cfg(windows)]
fn detect_platform_system_theme() -> Option<Theme> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let personalize = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize")
        .ok()?;
    let apps_use_light_theme: u32 = personalize.get_value("AppsUseLightTheme").ok()?;

    Some(theme_from_apps_use_light_theme(apps_use_light_theme))
}

#[cfg(not(windows))]
fn detect_platform_system_theme() -> Option<Theme> {
    None
}

fn theme_from_apps_use_light_theme(value: u32) -> Theme {
    if value == 0 {
        Theme::Dark
    } else {
        Theme::Light
    }
}

fn main_window_config(config: &tauri::Config) -> tauri::Result<&WindowConfig> {
    config
        .app
        .windows
        .iter()
        .find(|window_config| window_config.label == "main")
        .or_else(|| config.app.windows.first())
        .ok_or_else(|| tauri::Error::WindowNotFound)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chooses_warm_paper_light_background_for_light_or_unknown_theme() {
        assert_eq!(
            startup_background_color(Some(Theme::Light)),
            STARTUP_LIGHT_BACKGROUND
        );
        assert_eq!(startup_background_color(None), STARTUP_LIGHT_BACKGROUND);
    }

    #[test]
    fn chooses_warm_paper_dark_background_for_dark_theme() {
        assert_eq!(
            startup_background_color(Some(Theme::Dark)),
            STARTUP_DARK_BACKGROUND
        );
    }

    #[test]
    fn explicit_app_theme_mode_controls_startup_background_before_system_theme() {
        assert_eq!(
            startup_background_color_for_theme_mode(&ThemeMode::Light, Some(Theme::Dark)),
            STARTUP_LIGHT_BACKGROUND
        );
        assert_eq!(
            startup_background_color_for_theme_mode(&ThemeMode::Dark, Some(Theme::Light)),
            STARTUP_DARK_BACKGROUND
        );
    }

    #[test]
    fn system_app_theme_mode_uses_detected_system_theme_for_startup_background() {
        assert_eq!(
            startup_background_color_for_theme_mode(&ThemeMode::System, Some(Theme::Light)),
            STARTUP_LIGHT_BACKGROUND
        );
        assert_eq!(
            startup_background_color_for_theme_mode(&ThemeMode::System, Some(Theme::Dark)),
            STARTUP_DARK_BACKGROUND
        );
    }

    #[test]
    fn maps_windows_registry_theme_value_to_tauri_theme() {
        assert_eq!(theme_from_apps_use_light_theme(0), Theme::Dark);
        assert_eq!(theme_from_apps_use_light_theme(1), Theme::Light);
    }
}
