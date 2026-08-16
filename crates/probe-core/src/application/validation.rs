use crate::domain::{Response, Validation, ValidationResult};

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
        Validation::HeaderEquals {
            header, expected, ..
        } => {
            let actual = find_header(response, header);
            match actual {
                Some(value) => (
                    value == *expected,
                    format!("header \"{header}\" esperado \"{expected}\", obtenido \"{value}\""),
                ),
                None => (false, format!("header \"{header}\" no presente")),
            }
        }
        Validation::HeaderContains {
            header, expected, ..
        } => {
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
                            format!("la ruta \"{path}\" esperada {expected}, obtenida {actual}"),
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

    ValidationResult {
        name,
        passed,
        detail,
    }
}

fn find_header(response: &Response, key: &str) -> Option<String> {
    response
        .headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.clone())
}

pub(crate) fn resolve_path<'a>(
    json: &'a serde_json::Value,
    path: &str,
) -> Option<&'a serde_json::Value> {
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
