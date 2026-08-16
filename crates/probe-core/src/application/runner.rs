use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use anyhow::{bail, Context, Result};
use async_trait::async_trait;
use tokio::time::{sleep, Duration};

use crate::domain::{Body, CsvSource, KeyValue, LoadTest, LoadTestReport, Request, RequestSummary};

use super::{
    interpolation::interpolate, ports::CsvRowLoader, ports::HttpExecutor, ports::LoadTestRunner,
};

struct Sample {
    duration_ms: u128,
    passed: bool,
    error: Option<String>,
}

/// Ejecuta tests de carga en secuencia, respetando delays reales entre
/// solicitudes y aplicando las validaciones de cada solicitud.
pub struct Runner {
    engine: Arc<dyn HttpExecutor>,
    csv: Arc<dyn CsvRowLoader>,
}

impl Runner {
    pub fn new(engine: Arc<dyn HttpExecutor>, csv: Arc<dyn CsvRowLoader>) -> Self {
        Runner { engine, csv }
    }

    pub async fn run<F>(
        &self,
        test: &LoadTest,
        requests: &[Request],
        cancel: Option<&AtomicBool>,
        on_progress: F,
    ) -> Result<LoadTestReport>
    where
        F: Fn(u64, u64) + Send + Sync + 'static,
    {
        let flow = self.select_flow(test, requests)?;

        let rows = match &test.csv {
            Some(CsvSource::Path { path }) => {
                let rows = self.csv.load(std::path::Path::new(path)).with_context(|| {
                    format!("no se pudo cargar el CSV del test \"{}\"", test.name)
                })?;
                if rows.is_empty() {
                    bail!("el CSV \"{path}\" no tiene filas de datos");
                }
                rows
            }
            None => vec![],
        };

        let total = test.iterations * flow.len() as u64;
        let mut completed: u64 = 0;
        let mut successes: u64 = 0;
        let mut samples: Vec<u128> = Vec::new();
        let mut errors: Vec<String> = Vec::new();
        let mut per_request: HashMap<String, RequestSummary> = HashMap::new();

        let start = std::time::Instant::now();

        'outer: for i in 0..test.iterations {
            if is_cancelled(cancel) {
                break;
            }
            let vars = if rows.is_empty() {
                HashMap::new()
            } else {
                rows[i as usize % rows.len()].clone()
            };

            for (pos, req) in flow.iter().enumerate() {
                if is_cancelled(cancel) {
                    break 'outer;
                }

                let sample = match self.engine.execute(&interpolate_request(req, &vars)).await {
                    Ok(resp) => {
                        let passed = resp.validation_results.iter().all(|v| v.passed);
                        Sample {
                            duration_ms: resp.duration_ms,
                            passed,
                            error: None,
                        }
                    }
                    Err(err) => Sample {
                        duration_ms: 0,
                        passed: false,
                        error: Some(err.to_string()),
                    },
                };

                completed += 1;
                on_progress(completed, total);
                samples.push(sample.duration_ms);

                if sample.passed {
                    successes += 1;
                } else if errors.len() < 20 {
                    if let Some(e) = sample.error {
                        errors.push(format!("{}: {e}", req.name));
                    }
                }

                let summary =
                    per_request
                        .entry(req.name.clone())
                        .or_insert_with(|| RequestSummary {
                            name: req.name.clone(),
                            total: 0,
                            success: 0,
                            failed: 0,
                        });
                summary.total += 1;
                if sample.passed {
                    summary.success += 1;
                } else {
                    summary.failed += 1;
                }

                if test.delay_ms > 0 && pos + 1 < flow.len() {
                    sleep(Duration::from_millis(test.delay_ms)).await;
                }
            }
        }

        let duration_ms = start.elapsed().as_millis();
        let failed = completed - successes;

        let mut sorted = samples.clone();
        sorted.sort_unstable();
        let avg_ms = if samples.is_empty() {
            0
        } else {
            samples.iter().sum::<u128>() / samples.len() as u128
        };

        let mut per_request: Vec<RequestSummary> = per_request.into_values().collect();
        per_request.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(LoadTestReport {
            test_name: test.name.clone(),
            duration_ms,
            total_requests: completed,
            success: successes,
            failed,
            avg_ms,
            p95_ms: percentile(&sorted, 0.95),
            per_request,
            errors,
        })
    }

    fn select_flow<'a>(
        &self,
        test: &LoadTest,
        requests: &'a [Request],
    ) -> Result<Vec<&'a Request>> {
        let flow: Vec<&'a Request> = if test.request_names.is_empty() {
            requests.iter().collect()
        } else {
            let mut selected = Vec::new();
            for name in &test.request_names {
                let req = requests.iter().find(|r| &r.name == name).ok_or_else(|| {
                    anyhow::anyhow!("la solicitud \"{name}\" no existe en la colección")
                })?;
                selected.push(req);
            }
            selected
        };
        if flow.is_empty() {
            bail!(
                "el test \"{}\" no tiene solicitudes que ejecutar",
                test.name
            );
        }
        Ok(flow)
    }
}

#[async_trait]
impl LoadTestRunner for Runner {
    async fn run(
        &self,
        test: &LoadTest,
        requests: &[Request],
        cancel: Option<&AtomicBool>,
        on_progress: Box<dyn Fn(u64, u64) + Send + Sync>,
    ) -> Result<LoadTestReport> {
        self.run(test, requests, cancel, on_progress).await
    }
}

fn is_cancelled(cancel: Option<&AtomicBool>) -> bool {
    cancel.is_some_and(|c| c.load(Ordering::Relaxed))
}

fn interpolate_request(req: &Request, vars: &HashMap<String, String>) -> Request {
    let mut out = req.clone();
    out.url = interpolate(&req.url, vars);
    for kv in out.query.iter_mut() {
        kv.value = interpolate(&kv.value, vars);
    }
    for kv in out.headers.iter_mut() {
        kv.key = interpolate(&kv.key, vars);
        kv.value = interpolate(&kv.value, vars);
    }
    out.body = match &req.body {
        Body::None => Body::None,
        Body::Raw { content } => Body::Raw {
            content: interpolate(content, vars),
        },
        Body::UrlEncoded { fields } => Body::UrlEncoded {
            fields: fields
                .iter()
                .map(|kv| KeyValue {
                    key: kv.key.clone(),
                    value: interpolate(&kv.value, vars),
                    enabled: kv.enabled,
                })
                .collect(),
        },
    };
    out
}

fn percentile(sorted: &[u128], p: f64) -> u128 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((sorted.len() - 1) as f64 * p).round() as usize;
    sorted[idx]
}

#[cfg(test)]
mod tests {
    use axum::{extract::Query, http::StatusCode, routing::get, Router};

    use super::*;
    use crate::{application::Engine, domain::Validation, infrastructure::CsvLoader};

    fn runner() -> Runner {
        Runner::new(Arc::new(Engine::new().unwrap()), Arc::new(CsvLoader))
    }

    async fn spawn_echo_server() -> String {
        let app = Router::new()
            .route(
                "/echo",
                get(|Query(params): Query<HashMap<String, String>>| async move {
                    params.get("id").cloned().unwrap_or_default()
                }),
            )
            .route(
                "/error",
                get(|| async { StatusCode::INTERNAL_SERVER_ERROR }),
            );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{addr}")
    }

    fn request(name: &str, url: String, validations: Vec<Validation>) -> Request {
        Request {
            id: None,
            name: name.to_string(),
            method: "GET".to_string(),
            url,
            query: vec![],
            headers: vec![],
            body: Body::None,
            timeout_secs: 5,
            follow_redirects: true,
            validations,
        }
    }

    #[tokio::test]
    async fn runner_reports_success_and_failures() {
        let base = spawn_echo_server().await;
        let requests = vec![
            request(
                "ok",
                format!("{base}/echo?id=1"),
                vec![Validation::StatusEquals {
                    name: "status".into(),
                    expected: 200,
                }],
            ),
            request(
                "bad",
                format!("{base}/error"),
                vec![Validation::StatusEquals {
                    name: "status".into(),
                    expected: 200,
                }],
            ),
        ];
        let test = LoadTest {
            name: "mi test".to_string(),
            request_names: vec![],
            iterations: 3,
            delay_ms: 0,
            csv: None,
        };

        let runner = runner();
        let report = runner.run(&test, &requests, None, |_, _| {}).await.unwrap();

        assert_eq!(report.total_requests, 6);
        assert_eq!(report.success, 3);
        assert_eq!(report.failed, 3);
        assert_eq!(report.per_request.len(), 2);
        let ok_summary = report.per_request.iter().find(|s| s.name == "ok").unwrap();
        assert_eq!(ok_summary.success, 3);
        let bad_summary = report.per_request.iter().find(|s| s.name == "bad").unwrap();
        assert_eq!(bad_summary.failed, 3);
    }

    #[tokio::test]
    async fn runner_interpolates_csv_rows_and_cycles() {
        let base = spawn_echo_server().await;
        let csv = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/infrastructure/testdata/usuarios.csv");
        let requests = vec![request(
            "usuarios",
            format!("{base}/echo?id={{{{id}}}}"),
            vec![Validation::BodyContains {
                name: "id1".into(),
                expected: "1".into(),
            }],
        )];
        let test = LoadTest {
            name: "csv test".to_string(),
            request_names: vec!["usuarios".to_string()],
            iterations: 4,
            delay_ms: 0,
            csv: Some(CsvSource::Path {
                path: csv.to_string_lossy().into_owned(),
            }),
        };

        let runner = runner();
        let report = runner.run(&test, &requests, None, |_, _| {}).await.unwrap();

        // Filas: (1,ana),(2,leo) -> cicladas 4 veces: 1,2,1,2.
        // El body del echo es el id: "1" contiene "1" (pasa), "2" no (falla).
        assert_eq!(report.total_requests, 4);
        assert_eq!(report.success, 2);
        assert_eq!(report.failed, 2);
    }

    #[tokio::test]
    async fn runner_stops_on_cancel() {
        let base = spawn_echo_server().await;
        let requests = vec![request("ok", format!("{base}/echo?id=1"), vec![])];
        let test = LoadTest {
            name: "corto".to_string(),
            request_names: vec![],
            iterations: 50,
            delay_ms: 5,
            csv: None,
        };

        let cancel = std::sync::atomic::AtomicBool::new(false);
        cancel.store(true, std::sync::atomic::Ordering::Relaxed);
        let runner = runner();
        let report = runner
            .run(&test, &requests, Some(&cancel), |_, _| {})
            .await
            .unwrap();

        assert_eq!(report.total_requests, 0);
    }

    #[test]
    fn unknown_request_name_errors() {
        let requests = vec![request("ok", "https://example.com".to_string(), vec![])];
        let test = LoadTest {
            name: "x".to_string(),
            request_names: vec!["no-existe".to_string()],
            iterations: 1,
            delay_ms: 0,
            csv: None,
        };
        let runner = runner();
        let result = runner.select_flow(&test, &requests);
        assert!(result.is_err());
    }
}
