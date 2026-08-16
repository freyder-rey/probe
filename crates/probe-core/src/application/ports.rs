//! Puertos (interfaces) que define la capa de aplicación.
//!
//! La infraestructura implementa estos traits; los consumidores externos
//! (CLI, servidor) dependen de los puertos, no de las implementaciones.

use std::{collections::HashMap, path::Path, sync::atomic::AtomicBool};

use anyhow::Result;
use async_trait::async_trait;

use crate::domain::{
    Collection, CollectionSummary, LoadTest, LoadTestReport, Request, Response, RunProgress,
};

/// Persistencia de colecciones de solicitudes.
pub trait CollectionRepository: Send + Sync {
    fn list(&self) -> Result<Vec<CollectionSummary>>;
    fn save(&self, collection: &Collection) -> Result<()>;
    fn load(&self, name: &str) -> Result<Collection>;
    fn load_file(&self, path: &Path) -> Result<Collection>;
    fn delete(&self, name: &str) -> Result<()>;
}

/// Ejecución HTTP de solicitudes.
#[async_trait]
pub trait HttpExecutor: Send + Sync {
    async fn execute(&self, req: &Request) -> Result<Response>;
}

/// Carga de filas CSV como variables de datos del test.
pub trait CsvRowLoader: Send + Sync {
    fn load(&self, path: &Path) -> Result<Vec<HashMap<String, String>>>;
}

/// Ejecutor de tests de carga.
#[async_trait]
pub trait LoadTestRunner: Send + Sync {
    async fn run(
        &self,
        test: &LoadTest,
        requests: &[Request],
        cancel: Option<&AtomicBool>,
        on_progress: Box<dyn Fn(RunProgress) + Send + Sync>,
    ) -> Result<LoadTestReport>;
}
