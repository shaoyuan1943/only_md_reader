use std::path::Path;

use only_md_reader_lib::markdown_file_watch::{watch_path_key, WatchSubscriptions};

#[test]
fn keeps_a_missing_markdown_path_absolute_without_canonicalizing() {
    assert_eq!(
        watch_path_key(Path::new(r"C:\\notes\\missing.md")).unwrap(),
        r"c:\\notes\\missing.md"
    );
}

#[test]
fn releases_a_directory_when_its_last_window_subscription_is_removed() {
    let mut subscriptions = WatchSubscriptions::default();
    subscriptions.subscribe(r"C:\\notes\\one.md", "reader-one");

    assert_eq!(
        subscriptions.unsubscribe_window("reader-one"),
        vec![r"c:\\notes".to_string()]
    );
}
