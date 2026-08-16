use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTest {
    pub name: String,
    /// Solicitudes de la colección que ejecuta el test, en orden.
    /// Vacío = todas las solicitudes de la colección.
    #[serde(default)]
    pub request_names: Vec<String>,
    /// Veces que corre el flujo completo de solicitudes.
    #[serde(default = "default_iterations")]
    pub iterations: u64,
    /// Pausa entre cada solicitud (milisegundos).
    #[serde(default)]
    pub delay_ms: u64,
    /// Fuente de datos CSV (opcional). Cada fila define variables `{{nombre}}`.
    #[serde(default)]
    pub csv: Option<CsvSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CsvSource {
    /// Ruta local del archivo CSV. Se carga en memoria al ejecutar.
    Path { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadTestReport {
    pub test_name: String,
    pub duration_ms: u128,
    pub total_requests: u64,
    pub success: u64,
    pub failed: u64,
    pub avg_ms: u128,
    pub p95_ms: u128,
    pub per_request: Vec<RequestSummary>,
    /// Primeros errores de red/parseo encontrados (acotado).
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestSummary {
    pub name: String,
    pub total: u64,
    pub success: u64,
    pub failed: u64,
}

fn default_iterations() -> u64 {
    1
}
