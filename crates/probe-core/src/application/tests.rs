use std::collections::HashMap;

use axum::{extract::Query, http::HeaderMap, routing::any, Router};

use super::{
    collection_to_markdown,
    engine::Engine,
    extract_variables,
    interpolate,
    validation::{resolve_path, run},
};
use crate::domain::{Body, Collection, KeyValue, Request, Response, Validation};

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

#[test]
fn interpolate_replaces_path_params() {
    let mut vars = HashMap::new();
    vars.insert("id".to_string(), "42".to_string());
    vars.insert("user".to_string(), "ana".to_string());

    assert_eq!(
        interpolate("/users/:id/posts", &vars),
        "/users/42/posts"
    );
    assert_eq!(
        interpolate("/:user/profile", &vars),
        "/ana/profile"
    );
    assert_eq!(
        interpolate("/users/:user/:id", &vars),
        "/users/ana/42"
    );
    assert_eq!(
        interpolate("https://api.example.com/:id", &vars),
        "https://api.example.com/42"
    );
    assert_eq!(
        interpolate("/unknown/:falta", &vars),
        "/unknown/:falta"
    );
    assert_eq!(
        interpolate("https://api.example.com:8080/:id", &vars),
        "https://api.example.com:8080/42"
    );
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

fn sample_collection() -> Collection {
    Collection {
        name: "demo".to_string(),
        version: "1".to_string(),
        requests: vec![Request {
            id: None,
            name: "Obtener usuarios".to_string(),
            method: "GET".to_string(),
            url: "https://api.example.com/users".to_string(),
            query: vec![KeyValue::new("limit", "10")],
            headers: vec![KeyValue::new("Authorization", "Bearer xyz")],
            body: Body::Raw {
                content: "{\n  \"active\": true\n}".to_string(),
            },
            timeout_secs: 30,
            follow_redirects: true,
            validations: vec![Validation::StatusEquals {
                name: "status".into(),
                expected: 200,
            }],
        }],
        tests: vec![],
    }
}

#[test]
fn markdown_follows_d1_template() {
    let md = collection_to_markdown(&sample_collection());
    assert!(md.starts_with("# demo\n"));
    assert!(md.contains("## GET /users — Obtener usuarios"));
    assert!(md.contains("- **Método:** GET"));
    assert!(md.contains("**Headers**"));
    assert!(md.contains("Authorization: Bearer xyz"));
    assert!(md.contains("**Body**"));
    assert!(md.contains("\"active\": true"));
    assert!(md.contains("**Validaciones**"));
    assert!(md.contains("- status"));
    assert!(md.contains("_Generado desde la colección `demo.json`_"));
}

#[test]
fn markdown_empty_collection() {
    let md = collection_to_markdown(&Collection {
        name: "vacía".to_string(),
        version: "1".to_string(),
        requests: vec![],
        tests: vec![],
    });
    assert!(md.contains("_(sin solicitudes)_"));
}

#[test]
fn validation_name_is_exposed() {
    let v = Validation::DurationLt {
        name: "rápido".into(),
        max_ms: 10,
    };
    assert_eq!(v.name(), "rápido");
}

#[test]
fn validation_header_missing_edges() {
    let resp = response(None, 200, 10);
    let results = run(
        &[
            Validation::HeaderEquals {
                name: "hdr ausente".into(),
                header: "X-Faltante".into(),
                expected: "1".into(),
            },
            Validation::HeaderContains {
                name: "hdr ausente 2".into(),
                header: "X-Faltante".into(),
                expected: "1".into(),
            },
        ],
        &resp,
    );
    assert!(!results[0].passed);
    assert!(!results[1].passed);
}

#[test]
fn json_validations_without_body_or_invalid() {
    let sin_cuerpo = response(None, 200, 10);
    let results = run(
        &[
            Validation::JsonExists {
                name: "j".into(),
                path: "$.a".into(),
            },
            Validation::JsonEquals {
                name: "j2".into(),
                path: "$.a".into(),
                expected: serde_json::json!(1),
            },
        ],
        &sin_cuerpo,
    );
    assert!(!results[0].passed);
    assert!(!results[1].passed);

    let no_json = response(Some("esto no es json"), 200, 10);
    let results = run(
        &[
            Validation::JsonExists {
                name: "j".into(),
                path: "$.a".into(),
            },
            Validation::JsonEquals {
                name: "j2".into(),
                path: "$.a".into(),
                expected: serde_json::json!(1),
            },
        ],
        &no_json,
    );
    assert!(!results[0].passed);
    assert!(!results[1].passed);

    let resp = response(Some(r#"{"a":1}"#), 200, 10);
    let results = run(
        &[Validation::JsonEquals {
            name: "j".into(),
            path: "$.b".into(),
            expected: serde_json::json!(1),
        }],
        &resp,
    );
    assert!(!results[0].passed);
}

#[test]
fn resolve_path_malformed() {
    let json = serde_json::json!({"a": {"b": [1, 2]}});
    assert_eq!(resolve_path(&json, "$.."), None);
    assert_eq!(resolve_path(&json, "$.a["), None);
    assert_eq!(resolve_path(&json, "$.a[x]"), None);
    assert_eq!(resolve_path(&json, "a.b"), None);
}

#[test]
fn markdown_urlencoded_and_url_edges() {
    let mut con_query = Request {
        id: None,
        name: "con query".to_string(),
        method: "GET".to_string(),
        url: "https://api.example.com/search?fixed=1".to_string(),
        query: vec![KeyValue::new("q", "rust"), KeyValue::new("off", "x")],
        headers: vec![KeyValue::new("desactivado", "nope")],
        body: Body::UrlEncoded {
            fields: vec![KeyValue::new("a", "1"), KeyValue::new("off", "y")],
        },
        timeout_secs: 30,
        follow_redirects: true,
        validations: vec![],
    };
    con_query.query[1].enabled = false;
    con_query.headers[0].enabled = false;
    if let Body::UrlEncoded { fields } = &mut con_query.body {
        fields[1].enabled = false;
    }

    let collection = Collection {
        name: "edges".to_string(),
        version: "1".to_string(),
        requests: vec![
            con_query,
            Request {
                id: None,
                name: "sin scheme".to_string(),
                method: "GET".to_string(),
                url: "localhost:8080/path#frag".to_string(),
                query: vec![],
                headers: vec![],
                body: Body::None,
                timeout_secs: 30,
                follow_redirects: true,
                validations: vec![],
            },
            Request {
                id: None,
                name: "raiz".to_string(),
                method: "GET".to_string(),
                url: "https://api.example.com".to_string(),
                query: vec![],
                headers: vec![],
                body: Body::None,
                timeout_secs: 30,
                follow_redirects: true,
                validations: vec![],
            },
        ],
        tests: vec![],
    };

    let md = collection_to_markdown(&collection);
    assert!(md.contains("## GET /search — con query"));
    assert!(md.contains("---\n\n## GET /path — sin scheme"));
    assert!(md.contains("https://api.example.com/search?fixed=1&q=rust"));
    assert!(md.contains("**Body (urlencoded)**"));
    assert!(md.contains("a=1"));
    assert!(!md.contains("off"));
    assert!(!md.contains("desactivado"));
    assert!(md.contains("## GET / — raiz"));
    assert!(!md.contains("**Validaciones**"));
}

async fn spawn_engine_server() -> String {
    let app =
        Router::new().route(
            "/anything",
            any(
                |Query(params): Query<HashMap<String, String>>,
                 headers: HeaderMap,
                 body: String| async move {
                    let auth = headers
                        .get("authorization")
                        .and_then(|h| h.to_str().ok())
                        .unwrap_or_default()
                        .to_string();
                    let json = serde_json::json!({
                        "id": params.get("id").cloned().unwrap_or_default(),
                        "auth": auth,
                        "body": body,
                    });
                    axum::Json(json)
                },
            ),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    format!("http://{addr}")
}

fn engine_request(method: &str, url: String, follow: bool) -> Request {
    Request {
        id: None,
        name: "echo".to_string(),
        method: method.to_string(),
        url,
        query: vec![KeyValue::new("id", "42")],
        headers: vec![KeyValue::new("Authorization", "Bearer token")],
        body: Body::Raw {
            content: "raw-body".to_string(),
        },
        timeout_secs: 5,
        follow_redirects: follow,
        validations: vec![Validation::StatusEquals {
            name: "status".into(),
            expected: 200,
        }],
    }
}

#[tokio::test]
async fn engine_executes_with_query_headers_raw_body_and_validations() {
    let base = spawn_engine_server().await;
    let engine = Engine::new().unwrap();
    let resp = engine
        .execute(&engine_request("POST", format!("{base}/anything"), true))
        .await
        .unwrap();

    assert_eq!(resp.status, 200);
    assert_eq!(resp.status_text, "OK");
    assert!(resp.url.contains("id=42"));
    assert!(resp
        .headers
        .iter()
        .any(|(k, v)| k == "content-type" && v.contains("json")));
    let body: serde_json::Value = serde_json::from_str(resp.body.as_deref().unwrap()).unwrap();
    assert_eq!(body["id"], "42");
    assert_eq!(body["auth"], "Bearer token");
    assert_eq!(body["body"], "raw-body");
    assert!(resp.validation_results[0].passed);
}

#[tokio::test]
async fn engine_urlencoded_body_and_no_follow() {
    let base = spawn_engine_server().await;
    let engine = Engine::new().unwrap();
    let mut req = engine_request("POST", format!("{base}/anything"), false);
    req.body = Body::UrlEncoded {
        fields: vec![
            KeyValue::new("a", "1"),
            KeyValue::new("b", "2"),
            KeyValue::new("off", "x"),
        ],
    };
    if let Body::UrlEncoded { fields } = &mut req.body {
        fields[2].enabled = false;
    }

    let resp = engine.execute(&req).await.unwrap();
    assert_eq!(resp.status, 200);
    let body: serde_json::Value = serde_json::from_str(resp.body.as_deref().unwrap()).unwrap();
    assert_eq!(body["body"], "a=1&b=2");
}

#[tokio::test]
async fn engine_rejects_bad_method_and_url() {
    let engine = Engine::new().unwrap();
    let mut req = engine_request("G ET", "https://example.com".to_string(), true);
    assert!(engine.execute(&req).await.is_err());

    req.method = "GET".to_string();
    req.url = "no es una url".to_string();
    assert!(engine.execute(&req).await.is_err());
}

#[test]
fn extract_variables_from_url_query_headers_body() {
    let reqs = vec![Request {
        id: None,
        name: "test".to_string(),
        method: "GET".to_string(),
        url: "https://api.example.com/users/{{userId}}/posts".to_string(),
        query: vec![KeyValue::new("page", "{{page}}")],
        headers: vec![KeyValue::new("Authorization", "Bearer {{token}}")],
        body: Body::Raw {
            content: r#"{"name":"{{name}}"}"#.to_string(),
        },
        timeout_secs: 30,
        follow_redirects: true,
        validations: vec![],
    }];
    let refs: Vec<&Request> = reqs.iter().collect();
    let vars = extract_variables(&refs);
    assert!(vars.contains("userId"));
    assert!(vars.contains("page"));
    assert!(vars.contains("token"));
    assert!(vars.contains("name"));
    assert_eq!(vars.len(), 4);
}

#[test]
fn extract_variables_deduplicates() {
    let reqs = vec![Request {
        id: None,
        name: "dup".to_string(),
        method: "POST".to_string(),
        url: "https://api.example.com/{{id}}".to_string(),
        query: vec![KeyValue::new("ref", "{{id}}")],
        headers: vec![],
        body: Body::Raw {
            content: r#"{"ref":"{{id}}"}"#.to_string(),
        },
        timeout_secs: 30,
        follow_redirects: true,
        validations: vec![],
    }];
    let refs: Vec<&Request> = reqs.iter().collect();
    let vars = extract_variables(&refs);
    assert!(vars.contains("id"));
    assert_eq!(vars.len(), 1);
}

#[test]
fn extract_variables_empty_when_no_placeholders() {
    let reqs = vec![Request {
        id: None,
        name: "plain".to_string(),
        method: "GET".to_string(),
        url: "https://api.example.com/fixed".to_string(),
        query: vec![],
        headers: vec![],
        body: Body::None,
        timeout_secs: 30,
        follow_redirects: true,
        validations: vec![],
    }];
    let refs: Vec<&Request> = reqs.iter().collect();
    let vars = extract_variables(&refs);
    assert!(vars.is_empty());
}
