use tauri::{utils::config::WebviewUrl, AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

use crate::startup_window::{startup_background_color_for_app, startup_boot_theme_script};

const SETTINGS_WINDOW_LABEL: &str = "settings";

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
    .inner_size(900.0, 560.0)
    .min_inner_size(900.0, 560.0)
    .max_inner_size(900.0, 560.0)
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
