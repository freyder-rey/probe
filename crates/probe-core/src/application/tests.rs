use std::collections::HashMap;

use super::{
    interpolate,
    validation::{resolve_path, run},
};
use crate::domain::{Response, Validation};

#[test]
fn interpolate_replaces_known_vars_and_keeps_unknown() {
    let mut vars = HashMap::new();
    vars.insert("id".to_string(), "42".to_string());
    vars.insert("nombre".to_string(), "ana".to_string());

    assert_eq!(interpolate("id={{id}}", &vars), "id=42");
    assert_eq!(interpolate("{{nombre}}-{{id}}", &vars), "ana-42");
    assert_eq!(
        interpolate("hola {{desconocida}}", &vars),
        "hola {{desconocida}}"
    );
    assert_eq!(interpolate("sin variables", &vars), "sin variables");
    assert_eq!(interpolate("", &vars), "");
}

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
    let json: serde_json::Value =
        serde_json::from_str(r#"{"users":[{"name":"ana"},{"name":"leo"}],"meta":{"page":2}}"#)
            .unwrap();
    assert_eq!(
        resolve_path(&json, "$.meta.page"),
        Some(&serde_json::json!(2))
    );
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
            Validation::StatusEquals {
                name: "ok".into(),
                expected: 200,
            },
            Validation::DurationLt {
                name: "rápido".into(),
                max_ms: 1000,
            },
            Validation::DurationLt {
                name: "lento".into(),
                max_ms: 100,
            },
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
            Validation::JsonEquals {
                name: "page".into(),
                path: "$.page".into(),
                expected: serde_json::json!(2),
            },
            Validation::JsonEquals {
                name: "page mal".into(),
                path: "$.page".into(),
                expected: serde_json::json!(3),
            },
            Validation::JsonExists {
                name: "existe".into(),
                path: "$.page".into(),
            },
            Validation::JsonExists {
                name: "no existe".into(),
                path: "$.nada".into(),
            },
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
            Validation::HeaderContains {
                name: "ct".into(),
                header: "Content-Type".into(),
                expected: "json".into(),
            },
            Validation::BodyContains {
                name: "contiene".into(),
                expected: "mundo".into(),
            },
            Validation::BodyEquals {
                name: "igual".into(),
                expected: "hola mundo".into(),
            },
            Validation::HeaderEquals {
                name: "hdr mal".into(),
                header: "content-type".into(),
                expected: "text/plain".into(),
            },
        ],
        &resp,
    );
    assert!(results[0].passed);
    assert!(results[1].passed);
    assert!(results[2].passed);
    assert!(!results[3].passed);
}
