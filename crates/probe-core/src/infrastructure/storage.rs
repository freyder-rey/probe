use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};

use crate::domain::Collection;

pub struct Storage {
    pub(crate) dir: PathBuf,
}

impl Storage {
    pub fn new() -> Result<Self> {
        let dir = collections_dir()?;
        fs::create_dir_all(&dir)
            .with_context(|| format!("no se pudo crear el directorio de colecciones: {}", dir.display()))?;
        Ok(Storage { dir })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn list(&self) -> Result<Vec<CollectionSummary>> {
        let mut collections = Vec::new();
        for entry in fs::read_dir(&self.dir)
            .with_context(|| format!("no se pudo leer {}", self.dir.display()))?
        {
            let entry = entry?;
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "json") {
                let name = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                collections.push(CollectionSummary { name, path, size });
            }
        }
        collections.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(collections)
    }

    pub fn save(&self, collection: &Collection) -> Result<PathBuf> {
        let path = self.collection_path(&collection.name);
        let json = serde_json::to_string_pretty(collection)
            .context("no se pudo serializar la colección")?;
        fs::write(&path, json)
            .with_context(|| format!("no se pudo escribir {}", path.display()))?;
        Ok(path)
    }

    pub fn load(&self, name: &str) -> Result<Collection> {
        self.load_file(&self.collection_path(name))
    }

    pub fn load_file(&self, path: &Path) -> Result<Collection> {
        let content = fs::read_to_string(path)
            .with_context(|| format!("no se pudo leer {}", path.display()))?;
        let collection: Collection = serde_json::from_str(&content)
            .with_context(|| format!("JSON inválido en {}", path.display()))?;
        Ok(collection)
    }

    pub fn delete(&self, name: &str) -> Result<()> {
        let path = self.collection_path(name);
        fs::remove_file(&path)
            .with_context(|| format!("no se pudo eliminar {}", path.display()))
    }

    fn collection_path(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{}.json", sanitize_name(name)))
    }
}

pub struct CollectionSummary {
    pub name: String,
    pub path: PathBuf,
    pub size: u64,
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

fn collections_dir() -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("PROBE_COLLECTIONS_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .context("no se pudo determinar el directorio de inicio del usuario")?;
    Ok(PathBuf::from(home).join(".probe").join("collections"))
}
