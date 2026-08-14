use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub query: Vec<KeyValue>,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub body: Body,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    #[serde(default = "default_follow_redirects")]
    pub follow_redirects: bool,
    #[serde(default)]
    pub validations: Vec<Validation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    pub key: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Body {
    #[default]
    None,
    Raw { content: String },
    UrlEncoded { fields: Vec<KeyValue> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub name: String,
    pub version: String,
    pub requests: Vec<Request>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub status: u16,
    pub status_text: String,
    pub http_version: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub duration_ms: u128,
    pub url: String,
    #[serde(default)]
    pub validation_results: Vec<ValidationResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Validation {
    StatusEquals { name: String, expected: u16 },
    HeaderEquals { name: String, header: String, expected: String },
    HeaderContains { name: String, header: String, expected: String },
    BodyContains { name: String, expected: String },
    BodyEquals { name: String, expected: String },
    JsonEquals { name: String, path: String, expected: serde_json::Value },
    JsonExists { name: String, path: String },
    DurationLt { name: String, max_ms: u64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub name: String,
    pub passed: bool,
    pub detail: String,
}

fn default_true() -> bool {
    true
}

fn default_timeout() -> u64 {
    30
}

fn default_follow_redirects() -> bool {
    true
}

impl KeyValue {
    pub fn new(key: impl Into<String>, value: impl Into<String>) -> Self {
        KeyValue {
            key: key.into(),
            value: value.into(),
            enabled: true,
        }
    }
}

#[cfg(test)]
mod tests {
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
}
