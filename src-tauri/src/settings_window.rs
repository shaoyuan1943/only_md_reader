use tauri::{utils::config::WebviewUrl, AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::startup_window::{startup_background_color_for_app, startup_boot_theme_script};

const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_WINDOW_WIDTH: f64 = 900.0;
const SETTINGS_WINDOW_HEIGHT: f64 = 500.0;

#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        return focus_existing_settings_window(window);
    }

    let initialization_script = format!(
        r#"window.__ONLY_MD_READER_BOOTSTRAP__ = {{"windowKind":"settings"}};{}"#,
        startup_boot_theme_script(&app)
    );
    let background_color = startup_background_color_for_app(&app);

    WebviewWindowBuilder::new(
        &app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("设置 - MD极简阅读")
    .inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
    .min_inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
    .max_inner_size(SETTINGS_WINDOW_WIDTH, SETTINGS_WINDOW_HEIGHT)
    .resizable(false)
    .maximizable(false)
    .visible(false)
    .background_color(background_color)
    .initialization_script(initialization_script)
    .build()
    .map(|_| ())
    .map_err(|error| format!("创建设置窗口失败：{error}"))
}

fn focus_existing_settings_window(window: WebviewWindow) -> Result<(), String> {
    if window
        .is_minimized()
        .map_err(|error| format!("检查设置窗口最小化状态失败：{error}"))?
    {
        window
            .unminimize()
            .map_err(|error| format!("恢复设置窗口失败：{error}"))?;
    }

    window
        .show()
        .map_err(|error| format!("显示设置窗口失败：{error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("聚焦设置窗口失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::{SETTINGS_WINDOW_HEIGHT, SETTINGS_WINDOW_WIDTH};

    #[test]
    fn settings_window_uses_the_compact_four_row_layout_size() {
        assert_eq!(SETTINGS_WINDOW_WIDTH, 900.0);
        assert_eq!(SETTINGS_WINDOW_HEIGHT, 500.0);
    }
}
