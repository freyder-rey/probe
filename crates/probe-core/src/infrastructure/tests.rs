use std::fs;

use super::*;
use crate::domain::Collection;

fn test_storage() -> Storage {
    let dir = std::env::temp_dir().join(format!(
        "probe-test-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    Storage { dir }
}

#[test]
fn save_list_load_delete() {
    let storage = test_storage();
    let collection = Collection {
        name: "Mi colección".to_string(),
        version: "1".to_string(),
        requests: vec![],
    };

    storage.save(&collection).unwrap();

    let list = storage.list().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].name, "Mi colección");

    let loaded = storage.load("Mi colección").unwrap();
    assert_eq!(loaded.name, "Mi colección");

    storage.delete("Mi colección").unwrap();
    assert!(storage.list().unwrap().is_empty());
}

#[test]
fn custom_env_dir_is_used() {
    let dir = std::env::temp_dir().join(format!("probe-env-{}", std::process::id()));
    std::env::set_var("PROBE_COLLECTIONS_DIR", &dir);
    let storage = Storage::new().unwrap();
    assert_eq!(storage.dir(), dir.as_path());
    std::env::remove_var("PROBE_COLLECTIONS_DIR");
}
