use crate::model::{Response, Validation, ValidationResult};

pub fn run(validations: &[Validation], response: &Response) -> Vec<ValidationResult> {
    validations.iter().map(|v| evaluate(v, response)).collect()
}

fn evaluate(v: &Validation, response: &Response) -> ValidationResult {
    let (passed, detail) = match v {
        Validation::StatusEquals { name: _, expected } => {
            let actual = response.status;
            (
                actual == *expected,
                format!("status esperado {expected}, obtenido {actual}"),
            )
        }
        Validation::HeaderEquals { header, expected, .. } => {
            let actual = find_header(response, header);
            match actual {
                Some(value) => (
                    value == *expected,
                    format!("header \"{header}\" esperado \"{expected}\", obtenido \"{value}\""),
                ),
                None => (false, format!("header \"{header}\" no presente")),
            }
        }
        Validation::HeaderContains { header, expected, .. } => {
            let actual = find_header(response, header);
            match actual {
                Some(value) => (
                    value.contains(expected),
                    format!("header \"{header}\" = \"{value}\", debe contener \"{expected}\""),
                ),
                None => (false, format!("header \"{header}\" no presente")),
            }
        }
        Validation::BodyContains { expected, .. } => {
            let body = response.body.as_deref().unwrap_or("");
            (
                body.contains(expected),
                format!("el cuerpo debe contener \"{expected}\""),
            )
        }
        Validation::BodyEquals { expected, .. } => {
            let body = response.body.as_deref().unwrap_or("");
            (
                body == expected,
                format!("el cuerpo debe ser igual a \"{expected}\""),
            )
        }
        Validation::JsonExists { path, .. } => match response.body.as_deref() {
            Some(body) => match serde_json::from_str::<serde_json::Value>(body) {
                Ok(json) => {
                    let found = resolve_path(&json, path);
                    (
                        found.is_some(),
                        match found {
                            Some(_) => format!("la ruta \"{path}\" existe"),
                            None => format!("la ruta \"{path}\" no existe"),
                        },
                    )
                }
                Err(_) => (false, "el cuerpo no es JSON válido".to_string()),
            },
            None => (false, "la respuesta no tiene cuerpo".to_string()),
        },
        Validation::JsonEquals { path, expected, .. } => match response.body.as_deref() {
            Some(body) => match serde_json::from_str::<serde_json::Value>(body) {
                Ok(json) => match resolve_path(&json, path) {
                    Some(actual) => {
                        let eq = actual == expected;
                        (
                            eq,
                            format!(
                                "la ruta \"{path}\" esperada {expected}, obtenida {actual}"
                            ),
                        )
                    }
                    None => (false, format!("la ruta \"{path}\" no existe")),
                },
                Err(_) => (false, "el cuerpo no es JSON válido".to_string()),
            },
            None => (false, "la respuesta no tiene cuerpo".to_string()),
        },
        Validation::DurationLt { max_ms, .. } => {
            let actual = response.duration_ms;
            (
                actual < u128::from(*max_ms),
                format!("duración esperada < {max_ms} ms, obtenida {actual} ms"),
            )
        }
    };

    let name = match v {
        Validation::StatusEquals { name, .. }
        | Validation::HeaderEquals { name, .. }
        | Validation::HeaderContains { name, .. }
        | Validation::BodyContains { name, .. }
        | Validation::BodyEquals { name, .. }
        | Validation::JsonEquals { name, .. }
        | Validation::JsonExists { name, .. }
        | Validation::DurationLt { name, .. } => name.clone(),
    };

    ValidationResult { name, passed, detail }
}

fn find_header(response: &Response, key: &str) -> Option<String> {
    response
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.clone())
}

fn resolve_path<'a>(json: &'a serde_json::Value, path: &str) -> Option<&'a serde_json::Value> {
    let mut current = json;
    let path = path.strip_prefix('$').unwrap_or(path);

    let mut rest = path;
    loop {
        if let Some(key) = rest.strip_prefix('.') {
            let end = key.find(['.', '[']).unwrap_or(key.len());
            if key[..end].is_empty() {
                return None;
            }
            current = current.get(&key[..end])?;
            rest = &key[end..];
            continue;
        }
        if let Some(index_str) = rest.strip_prefix('[') {
            let end = index_str.find(']')?;
            let index = index_str[..end].parse::<usize>().ok()?;
            current = current.get(index)?;
            rest = &index_str[end + 1..];
            continue;
        }
        if rest.is_empty() {
            return Some(current);
        }
        return None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Response;

    fn response(body: Option<&str>, status: u16, duration_ms: u128) -> Response {
        Response {
            status,
            status_text: String::new(),
            http_version: "HTTP/1.1".to_string(),
            headers: vec![("content-type".to_string(), "application/json".to_string())],
            body: body.map(|b| b.to_string()),
            duration_ms,
            url: "https://example.com".to_string(),
            validation_results: vec![],
        }
    }

    #[test]
    fn json_path_resolves() {
        let json: serde_json::Value = serde_json::from_str(
            r#"{"users":[{"name":"ana"},{"name":"leo"}],"meta":{"page":2}}"#,
        )
        .unwrap();
        assert_eq!(resolve_path(&json, "$.meta.page"), Some(&serde_json::json!(2)));
        assert_eq!(
            resolve_path(&json, "$.users[0].name"),
            Some(&serde_json::json!("ana"))
        );
        assert_eq!(resolve_path(&json, "$.missing"), None);
        assert_eq!(resolve_path(&json, "$.users[9]"), None);
    }

    #[test]
    fn status_and_duration() {
        let resp = response(Some("{}"), 200, 500);
        let results = run(
            &[
                Validation::StatusEquals { name: "ok".into(), expected: 200 },
                Validation::DurationLt { name: "rápido".into(), max_ms: 1000 },
                Validation::DurationLt { name: "lento".into(), max_ms: 100 },
            ],
            &resp,
        );
        assert!(results[0].passed);
        assert!(results[1].passed);
        assert!(!results[2].passed);
    }

    #[test]
    fn json_validations() {
        let resp = response(Some(r#"{"page":2}"#), 200, 10);
        let results = run(
            &[
                Validation::JsonEquals { name: "page".into(), path: "$.page".into(), expected: serde_json::json!(2) },
                Validation::JsonEquals { name: "page mal".into(), path: "$.page".into(), expected: serde_json::json!(3) },
                Validation::JsonExists { name: "existe".into(), path: "$.page".into() },
                Validation::JsonExists { name: "no existe".into(), path: "$.nada".into() },
            ],
            &resp,
        );
        assert!(results[0].passed);
        assert!(!results[1].passed);
        assert!(results[2].passed);
        assert!(!results[3].passed);
    }

    #[test]
    fn header_and_body() {
        let resp = response(Some("hola mundo"), 200, 10);
        let results = run(
            &[
                Validation::HeaderContains { name: "ct".into(), header: "Content-Type".into(), expected: "json".into() },
                Validation::BodyContains { name: "contiene".into(), expected: "mundo".into() },
                Validation::BodyEquals { name: "igual".into(), expected: "hola mundo".into() },
                Validation::HeaderEquals { name: "hdr mal".into(), header: "content-type".into(), expected: "text/plain".into() },
            ],
            &resp,
        );
        assert!(results[0].passed);
        assert!(results[1].passed);
        assert!(results[2].passed);
        assert!(!results[3].passed);
    }
}
