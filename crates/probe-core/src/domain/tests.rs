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
        body: Body::Raw { content: "{}".to_string() },
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
    assert_eq!(json, r#"{"type":"urlencoded","fields":[{"key":"a","value":"1","enabled":true}]}"#);
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
    };
    let json = serde_json::to_string_pretty(&collection).unwrap();
    let back: Collection = serde_json::from_str(&json).unwrap();
    assert_eq!(back.requests[0].name, "Ping");
    assert!(matches!(back.requests[0].body, Body::None));
}
