mod font_families;
pub mod markdown_file_watch;
mod pdf_export;
mod reader_windows;
mod recent_files;
mod settings;
mod settings_window;
mod startup_window;
mod window_state;

use reader_windows::ReaderWindowRegistry;
use startup_window::create_main_window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ReaderWindowRegistry::default())
        .manage(markdown_file_watch::FileWatchManager::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(reader_windows::handle_window_event)
        .setup(|app| {
            let opened_startup_markdown = reader_windows::open_startup_markdown_arg(app.handle())?;

            if !opened_startup_markdown {
                create_main_window(app)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            font_families::list_available_font_families,
            recent_files::list_recent_files,
            recent_files::open_markdown_file,
            reader_windows::open_reader_window,
            reader_windows::read_current_reader_file,
            reader_windows::rebind_current_reader_file,
            settings::get_reader_settings,
            settings::reset_reader_settings,
            settings::update_reader_settings,
            settings_window::open_settings_window,
            pdf_export::export_pdf,
            window_state::get_window_state,
            window_state::save_window_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Keep the scaffold command available while the application shell is still small.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
