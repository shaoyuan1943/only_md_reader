use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::{
    fs, process,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::WebviewWindow;

use crate::recent_files::is_supported_markdown_path;

#[cfg(windows)]
type PdfCompletionSender = Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<(), String>>>>>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportOutput {
    output_path: String,
}

#[tauri::command]
pub async fn export_pdf(
    window: WebviewWindow,
    source_path: String,
) -> Result<PdfExportOutput, String> {
    let source_path = validate_source_path(&source_path)?;

    #[cfg(windows)]
    {
        return export_windows_pdf(window, &source_path).await;
    }

    #[cfg(not(windows))]
    {
        let _ = window;
        let _ = source_path;
        Err("当前平台尚未实现无界面 PDF 导出。".to_string())
    }
}

fn validate_source_path(source_path: &str) -> Result<PathBuf, String> {
    let source_path = PathBuf::from(source_path);

    if !is_supported_markdown_path(&source_path) {
        return Err("只支持导出 .md 或 .markdown 文件。".to_string());
    }

    let source_path = source_path
        .canonicalize()
        .map_err(|error| format!("无法定位 Markdown 文件：{error}"))?;

    if !source_path.is_file() {
        return Err("路径不是一个 Markdown 文件。".to_string());
    }

    Ok(source_path)
}

fn should_print_backgrounds() -> bool {
    false
}

#[cfg(windows)]
async fn export_windows_pdf(
    window: WebviewWindow,
    source_path: &Path,
) -> Result<PdfExportOutput, String> {
    use tokio::sync::oneshot;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
        },
        PrintToPdfCompletedHandler,
    };
    use windows_core::{Interface, HSTRING};

    let temporary_path = temporary_pdf_path(source_path);
    let temporary_path_for_webview = temporary_path.clone();
    let (completion_tx, completion_rx) = oneshot::channel::<Result<(), String>>();
    let completion_tx = Arc::new(Mutex::new(Some(completion_tx)));
    let completion_tx_for_webview = Arc::clone(&completion_tx);

    window
        .with_webview(move |webview| {
            let result = (|| unsafe {
                let settings = webview
                    .environment()
                    .cast::<ICoreWebView2Environment6>()?
                    .CreatePrintSettings()?;

                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                settings.SetPageWidth(8.267_716_535)?;
                settings.SetPageHeight(11.692_913_385)?;
                settings.SetShouldPrintBackgrounds(should_print_backgrounds())?;
                settings.SetShouldPrintHeaderAndFooter(false)?;

                let completion_tx_for_callback = Arc::clone(&completion_tx_for_webview);
                let handler =
                    PrintToPdfCompletedHandler::create(Box::new(move |completion, succeeded| {
                        let result = match completion {
                            Ok(()) if succeeded => Ok(()),
                            Ok(()) => Err("WebView2 未生成 PDF 文件。".to_string()),
                            Err(error) => Err(format!("WebView2 PDF 导出失败：{error}")),
                        };
                        send_pdf_completion(&completion_tx_for_callback, result);
                        Ok(())
                    }));

                webview
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_7>()?
                    .PrintToPdf(
                        &HSTRING::from(temporary_path_for_webview.as_path()),
                        &settings,
                        &handler,
                    )
            })();

            if let Err(error) = result {
                send_pdf_completion(
                    &completion_tx_for_webview,
                    Err(format!("无法启动 WebView2 PDF 导出：{error}")),
                );
            }
        })
        .map_err(|error| format!("无法访问当前阅读窗口：{error}"))?;

    let completion = completion_rx
        .await
        .map_err(|_| "WebView2 PDF 导出未返回结果。".to_string())?;

    if let Err(error) = completion {
        remove_temporary_pdf(&temporary_path);
        return Err(error);
    }

    let output_path = move_to_available_pdf_path(&temporary_path, source_path)?;

    Ok(PdfExportOutput {
        output_path: output_path.to_string_lossy().to_string(),
    })
}

#[cfg(windows)]
fn send_pdf_completion(sender: &PdfCompletionSender, result: Result<(), String>) {
    if let Ok(mut sender) = sender.lock() {
        if let Some(sender) = sender.take() {
            let _ = sender.send(result);
        }
    }
}

#[cfg(windows)]
fn temporary_pdf_path(source_path: &Path) -> PathBuf {
    let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = source_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("markdown");
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    parent.join(format!(
        ".{stem}.only-md-reader-{}-{nonce}.pdf",
        process::id()
    ))
}

#[cfg(windows)]
fn move_to_available_pdf_path(
    temporary_path: &Path,
    source_path: &Path,
) -> Result<PathBuf, String> {
    for index in 0..10_000 {
        let candidate = available_pdf_path(source_path, index);

        if candidate.exists() {
            continue;
        }

        match fs::rename(temporary_path, &candidate) {
            Ok(()) => return Ok(candidate),
            Err(_error) if candidate.exists() => continue,
            Err(error) => {
                remove_temporary_pdf(temporary_path);
                return Err(format!("无法保存 PDF 文件：{error}"));
            }
        }
    }

    remove_temporary_pdf(temporary_path);
    Err("同目录下已有过多同名 PDF 文件，无法创建新文件。".to_string())
}

#[cfg(windows)]
fn remove_temporary_pdf(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn available_pdf_path(source_path: &Path, index: u32) -> PathBuf {
    let parent = source_path.parent().unwrap_or_else(|| Path::new("."));
    let stem = source_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("markdown");
    let suffix = if index == 0 {
        String::new()
    } else {
        format!(" ({index})")
    };

    parent.join(format!("{stem}{suffix}.pdf"))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{available_pdf_path, should_print_backgrounds};

    #[test]
    fn creates_the_same_directory_pdf_name_and_incremental_collision_names() {
        let source = Path::new(r"E:\notes\design.markdown");

        assert_eq!(
            available_pdf_path(source, 0),
            Path::new(r"E:\notes\design.pdf")
        );
        assert_eq!(
            available_pdf_path(source, 2),
            Path::new(r"E:\notes\design (2).pdf")
        );
    }

    #[test]
    fn native_pdf_export_omits_web_background_painting() {
        assert!(!should_print_backgrounds());
    }
}
