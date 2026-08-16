use std::{fs, path::Path};

use super::*;
use crate::application::CollectionRepository;
use crate::domain::Collection;

fn test_storage() -> FileCollectionRepository {
    let dir = std::env::temp_dir().join(format!("probe-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    FileCollectionRepository { dir }
}

#[test]
fn save_list_load_delete() {
    let storage = test_storage();
    let collection = Collection {
        name: "Mi colección".to_string(),
        version: "1".to_string(),
        requests: vec![],
        tests: vec![],
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
fn in_memory_repo_round_trips() {
    let repo = InMemoryCollectionRepository::new();
    let collection = Collection {
        name: "memoria".to_string(),
        version: "1".to_string(),
        requests: vec![],
        tests: vec![],
    };

    repo.save(&collection).unwrap();
    let list = repo.list().unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(repo.load("memoria").unwrap().name, "memoria");
    assert!(repo.load("no-existe").is_err());
    repo.delete("memoria").unwrap();
    assert!(repo.list().unwrap().is_empty());
}

#[test]
fn custom_env_dir_is_used() {
    let dir = std::env::temp_dir().join(format!("probe-env-{}", std::process::id()));
    std::env::set_var("PROBE_COLLECTIONS_DIR", &dir);
    let storage = FileCollectionRepository::new().unwrap();
    assert_eq!(storage.dir(), dir.as_path());
    std::env::remove_var("PROBE_COLLECTIONS_DIR");
}

#[test]
fn csv_rows_use_headers_as_variable_names() {
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src/infrastructure/testdata/usuarios.csv");
    let rows = load_csv_rows(&path).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].get("id").map(String::as_str), Some("1"));
    assert_eq!(rows[0].get("nombre").map(String::as_str), Some("ana"));
    assert_eq!(rows[1].get("id").map(String::as_str), Some("2"));
    assert_eq!(rows[1].get("nombre").map(String::as_str), Some("leo"));
}

#[test]
fn csv_missing_file_errors() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("no-existe.csv");
    assert!(load_csv_rows(&path).is_err());
}
