use std::path::PathBuf;

use clap::{Parser, Subcommand};
use probe_core::{
    engine::Engine,
    model::{Body, Collection, KeyValue, Request, Response, Validation},
    storage::Storage,
};

#[derive(Parser)]
#[command(name = "probe", version, about = "Cliente de APIs desde la terminal")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Ejecuta una solicitud HTTP
    Run(RunArgs),
    /// Administra colecciones guardadas
    Collection(CollectionArgs),
}

#[derive(clap::Args)]
struct CollectionArgs {
    #[command(subcommand)]
    command: CollectionCommand,
}

#[derive(Subcommand)]
enum CollectionCommand {
    /// Lista las colecciones guardadas
    List,
    /// Importa una colección desde un archivo JSON
    Save { path: PathBuf },
    /// Crea una colección vacía
    New { name: String },
    /// Elimina una colección guardada
    Delete { name: String },
}

#[derive(clap::Args)]
struct RunArgs {
    /// URL del destino (o nombre de una colección guardada)
    #[arg(value_name = "URL_OR_COLLECTION")]
    target: Option<String>,

    /// Nombre de la solicitud dentro de la colección
    #[arg(long, value_name = "NOMBRE")]
    name: Option<String>,

    /// Verbo HTTP (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, ...)
    #[arg(long, default_value = "GET")]
    method: String,

    /// Cabecera en formato `Clave: Valor` (repetible)
    #[arg(long, value_parser = parse_header)]
    header: Vec<(String, String)>,

    /// Parámetro de query en formato `clave=valor` (repetible)
    #[arg(long, value_parser = parse_kv)]
    query: Vec<(String, String)>,

    /// Cuerpo crudo (raw)
    #[arg(long)]
    body: Option<String>,

    /// Cuerpo en formato urlencoded: `clave=valor` (repetible)
    #[arg(long, value_parser = parse_kv)]
    form: Vec<(String, String)>,

    /// Timeout en segundos (default: 30)
    #[arg(long, default_value_t = 30)]
    timeout: u64,

    /// No seguir redirecciones
    #[arg(long)]
    no_follow: bool,

    /// Validación en formato `tipo:valor:esperado` (repetible)
    /// tipos: status_equals, header_equals, header_contains, body_contains,
    /// body_equals, json_equals, json_exists, duration_lt
    #[arg(long, value_parser = parse_validation, value_name = "VALIDACION")]
    validate: Vec<Validation>,
}

fn parse_header(s: &str) -> Result<(String, String), String> {
    match s.split_once(':') {
        Some((k, v)) => Ok((k.trim().to_string(), v.trim().to_string())),
        None => Err(format!("cabecera inválida (esperaba `Clave: Valor`): {s}")),
    }
}

fn parse_kv(s: &str) -> Result<(String, String), String> {
    match s.split_once('=') {
        Some((k, v)) => Ok((k.to_string(), v.to_string())),
        None => Err(format!("par inválido (esperaba `clave=valor`): {s}")),
    }
}

fn parse_validation(s: &str) -> Result<Validation, String> {
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Run(args) => run(args).await,
        Command::Collection(args) => collection(args.command),
    }
}

fn collection(command: CollectionCommand) -> anyhow::Result<()> {
    let storage = Storage::new()?;
    match command {
        CollectionCommand::List => {
            let collections = storage.list()?;
            if collections.is_empty() {
                println!("No hay colecciones guardadas en {}", storage.dir().display());
                return Ok(());
            }
            println!("Colecciones en {}:", storage.dir().display());
            for c in collections {
                println!("  {}  ({} bytes)", c.name, c.size);
            }
        }
        CollectionCommand::Save { path } => {
            let collection = storage.load_file(&path)?;
            let saved = storage.save(&collection)?;
            println!("Colección \"{}\" guardada en {}", collection.name, saved.display());
        }
        CollectionCommand::New { name } => {
            let collection = Collection {
                name,
                version: "1".to_string(),
                requests: vec![],
            };
            let saved = storage.save(&collection)?;
            println!("Colección vacía creada en {}", saved.display());
        }
        CollectionCommand::Delete { name } => {
            storage.delete(&name)?;
            println!("Colección \"{name}\" eliminada.");
        }
    }
    Ok(())
}

async fn run(args: RunArgs) -> anyhow::Result<()> {
    let (target, name) = (args.target.clone(), args.name.clone());
    let request = match (target.as_deref(), name.as_deref()) {
        (Some(target), Some(name)) => {
            let storage = Storage::new()?;
            let collection = if target.ends_with(".json") {
                storage.load_file(&PathBuf::from(target))?
            } else {
                storage.load(target)?
            };
            collection
                .requests
                .into_iter()
                .find(|r| r.name == name)
                .ok_or_else(|| anyhow::anyhow!("solicitud \"{name}\" no encontrada en \"{target}\""))?
        }
        _ => build_inline_request(args)?,
    };

    let engine = Engine::new()?;
    let response = engine.execute(&request).await?;
    print_response(&response);
    Ok(())
}

fn build_inline_request(args: RunArgs) -> anyhow::Result<Request> {
    let url = args
        .target
        .clone()
        .unwrap_or_default();
    if url.is_empty() {
        anyhow::bail!("se requiere --url o <colección> --name <solicitud>");
    }

    let body = if let Some(content) = args.body {
        Body::Raw { content }
    } else if !args.form.is_empty() {
        Body::UrlEncoded {
            fields: args
                .form
                .iter()
                .map(|(k, v)| KeyValue::new(k, v))
                .collect(),
        }
    } else {
        Body::None
    };

    Ok(Request {
        id: None,
        name: args.method.clone(),
        method: args.method,
        url,
        query: args
            .query
            .iter()
            .map(|(k, v)| KeyValue::new(k, v))
            .collect(),
        headers: args
            .header
            .iter()
            .map(|(k, v)| KeyValue::new(k, v))
            .collect(),
        body,
        timeout_secs: args.timeout,
        follow_redirects: !args.no_follow,
        validations: args.validate,
    })
}

fn print_response(response: &Response) {
    println!("{} {}", response.status, response.status_text);
    println!("URL final: {}", response.url);
    println!(
        "Tiempo: {} ms | HTTP/{}",
        response.duration_ms,
        response.http_version.trim_start_matches("HTTP/")
    );
    println!();

    if !response.validation_results.is_empty() {
        println!("Validaciones:");
        for v in &response.validation_results {
            let mark = if v.passed { "PASÓ" } else { "FALLÓ" };
            println!("  [{mark}] {} — {}", v.name, v.detail);
        }
        println!();
    }

    if !response.headers.is_empty() {
        for (k, v) in &response.headers {
            println!("{k}: {v}");
        }
        println!();
    }

    if let Some(body) = &response.body {
        println!("{body}");
    }
}
