use serde::{Deserialize, Serialize};

use super::request::Request;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub name: String,
    pub version: String,
    pub requests: Vec<Request>,
}
