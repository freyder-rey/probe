use super::*;

#[test]
fn request_serializes_to_camel_case() {
    let request = Request {
        id: None,
        name: "Test".to_string(),
        method: "GET".to_string(),
        url: "https://api.example.com/users".to_string(),
        query: vec![KeyValue::new("limit", "10")],
        headers: vec![],
        body: Body::Raw {
            content: "{}".to_string(),
        },
        timeout_secs: 30,
        follow_redirects: true,
        validations: vec![],
    };

    let json = serde_json::to_value(&request).unwrap();
    assert!(json.get("timeoutSecs").is_some());
    assert!(json.get("followRedirects").is_some());
    assert!(json.get("url").is_some());
    assert!(json.get("validations").is_some());
}

#[test]
fn body_roundtrip() {
    let body = Body::UrlEncoded {
        fields: vec![KeyValue::new("a", "1")],
    };
    let json = serde_json::to_string(&body).unwrap();
    assert_eq!(
        json,
        r#"{"type":"urlencoded","fields":[{"key":"a","value":"1","enabled":true}]}"#
    );
    let back: Body = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, Body::UrlEncoded { .. }));
}

#[test]
fn collection_roundtrip() {
    let collection = Collection {
        name: "Mi colección".to_string(),
        version: "1".to_string(),
        requests: vec![Request {
            id: None,
            name: "Ping".to_string(),
            method: "GET".to_string(),
            url: "https://example.com".to_string(),
            query: vec![],
            headers: vec![],
            body: Body::None,
            timeout_secs: 30,
            follow_redirects: true,
            validations: vec![],
        }],
        tests: vec![],
    };
    let json = serde_json::to_string_pretty(&collection).unwrap();
    let back: Collection = serde_json::from_str(&json).unwrap();
    assert_eq!(back.requests[0].name, "Ping");
    assert!(matches!(back.requests[0].body, Body::None));
}

#[test]
fn old_collections_without_tests_still_load() {
    let json = r#"{
        "name": "Vieja",
        "version": "1",
        "requests": []
    }"#;
    let collection: Collection = serde_json::from_str(json).unwrap();
    assert!(collection.tests.is_empty());
}

#[test]
fn load_test_serializes_camel_case() {
    let test = LoadTest {
        name: "Smoke".to_string(),
        request_names: vec!["Ping".to_string()],
        iterations: 10,
        delay_ms: 50,
        csv: None,
    };
    let json = serde_json::to_value(&test).unwrap();
    assert!(json.get("requestNames").is_some());
    assert!(json.get("iterations").is_some());
    assert!(json.get("delayMs").is_some());
}

#[test]
fn csv_source_roundtrip() {
    let source = CsvSource::Path {
        path: "/tmp/data.csv".to_string(),
    };
    let json = serde_json::to_string(&source).unwrap();
    assert_eq!(json, r#"{"type":"path","path":"/tmp/data.csv"}"#);
    let back: CsvSource = serde_json::from_str(&json).unwrap();
    assert!(matches!(back, CsvSource::Path { .. }));
}

#[test]
fn request_defaults_when_fields_missing() {
    let json = r#"{"name":"Ping","method":"GET","url":"https://example.com"}"#;
    let request: Request = serde_json::from_str(json).unwrap();
    assert!(request.id.is_none());
    assert!(request.query.is_empty());
    assert!(request.headers.is_empty());
    assert!(matches!(request.body, Body::None));
    assert_eq!(request.timeout_secs, 30);
    assert!(request.follow_redirects);
    assert!(request.validations.is_empty());
}

#[test]
fn key_value_new_enables_by_default() {
    let kv = KeyValue::new("a", "b");
    assert_eq!(kv.key, "a");
    assert_eq!(kv.value, "b");
    assert!(kv.enabled);
}

#[test]
fn key_value_enabled_defaults_true_on_deserialize() {
    let kv: KeyValue = serde_json::from_str(r#"{"key":"a","value":"b"}"#).unwrap();
    assert!(kv.enabled);
}

#[test]
fn body_none_serializes_as_type() {
    let json = serde_json::to_string(&Body::None).unwrap();
    assert_eq!(json, r#"{"type":"none"}"#);
}

#[test]
fn load_test_defaults_on_missing_fields() {
    let test: LoadTest = serde_json::from_str(r#"{"name":"Smoke"}"#).unwrap();
    assert_eq!(test.iterations, 1);
    assert_eq!(test.delay_ms, 0);
    assert!(test.request_names.is_empty());
    assert!(test.csv.is_none());
}

#[test]
fn load_test_report_serializes_camel_case() {
    let report = LoadTestReport {
        test_name: "x".to_string(),
        duration_ms: 5,
        total_requests: 2,
        success: 1,
        failed: 1,
        avg_ms: 2,
        p95_ms: 3,
        per_request: vec![],
        errors: vec![],
    };
    let json = serde_json::to_value(&report).unwrap();
    assert!(json.get("testName").is_some());
    assert!(json.get("totalRequests").is_some());
    assert!(json.get("avgMs").is_some());
    assert!(json.get("p95Ms").is_some());
    assert!(json.get("perRequest").is_some());
}

#[test]
fn run_event_roundtrip() {
    let event = RunEvent {
        request: "ok".to_string(),
        iteration: 2,
        status: Some(200),
        ok: true,
        duration_ms: 3,
        error: None,
    };
    let json = serde_json::to_value(&event).unwrap();
    assert!(json.get("iteration").is_some());
    assert!(json.get("status").is_some());
    assert!(json.get("durationMs").is_some());
    let back: RunEvent = serde_json::from_value(json).unwrap();
    assert_eq!(back.status, Some(200));
    assert_eq!(back.iteration, 2);
}

#[test]
fn run_progress_serializes_camel_case() {
    let progress = RunProgress {
        done: 1,
        total: 3,
        current_request: Some("ok".to_string()),
        per_request: vec![],
        last_event: None,
    };
    let json = serde_json::to_value(&progress).unwrap();
    assert!(json.get("currentRequest").is_some());
    assert!(json.get("perRequest").is_some());
    assert!(json.get("lastEvent").is_some());
}

#[test]
fn validation_name_for_every_kind() {
    let validations = [
        Validation::StatusEquals {
            name: "s".into(),
            expected: 200,
        },
        Validation::HeaderEquals {
            name: "he".into(),
            header: "X".into(),
            expected: "y".into(),
        },
        Validation::HeaderContains {
            name: "hc".into(),
            header: "X".into(),
            expected: "y".into(),
        },
        Validation::BodyContains {
            name: "bc".into(),
            expected: "x".into(),
        },
        Validation::BodyEquals {
            name: "be".into(),
            expected: "x".into(),
        },
        Validation::JsonEquals {
            name: "je".into(),
            path: "$.a".into(),
            expected: serde_json::json!(1),
        },
        Validation::JsonExists {
            name: "jx".into(),
            path: "$.a".into(),
        },
        Validation::DurationLt {
            name: "dl".into(),
            max_ms: 5,
        },
    ];
    for v in &validations {
        assert!(!v.name().is_empty());
    }
}
