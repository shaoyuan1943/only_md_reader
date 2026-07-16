use tauri::WebviewWindow;

#[tauri::command]
pub fn open_pdf_print_dialog(window: WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        return open_windows_system_print_dialog(window);
    }

    #[cfg(not(windows))]
    {
        window
            .eval("window.print()")
            .map_err(|error| format!("无法打开系统打印窗口：{error}"))
    }
}

#[cfg(windows)]
fn open_windows_system_print_dialog(window: WebviewWindow) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
    };
    use windows_core::Interface;

    window
        .with_webview(|webview| {
            let result = unsafe {
                webview
                    .controller()
                    .CoreWebView2()
                    .and_then(|core_webview| core_webview.cast::<ICoreWebView2_16>())
                    .and_then(|core_webview| {
                        core_webview.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM)
                    })
            };

            if let Err(error) = result {
                eprintln!("无法打开 Windows 系统打印窗口：{error}");
            }
        })
        .map_err(|error| format!("无法请求 Windows 系统打印窗口：{error}"))
}
