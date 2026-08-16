use serde::{Deserialize, Serialize};

use super::load_test::LoadTest;
use super::request::Request;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub name: String,
    pub version: String,
    pub requests: Vec<Request>,
    /// Tests de carga guardados en la colección.
    #[serde(default)]
    pub tests: Vec<LoadTest>,
}

/// Resumen de una colección (para listados). No expone detalles del almacenamiento.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub name: String,
    pub size: u64,
}
