use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Validation {
    StatusEquals {
        name: String,
        expected: u16,
    },
    HeaderEquals {
        name: String,
        header: String,
        expected: String,
    },
    HeaderContains {
        name: String,
        header: String,
        expected: String,
    },
    BodyContains {
        name: String,
        expected: String,
    },
    BodyEquals {
        name: String,
        expected: String,
    },
    JsonEquals {
        name: String,
        path: String,
        expected: serde_json::Value,
    },
    JsonExists {
        name: String,
        path: String,
    },
    DurationLt {
        name: String,
        max_ms: u64,
    },
}

impl Validation {
    /// Nombre declarativo de la validación (para reportes y export).
    pub fn name(&self) -> &str {
        match self {
            Validation::StatusEquals { name, .. }
            | Validation::HeaderEquals { name, .. }
            | Validation::HeaderContains { name, .. }
            | Validation::BodyContains { name, .. }
            | Validation::BodyEquals { name, .. }
            | Validation::JsonEquals { name, .. }
            | Validation::JsonExists { name, .. }
            | Validation::DurationLt { name, .. } => name,
        }
    }
}
