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
