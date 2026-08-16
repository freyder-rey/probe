use std::sync::Arc;

use probe_core::{Body, CollectionRepository, HttpExecutor, KeyValue, Request, Response};

use crate::args::RunArgs;

pub async fn run(
    args: RunArgs,
    repo: Arc<dyn CollectionRepository>,
    engine: Arc<dyn HttpExecutor>,
) -> anyhow::Result<()> {
    let (target, name) = (args.target.clone(), args.name.clone());
    let request = match (target.as_deref(), name.as_deref()) {
        (Some(target), Some(name)) => {
            let collection = if target.ends_with(".json") {
                repo.load_file(&std::path::PathBuf::from(target))?
            } else {
                repo.load(target)?
            };
            collection
                .requests
                .into_iter()
                .find(|r| r.name == name)
                .ok_or_else(|| {
                    anyhow::anyhow!("solicitud \"{name}\" no encontrada en \"{target}\"")
                })?
        }
        _ => build_inline_request(args)?,
    };

    let response = engine.execute(&request).await?;
    print_response(&response);
    Ok(())
}

fn build_inline_request(args: RunArgs) -> anyhow::Result<Request> {
    let url = args.target.clone().unwrap_or_default();
    if url.is_empty() {
        anyhow::bail!("se requiere --url o <colección> --name <solicitud>");
    }

    let body = if let Some(content) = args.body {
        Body::Raw { content }
    } else if !args.form.is_empty() {
        Body::UrlEncoded {
            fields: args.form.iter().map(|(k, v)| KeyValue::new(k, v)).collect(),
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

pub fn print_response(response: &Response) {
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
