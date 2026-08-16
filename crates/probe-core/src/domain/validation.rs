use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Validation {
    StatusEquals { name: String, expected: u16 },
    HeaderEquals { name: String, header: String, expected: String },
    HeaderContains { name: String, header: String, expected: String },
    BodyContains { name: String, expected: String },
    BodyEquals { name: String, expected: String },
    JsonEquals { name: String, path: String, expected: serde_json::Value },
    JsonExists { name: String, path: String },
    DurationLt { name: String, max_ms: u64 },
}
