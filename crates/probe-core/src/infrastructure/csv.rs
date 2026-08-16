use std::{collections::HashMap, path::Path};

use anyhow::{Context, Result};

use crate::application::CsvRowLoader;

/// Lee un archivo CSV y devuelve una fila por registro.
/// La primera fila define los nombres de variable (encabezados).
pub fn load_csv_rows(path: &Path) -> Result<Vec<HashMap<String, String>>> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_path(path)
        .with_context(|| format!("no se pudo abrir el CSV {}", path.display()))?;

    let headers = reader
        .headers()
        .with_context(|| format!("CSV sin encabezados en {}", path.display()))?
        .clone();

    let mut rows = Vec::new();
    for record in reader.records() {
        let record = record.with_context(|| format!("CSV inválido en {}", path.display()))?;
        let mut row = HashMap::new();
        for (i, header) in headers.iter().enumerate() {
            if let Some(value) = record.get(i) {
                row.insert(header.trim().to_string(), value.trim().to_string());
            }
        }
        rows.push(row);
    }
    Ok(rows)
}

/// Implementación de `CsvRowLoader` sobre archivos locales.
#[derive(Default)]
pub struct CsvLoader;

impl CsvRowLoader for CsvLoader {
    fn load(&self, path: &Path) -> Result<Vec<HashMap<String, String>>> {
        load_csv_rows(path)
    }
}
