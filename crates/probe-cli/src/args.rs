use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};
use probe_core::Validation;

#[derive(Parser)]
#[command(name = "probe", version, about = "Cliente de APIs desde la terminal")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Ejecuta una solicitud HTTP
    Run(RunArgs),
    /// Administra colecciones guardadas
    Collection(CollectionArgs),
    /// Ejecuta tests de carga sobre una colección
    Test(TestArgs),
}

#[derive(Args)]
pub struct TestArgs {
    #[command(subcommand)]
    pub command: TestCommand,
}

#[derive(Subcommand)]
pub enum TestCommand {
    /// Lista los tests definidos en una colección
    List { collection: String },
    /// Ejecuta un test de carga
    Run {
        /// Colección (nombre o ruta .json)
        collection: String,
        /// Nombre del test a ejecutar
        test: String,
        /// Sobreescribe las iteraciones del test
        #[arg(long)]
        iterations: Option<u64>,
        /// Sobreescribe el delay entre peticiones (ms)
        #[arg(long)]
        delay: Option<u64>,
    },
}

#[derive(Args)]
pub struct CollectionArgs {
    #[command(subcommand)]
    pub command: CollectionCommand,
}

#[derive(Subcommand)]
pub enum CollectionCommand {
    /// Lista las colecciones guardadas
    List,
    /// Importa una colección desde un archivo JSON
    Save { path: PathBuf },
    /// Crea una colección vacía
    New { name: String },
    /// Elimina una colección guardada
    Delete { name: String },
}

#[derive(Args)]
pub struct RunArgs {
    /// URL del destino (o nombre de una colección guardada)
    #[arg(value_name = "URL_OR_COLLECTION")]
    pub target: Option<String>,

    /// Nombre de la solicitud dentro de la colección
    #[arg(long, value_name = "NOMBRE")]
    pub name: Option<String>,

    /// Verbo HTTP (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, ...)
    #[arg(long, default_value = "GET")]
    pub method: String,

    /// Cabecera en formato `Clave: Valor` (repetible)
    #[arg(long, value_parser = parse_header)]
    pub header: Vec<(String, String)>,

    /// Parámetro de query en formato `clave=valor` (repetible)
    #[arg(long, value_parser = parse_kv)]
    pub query: Vec<(String, String)>,

    /// Cuerpo crudo (raw)
    #[arg(long)]
    pub body: Option<String>,

    /// Cuerpo en formato urlencoded: `clave=valor` (repetible)
    #[arg(long, value_parser = parse_kv)]
    pub form: Vec<(String, String)>,

    /// Timeout en segundos (default: 30)
    #[arg(long, default_value_t = 30)]
    pub timeout: u64,

    /// No seguir redirecciones
    #[arg(long)]
    pub no_follow: bool,

    /// Validación en formato `tipo:valor:esperado` (repetible)
    /// tipos: status_equals, header_equals, header_contains, body_contains,
    /// body_equals, json_equals, json_exists, duration_lt
    #[arg(long, value_parser = parse_validation, value_name = "VALIDACION")]
    pub validate: Vec<Validation>,
}

pub fn parse_header(s: &str) -> Result<(String, String), String> {
    match s.split_once(':') {
        Some((k, v)) => Ok((k.trim().to_string(), v.trim().to_string())),
        None => Err(format!("cabecera inválida (esperaba `Clave: Valor`): {s}")),
    }
}

pub fn parse_kv(s: &str) -> Result<(String, String), String> {
    match s.split_once('=') {
        Some((k, v)) => Ok((k.to_string(), v.to_string())),
        None => Err(format!("par inválido (esperaba `clave=valor`): {s}")),
    }
}

pub fn parse_validation(s: &str) -> Result<Validation, String> {
    let (kind, rest) = s.split_once(':').ok_or("formato: `tipo:campo:esperado`")?;
    let name = s.to_string();
    match kind {
        "status_equals" => {
            let expected = rest
                .parse::<u16>()
                .map_err(|_| "status_equals: código inválido")?;
            Ok(Validation::StatusEquals { name, expected })
        }
        "header_equals" | "header_contains" => {
            let (header, expected) = rest
                .split_once(':')
                .ok_or("header_equals/header_contains: formato `tipo:header:valor`")?;
            let header = header.to_string();
            let expected = expected.to_string();
            if kind == "header_equals" {
                Ok(Validation::HeaderEquals { name, header, expected })
            } else {
                Ok(Validation::HeaderContains { name, header, expected })
            }
        }
        "body_contains" => Ok(Validation::BodyContains { name, expected: rest.to_string() }),
        "body_equals" => Ok(Validation::BodyEquals { name, expected: rest.to_string() }),
        "json_equals" => {
            let (path, raw) = rest
                .split_once(':')
                .ok_or("json_equals: formato `json_equals:ruta:valor`")?;
            let expected = serde_json::from_str(raw).unwrap_or(serde_json::Value::String(raw.to_string()));
            Ok(Validation::JsonEquals { name, path: path.to_string(), expected })
        }
        "json_exists" => Ok(Validation::JsonExists { name, path: rest.to_string() }),
        "duration_lt" => {
            let max_ms = rest
                .parse::<u64>()
                .map_err(|_| "duration_lt: ms inválido")?;
            Ok(Validation::DurationLt { name, max_ms })
        }
        other => Err(format!("tipo de validación desconocido: {other}")),
    }
}
