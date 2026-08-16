//! Export de colecciones a Markdown legible (decisión D1).
//!
//! Plantilla fija: una sección `##` por solicitud con método, URL (con query),
//! headers y body. Es solo export/visualización; el JSON sigue siendo la fuente
//! de verdad.

use crate::domain::{Body, Collection, KeyValue, Request};

/// Serializa la colección a Markdown siguiendo la plantilla D1 del SPEC.
pub fn collection_to_markdown(collection: &Collection) -> String {
    let mut out = String::new();
    out.push_str(&format!("# {}\n\n", collection.name));

    for (i, req) in collection.requests.iter().enumerate() {
        if i > 0 {
            out.push_str("---\n\n");
        }
        push_request(&mut out, req);
    }

    if collection.requests.is_empty() {
        out.push_str("_(sin solicitudes)_\n\n");
    }

    out.push_str("---\n\n_Generado desde la colección ");
    out.push_str(&format!("`{}.json`_", collection.name));
    out.push('\n');
    out
}

fn push_request(out: &mut String, req: &Request) {
    let url = full_url(req);
    let path = url_path(&req.url);
    out.push_str(&format!("## {} {} — {}\n\n", req.method, path, req.name));
    out.push_str(&format!("- **Método:** {}\n", req.method));
    out.push_str(&format!("- **URL:** {}\n\n", url));

    let headers: Vec<&KeyValue> = req.headers.iter().filter(|kv| kv.enabled).collect();
    if !headers.is_empty() {
        out.push_str("**Headers**\n\n```text\n");
        for kv in &headers {
            out.push_str(&format!("{}: {}\n", kv.key, kv.value));
        }
        out.push_str("```\n\n");
    }

    match &req.body {
        Body::None => {}
        Body::Raw { content } => {
            out.push_str("**Body**\n\n```json\n");
            out.push_str(content);
            out.push_str("\n```\n\n");
        }
        Body::UrlEncoded { fields } => {
            let fields: Vec<&KeyValue> = fields.iter().filter(|kv| kv.enabled).collect();
            out.push_str("**Body (urlencoded)**\n\n```text\n");
            for kv in &fields {
                out.push_str(&format!("{}={}\n", kv.key, kv.value));
            }
            out.push_str("```\n\n");
        }
    }

    if !req.validations.is_empty() {
        out.push_str("**Validaciones**\n\n");
        for v in &req.validations {
            out.push_str(&format!("- {}\n", v.name()));
        }
        out.push('\n');
    }
}

fn full_url(req: &Request) -> String {
    let query: Vec<&KeyValue> = req.query.iter().filter(|kv| kv.enabled).collect();
    if query.is_empty() {
        return req.url.clone();
    }
    let params: Vec<String> = query
        .iter()
        .map(|kv| format!("{}={}", kv.key, kv.value))
        .collect();
    let sep = if req.url.contains('?') { '&' } else { '?' };
    format!("{}{}{}", req.url, sep, params.join("&"))
}

/// Path de la URL (sin scheme/host ni query) para el encabezado `##`.
fn url_path(url: &str) -> String {
    let after_scheme = match url.find("://") {
        Some(i) => &url[i + 3..],
        None => url,
    };
    let path = after_scheme
        .find('/')
        .map(|i| &after_scheme[i..])
        .unwrap_or("/");
    let path = path.split(['?', '#']).next().unwrap_or(path);
    if path.is_empty() {
        "/".to_string()
    } else {
        path.to_string()
    }
}
