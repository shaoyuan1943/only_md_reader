use std::{
    collections::{hash_map::Entry, BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, UNIX_EPOCH},
};

use notify::{event::ModifyKind, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const READER_FILE_CHANGED_EVENT: &str = "reader:file-changed";
const EVENT_DEBOUNCE: Duration = Duration::from_millis(250);
const MISSING_CONFIRMATION_DELAY: Duration = Duration::from_millis(750);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderFileChangedEvent {
    pub path: String,
    pub status: ReaderFileStatus,
    pub revision: u64,
    pub file_size: Option<u64>,
    pub modified_at: Option<String>,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReaderFileStatus {
    Changed,
    Missing,
    Unreadable,
}

#[derive(Default)]
pub struct WatchSubscriptions {
    file_subscribers: HashMap<String, FileSubscription>,
}

struct FileSubscription {
    path: String,
    window_labels: BTreeSet<String>,
}

impl WatchSubscriptions {
    pub fn subscribe(&mut self, path: &str, window_label: &str) {
        let key = watch_path_key(Path::new(path)).expect("watch path must be absolute");
        self.file_subscribers
            .entry(key)
            .and_modify(|subscription| {
                subscription.window_labels.insert(window_label.to_string());
            })
            .or_insert_with(|| FileSubscription {
                path: path.to_string(),
                window_labels: BTreeSet::from([window_label.to_string()]),
            });
    }

    pub fn unsubscribe_window(&mut self, window_label: &str) -> Vec<String> {
        let directories_before = self.watched_directories();
        self.file_subscribers.retain(|_, subscription| {
            subscription.window_labels.remove(window_label);
            !subscription.window_labels.is_empty()
        });
        directories_before
            .into_iter()
            .filter(|directory| !self.watched_directories().contains(directory))
            .collect()
    }

    fn subscription_for_key(&self, path_key: &str) -> Option<&FileSubscription> {
        self.file_subscribers.get(path_key)
    }

    fn watched_directories(&self) -> BTreeSet<String> {
        self.file_subscribers
            .keys()
            .filter_map(|path| watch_directory_key(Path::new(path)).ok())
            .collect()
    }
}

#[derive(Default)]
pub struct FileWatchManager {
    state: Arc<Mutex<FileWatchState>>,
}

#[derive(Default)]
struct FileWatchState {
    subscriptions: WatchSubscriptions,
    watchers: HashMap<String, DirectoryWatcher>,
    debounce_generations: HashMap<String, u64>,
    revisions: HashMap<String, u64>,
}

struct DirectoryWatcher {
    _watcher: RecommendedWatcher,
}

impl FileWatchManager {
    pub fn subscribe(&self, app: &AppHandle, path: &str, window_label: &str) -> Result<(), String> {
        let path_key = watch_path_key(Path::new(path))?;
        let directory_key = watch_directory_key(Path::new(&path_key))?;
        let directory_path = PathBuf::from(&directory_key);
        let mut state = self.state.lock().expect("file watch manager lock poisoned");

        if let Entry::Vacant(entry) = state.watchers.entry(directory_key) {
            let event_app = app.clone();
            let event_state = Arc::clone(&self.state);
            let mut watcher = notify::recommended_watcher(move |result| {
                if let Ok(event) = result {
                    handle_notify_event(&event_app, &event_state, event);
                }
            })
            .map_err(|error| format!("创建文件监听失败：{error}"))?;

            watcher
                .watch(&directory_path, RecursiveMode::NonRecursive)
                .map_err(|error| format!("监听 Markdown 文件目录失败：{error}"))?;
            entry.insert(DirectoryWatcher { _watcher: watcher });
        }

        state.subscriptions.subscribe(path, window_label);
        Ok(())
    }

    pub fn unsubscribe_window(&self, window_label: &str) {
        let mut state = self.state.lock().expect("file watch manager lock poisoned");
        for directory in state.subscriptions.unsubscribe_window(window_label) {
            state.watchers.remove(&directory);
        }
    }
}

pub fn watch_path_key(path: &Path) -> Result<String, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("无法解析文件监听路径：{error}"))?
            .join(path)
    };
    let path = absolute.to_string_lossy().to_string();

    #[cfg(windows)]
    {
        Ok(path.to_lowercase())
    }
    #[cfg(not(windows))]
    {
        Ok(path)
    }
}

fn watch_directory_key(path: &Path) -> Result<String, String> {
    let directory = path
        .parent()
        .ok_or_else(|| "无法解析 Markdown 文件所在目录。".to_string())?;
    watch_path_key(directory)
}

fn handle_notify_event(app: &AppHandle, state: &Arc<Mutex<FileWatchState>>, event: Event) {
    let requires_confirmation = matches!(
        event.kind,
        EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
    );
    let path_keys = event
        .paths
        .iter()
        .filter_map(|path| watch_path_key(path).ok())
        .collect::<BTreeSet<_>>();
    for path_key in path_keys {
        let generation = {
            let mut state = state.lock().expect("file watch manager lock poisoned");
            let Some(generation) = schedule_debounced_event(&mut state, &path_key) else {
                continue;
            };
            generation
        };
        let delayed_app = app.clone();
        let delayed_state = Arc::clone(state);
        thread::spawn(move || {
            thread::sleep(EVENT_DEBOUNCE);
            if !is_current_debounced_event(
                &delayed_state
                    .lock()
                    .expect("file watch manager lock poisoned"),
                &path_key,
                generation,
            ) {
                return;
            }

            if requires_confirmation {
                thread::sleep(MISSING_CONFIRMATION_DELAY);
            }

            if is_current_debounced_event(
                &delayed_state
                    .lock()
                    .expect("file watch manager lock poisoned"),
                &path_key,
                generation,
            ) {
                emit_current_file_status(&delayed_app, &delayed_state, &path_key);
            }
        });
    }
}

fn schedule_debounced_event(state: &mut FileWatchState, path_key: &str) -> Option<u64> {
    state.subscriptions.subscription_for_key(path_key)?;

    let generation = state
        .debounce_generations
        .entry(path_key.to_string())
        .or_insert(0);
    *generation += 1;
    Some(*generation)
}

fn is_current_debounced_event(state: &FileWatchState, path_key: &str, generation: u64) -> bool {
    state.debounce_generations.get(path_key) == Some(&generation)
}

fn emit_current_file_status(app: &AppHandle, state: &Arc<Mutex<FileWatchState>>, path_key: &str) {
    let (path, window_labels, revision) = {
        let mut state = state.lock().expect("file watch manager lock poisoned");
        let Some(subscription) = state.subscriptions.subscription_for_key(path_key) else {
            return;
        };
        let path = subscription.path.clone();
        let window_labels = subscription
            .window_labels
            .iter()
            .cloned()
            .collect::<Vec<_>>();
        let revision = state.revisions.entry(path_key.to_string()).or_insert(0);
        *revision += 1;
        (path, window_labels, *revision)
    };
    let metadata = std::fs::metadata(&path).ok();
    let status = if metadata.is_some() {
        ReaderFileStatus::Changed
    } else {
        ReaderFileStatus::Missing
    };
    let payload = ReaderFileChangedEvent {
        path,
        status,
        revision,
        file_size: metadata.as_ref().map(std::fs::Metadata::len),
        modified_at: metadata
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis().to_string()),
    };
    for window_label in window_labels {
        let _ = app.emit_to(window_label, READER_FILE_CHANGED_EVENT, payload.clone());
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        sync::mpsc,
        time::{Duration, SystemTime, UNIX_EPOCH},
    };

    use super::*;

    #[test]
    fn later_event_for_the_same_file_replaces_the_pending_debounce() {
        let mut state = FileWatchState::default();
        state
            .subscriptions
            .subscribe(r"C:\\notes\\watch.md", "reader-one");

        let first = schedule_debounced_event(&mut state, r"c:\\notes\\watch.md").unwrap();
        let second = schedule_debounced_event(&mut state, r"c:\\notes\\watch.md").unwrap();

        assert_ne!(first, second);
        assert!(!is_current_debounced_event(
            &state,
            r"c:\\notes\\watch.md",
            first
        ));
        assert!(is_current_debounced_event(
            &state,
            r"c:\\notes\\watch.md",
            second
        ));
    }

    #[test]
    fn subscription_keeps_the_canonical_path_for_frontend_event_comparison() {
        let path = r"\\?\C:\Notes\watch.md";
        let mut subscriptions = WatchSubscriptions::default();

        subscriptions.subscribe(path, "reader-one");

        assert_eq!(
            subscriptions
                .subscription_for_key(r"\\?\c:\notes\watch.md")
                .unwrap()
                .path,
            path
        );
    }

    #[test]
    fn native_watcher_reports_a_saved_file_with_the_subscribed_path_key() {
        let directory = std::env::temp_dir().join(format!(
            "only-md-reader-watch-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let file = directory.join("live-sync.md");
        fs::write(&file, "before").unwrap();
        let expected_key = watch_path_key(&file).unwrap();
        let (sender, receiver) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(sender).unwrap();
        watcher.watch(&directory, RecursiveMode::NonRecursive).unwrap();

        fs::write(&file, "after").unwrap();

        let matches_subscription = (0..8).any(|_| {
            receiver
                .recv_timeout(Duration::from_secs(1))
                .ok()
                .map(|event: notify::Result<Event>| {
                    event
                        .ok()
                        .map(|event| {
                            event
                                .paths
                                .iter()
                                .filter_map(|path| watch_path_key(path).ok())
                                .any(|path_key| path_key == expected_key)
                        })
                        .unwrap_or(false)
                })
                .unwrap_or(false)
        });

        drop(watcher);
        fs::remove_dir_all(&directory).unwrap();
        assert!(matches_subscription);
    }
}
