use std::{
    collections::HashMap,
    path::Path,
    sync::Mutex,
};

use anyhow::{bail, Result};

use crate::{
    application::CollectionRepository,
    domain::{Collection, CollectionSummary},
};

/// Repositorio de colecciones en memoria. Útil para tests y modos sin disco.
pub struct InMemoryCollectionRepository {
    collections: Mutex<HashMap<String, Collection>>,
}

impl InMemoryCollectionRepository {
    pub fn new() -> Self {
        InMemoryCollectionRepository {
            collections: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for InMemoryCollectionRepository {
    fn default() -> Self {
        Self::new()
    }
}

impl CollectionRepository for InMemoryCollectionRepository {
    fn list(&self) -> Result<Vec<CollectionSummary>> {
        let mut collections: Vec<CollectionSummary> = self
            .collections
            .lock()
            .map_err(|_| anyhow::anyhow!("estado en memoria envenenado"))?
            .values()
            .map(|c| CollectionSummary {
                name: c.name.clone(),
                size: serde_json::to_vec(c).map(|b| b.len() as u64).unwrap_or(0),
            })
            .collect();
        collections.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(collections)
    }

    fn save(&self, collection: &Collection) -> Result<()> {
        let mut collections = self
            .collections
            .lock()
            .map_err(|_| anyhow::anyhow!("estado en memoria envenenado"))?;
        collections.insert(collection.name.clone(), collection.clone());
        Ok(())
    }

    fn load(&self, name: &str) -> Result<Collection> {
        let collections = self
            .collections
            .lock()
            .map_err(|_| anyhow::anyhow!("estado en memoria envenenado"))?;
        collections
            .get(name)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("la colección \"{name}\" no existe"))
    }

    fn load_file(&self, _path: &Path) -> Result<Collection> {
        bail!("el repositorio en memoria no lee archivos")
    }

    fn delete(&self, name: &str) -> Result<()> {
        let mut collections = self
            .collections
            .lock()
            .map_err(|_| anyhow::anyhow!("estado en memoria envenenado"))?;
        collections.remove(name);
        Ok(())
    }
}
