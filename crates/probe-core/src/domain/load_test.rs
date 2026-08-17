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

/// Resultado de una ejecución individual (una solicitud × una iteración/CSV row).
/// Lo emite el runner en cada `RunProgress` para construir el log en vivo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEvent {
    pub request: String,
    /// Iteración 1-based en la que se ejecutó la solicitud.
    pub iteration: u64,
    /// Índice 0-based de la fila CSV usada en esta iteración (None si no hay CSV).
    pub csv_row: Option<u64>,
    /// Método HTTP (GET, POST, PUT, etc.).
    pub method: String,
    /// URL interpolada a la que se envió la solicitud.
    pub url: String,
    /// Status HTTP real de la respuesta (None si hubo error de red/parseo).
    pub status: Option<u16>,
    /// true si pasó (sin validaciones fallidas y sin error de red).
    pub ok: bool,
    pub duration_ms: u128,
    /// Mensaje de error de red/parseo, si lo hubo.
    pub error: Option<String>,
}

/// Progreso en vivo de una ejecución: qué se ejecutó, qué se está ejecutando
/// ahora y el acumulado por solicitud. Lo emite el runner vía `on_progress` y
/// lo consume el servidor para el SSE (progreso real-time en la web).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProgress {
    /// Solicitudes completadas (siguiente índice a ejecutar).
    pub done: u64,
    pub total: u64,
    /// Solicitud que se está ejecutando en este momento (si hay una).
    pub current_request: Option<String>,
    /// Acumulado por solicitud hasta el momento.
    pub per_request: Vec<RequestSummary>,
    /// Última ejecución completada (para el log en vivo secuencial).
    pub last_event: Option<RunEvent>,
}

fn default_iterations() -> u64 {
    1
}
