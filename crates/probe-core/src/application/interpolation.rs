use std::collections::{HashMap, HashSet};

use crate::domain::{Body, Request};

/// Reemplaza los placeholders `{{nombre}}` y `:nombre` con el valor de la variable.
/// Las variables desconocidas se dejan intactas para que el usuario las vea.
pub fn interpolate(template: &str, vars: &HashMap<String, String>) -> String {
    if vars.is_empty() {
        return template.to_string();
    }
    let mut out = template.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("{{{{{key}}}}}"), value);
        out = out.replace(&format!(":{key}"), value);
    }
    out
}

/// Extrae todos los nombres de variables `{{nombre}}` usadas en las solicitudes
/// (URL, query, headers, body).
pub fn extract_variables(requests: &[&Request]) -> HashSet<String> {
    let mut vars = HashSet::new();
    for req in requests {
        extract_from_str(&req.url, &mut vars);
        for kv in &req.query {
            extract_from_str(&kv.key, &mut vars);
            extract_from_str(&kv.value, &mut vars);
        }
        for kv in &req.headers {
            extract_from_str(&kv.key, &mut vars);
            extract_from_str(&kv.value, &mut vars);
        }
        match &req.body {
            Body::None => {}
            Body::Raw { content } => extract_from_str(content, &mut vars),
            Body::UrlEncoded { fields } => {
                for kv in fields {
                    extract_from_str(&kv.key, &mut vars);
                    extract_from_str(&kv.value, &mut vars);
                }
            }
        }
    }
    vars
}

fn extract_from_str(s: &str, out: &mut HashSet<String>) {
    let mut remaining = s.as_bytes();
    while let Some(start) = find_pattern(remaining, b"{{") {
        let rest = &remaining[start + 2..];
        if let Some(end) = find_pattern(rest, b"}}") {
            let name = String::from_utf8_lossy(&rest[..end]).to_string();
            if !name.is_empty() {
                out.insert(name);
            }
            remaining = &rest[end + 2..];
        } else {
            break;
        }
    }
}

fn find_pattern(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|w| w == needle)
}
