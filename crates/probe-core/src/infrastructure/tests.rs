use std::{
    fs,
    path::Path,
    sync::{Mutex, OnceLock},
};

use super::*;
use crate::application::CollectionRepository;
use crate::domain::Collection;
use crate::CsvRowLoader;

/// Serializa las pruebas que manipulan variables de entorno para que no
/// corran en paralelo entre sí (los tests de Rust corren multi-thread).
static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn env_lock() -> &'static Mutex<()> {
    ENV_LOCK.get_or_init(|| Mutex::new(()))
}

fn test_collection(name: &str) -> Collection {
    Collection {
        name: name.to_string(),
        version: "1".to_string(),
        requests: vec![],
        tests: vec![],
    }
}

fn test_storage() -> FileCollectionRepository {
    let counter = {
        static COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    };
    let dir = std::env::temp_dir().join(format!("probe-test-{}-{counter}", std::process::id()));
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
    let _guard = env_lock().lock().unwrap();
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

#[test]
fn save_path_returns_collection_path() {
    let storage = test_storage();
    let collection = test_collection("ruta");

    let path = storage.save_path(&collection).unwrap();
    assert_eq!(path.file_name().unwrap().to_str().unwrap(), "ruta.json");
    assert!(path.exists());
    assert_eq!(storage.load("ruta").unwrap().name, "ruta");
}

#[test]
fn load_missing_and_invalid_json_error() {
    let storage = test_storage();
    assert!(storage.load("no-existe").is_err());

    fs::write(storage.dir().join("roto.json"), "esto no es json").unwrap();
    let err = storage.load("roto").unwrap_err();
    assert!(err.to_string().contains("JSON inválido"));
}

#[test]
fn save_sanitizes_invalid_file_chars() {
    let storage = test_storage();
    let name = "a/b\\c:d*.json?";
    storage.save(&test_collection(name)).unwrap();

    assert!(storage.load(name).is_ok());
    let files: Vec<String> = fs::read_dir(storage.dir())
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(files, vec!["a_b_c_d_.json_.json".to_string()]);
}

#[test]
fn delete_missing_errors() {
    let storage = test_storage();
    assert!(storage.delete("no-existe").is_err());
}

#[test]
fn csv_dir_uses_env_override() {
    let _guard = env_lock().lock().unwrap();
    let dir = std::env::temp_dir().join(format!("probe-csv-{}", std::process::id()));
    std::env::set_var("PROBE_COLLECTIONS_DIR", &dir);
    let csv = csv_dir().unwrap();
    assert_eq!(csv, dir.join("csv"));
    assert!(csv.is_dir());
    std::env::remove_var("PROBE_COLLECTIONS_DIR");
}

#[test]
fn storage_falls_back_to_home() {
    let _guard = env_lock().lock().unwrap();
    let dir = std::env::temp_dir().join(format!("probe-home-{}", std::process::id()));
    std::env::remove_var("PROBE_COLLECTIONS_DIR");
    std::env::set_var("HOME", &dir);
    let storage = FileCollectionRepository::new().unwrap();
    assert_eq!(storage.dir(), dir.join(".probe").join("collections"));
    std::env::remove_var("HOME");
}

#[test]
fn in_memory_load_file_and_default() {
    let repo = InMemoryCollectionRepository::default();
    assert!(repo.load_file(Path::new("/tmp/x.json")).is_err());
    assert!(repo.list().unwrap().is_empty());
}

#[test]
fn in_memory_save_overwrites() {
    let repo = InMemoryCollectionRepository::new();
    let mut v2 = test_collection("x");
    v2.version = "2".to_string();
    repo.save(&test_collection("x")).unwrap();
    repo.save(&v2).unwrap();

    let loaded = repo.load("x").unwrap();
    assert_eq!(loaded.version, "2");
    assert_eq!(
        repo.list().unwrap()[0].size,
        serde_json::to_vec(&v2).unwrap().len() as u64
    );
}

#[test]
fn csv_loader_trait_reads_rows() {
    let loader = CsvLoader;
    let path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("src/infrastructure/testdata/usuarios.csv");
    let rows = loader.load(&path).unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0].get("nombre").map(String::as_str), Some("ana"));
}
