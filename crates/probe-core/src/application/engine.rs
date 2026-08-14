use std::time::Instant;

use anyhow::{Context, Result};
use reqwest::Method;

use crate::domain::{Body, Request, Response};

#[derive(Clone)]
pub struct Engine {
    follow: reqwest::Client,
    no_follow: reqwest::Client,
}

impl Engine {
    pub fn new() -> Result<Self> {
        let follow = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 10 {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .context("no se pudo construir el cliente HTTP")?;

        let no_follow = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .context("no se pudo construir el cliente HTTP")?;

        Ok(Engine { follow, no_follow })
    }

    pub async fn execute(&self, req: &Request) -> Result<Response> {
        let method = Method::from_bytes(req.method.as_bytes())
            .context(format!("verbo HTTP inválido: {}", req.method))?;

        let mut url = reqwest::Url::parse(&req.url)
            .context(format!("URL inválida: {}", req.url))?;

        for kv in req.query.iter().filter(|kv| kv.enabled) {
            url.query_pairs_mut().append_pair(&kv.key, &kv.value);
        }

        let client = if req.follow_redirects { &self.follow } else { &self.no_follow };
        let mut builder = client
            .request(method, url.clone())
            .timeout(std::time::Duration::from_secs(req.timeout_secs));

        for kv in req.headers.iter().filter(|kv| kv.enabled) {
            builder = builder.header(&kv.key, &kv.value);
        }

        builder = match &req.body {
            Body::None => builder,
            Body::Raw { content } => builder.body(content.clone()),
            Body::UrlEncoded { fields } => {
                let pairs: Vec<(&str, &str)> = fields
                    .iter()
                    .filter(|kv| kv.enabled)
                    .map(|kv| (kv.key.as_str(), kv.value.as_str()))
                    .collect();
                builder.form(&pairs)
            }
        };

        let start = Instant::now();
        let response = builder
            .send()
            .await
            .context("la solicitud falló")?;
        let duration_ms = start.elapsed().as_millis();

        let status = response.status();
        let status_text = status.canonical_reason().unwrap_or("").to_string();
        let http_version = format!("{:?}", response.version());
        let url = response.url().to_string();
        let headers: Vec<(String, String)> = response
            .headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        let body = response
            .text()
            .await
            .ok();

        let mut result = Response {
            status: status.as_u16(),
            status_text,
            http_version,
            headers,
            body,
            duration_ms,
            url,
            validation_results: vec![],
        };

        result.validation_results = crate::application::validation::run(&req.validations, &result);
        Ok(result)
    }
}

impl Default for Engine {
    fn default() -> Self {
        Engine::new().expect("fallo al crear el Engine")
    }
}
