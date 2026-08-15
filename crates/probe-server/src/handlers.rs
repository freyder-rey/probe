use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use probe_core::{Collection, Engine, LoadTestReport, Runner, Storage};

use crate::state::{AppState, RunState, RunStatusResponse};

#[derive(serde::Deserialize)]
pub struct ExecuteBody {
    pub request: probe_core::Request,
}

#[derive(serde::Serialize)]
pub struct ExecuteResponse {
    pub response: probe_core::Response,
}

#[derive(serde::Serialize)]
pub struct CollectionSummary {
    pub name: String,
    pub size: u64,
}

pub async fn execute(
    engine: Engine,
    body: Json<ExecuteBody>,
) -> Result<Json<ExecuteResponse>, (StatusCode, String)> {
    match engine.execute(&body.request).await {
        Ok(response) => Ok(Json(ExecuteResponse { response })),
        Err(err) => Err((StatusCode::BAD_REQUEST, err.to_string())),
    }
}

pub async fn list_collections() -> Result<Json<Vec<CollectionSummary>>, (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    let collections = storage
        .list()
        .map_err(internal)?
        .into_iter()
        .map(|c| CollectionSummary { name: c.name, size: c.size })
        .collect();
    Ok(Json(collections))
}

pub async fn save_collection(
    Json(collection): Json<Collection>,
) -> Result<(StatusCode, Json<Collection>), (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    storage.save(&collection).map_err(internal)?;
    Ok((StatusCode::CREATED, Json(collection)))
}

pub async fn load_collection(
    Path(name): Path<String>,
) -> Result<Json<Collection>, (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    match storage.load(&name) {
        Ok(collection) => Ok(Json(collection)),
        Err(err) => Err((StatusCode::NOT_FOUND, err.to_string())),
    }
}

pub async fn delete_collection(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    storage.delete(&name).map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

fn internal(err: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

fn lock_error<T>(_: std::sync::PoisonError<T>) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, "no se pudo acceder al estado".to_string())
}

fn test_key(collection: &str, test: &str) -> String {
    format!("{collection}:{test}")
}

async fn run_test(
    collection_name: &str,
    test_name: &str,
    cancel: &Arc<AtomicBool>,
    runs: &Arc<std::sync::Mutex<std::collections::HashMap<String, RunState>>>,
    key: &str,
) -> anyhow::Result<LoadTestReport> {
    let storage = Storage::new()?;
    let collection = storage.load(collection_name)?;
    let test = collection
        .tests
        .iter()
        .find(|t| t.name == test_name)
        .ok_or_else(|| anyhow::anyhow!("test \"{test_name}\" no encontrado"))?
        .clone();

    let runner = Runner::new()?;
    let runs = runs.clone();
    let key = key.to_string();
    runner
        .run(&test, &collection.requests, Some(cancel), move |done, total| {
            if let Ok(mut map) = runs.lock() {
                if let Some(run) = map.get_mut(&key) {
                    run.done = done;
                    run.total = total;
                }
            }
        })
        .await
}

pub async fn test_start(
    State(state): State<AppState>,
    Path((collection, test)): Path<(String, String)>,
) -> Result<Json<RunStatusResponse>, (StatusCode, String)> {
    let key = test_key(&collection, &test);
    let mut runs = state.runs.lock().map_err(lock_error)?;
    if let Some(existing) = runs.get(&key) {
        if existing.status == "running" {
            return Err((
                StatusCode::CONFLICT,
                "ya hay una ejecución en curso para este test".to_string(),
            ));
        }
    }

    let cancel = Arc::new(AtomicBool::new(false));
    runs.insert(
        key.clone(),
        RunState {
            status: "running".to_string(),
            done: 0,
            total: 0,
            cancel: cancel.clone(),
            report: None,
            error: None,
        },
    );
    drop(runs);

    let runs = state.runs.clone();
    let collection = collection.clone();
    let test = test.clone();
    let key_for_run = key.clone();
    tokio::spawn(async move {
        let outcome = run_test(&collection, &test, &cancel, &runs, &key_for_run).await;
        if let Ok(mut map) = runs.lock() {
            if let Some(run) = map.get_mut(&key_for_run) {
                match outcome {
                    Ok(report) => {
                        run.report = Some(report);
                        run.status = if cancel.load(Ordering::Relaxed) {
                            "stopped".to_string()
                        } else {
                            "done".to_string()
                        };
                    }
                    Err(err) => {
                        run.status = "error".to_string();
                        run.error = Some(err.to_string());
                    }
                }
            }
        }
    });

    Ok(Json(RunStatusResponse::from_run(
        state.runs.lock().map_err(lock_error)?.get(&key).unwrap(),
    )))
}

pub async fn test_status(
    State(state): State<AppState>,
    Path((collection, test)): Path<(String, String)>,
) -> Result<Json<RunStatusResponse>, (StatusCode, String)> {
    let key = test_key(&collection, &test);
    let runs = state.runs.lock().map_err(lock_error)?;
    let run = runs
        .get(&key)
        .ok_or((StatusCode::NOT_FOUND, "no hay ejecución para este test".to_string()))?;
    Ok(Json(RunStatusResponse::from_run(run)))
}

pub async fn test_stop(
    State(state): State<AppState>,
    Path((collection, test)): Path<(String, String)>,
) -> Result<Json<RunStatusResponse>, (StatusCode, String)> {
    let key = test_key(&collection, &test);
    let runs = state.runs.lock().map_err(lock_error)?;
    if let Some(run) = runs.get(&key) {
        run.cancel.store(true, Ordering::Relaxed);
    } else {
        return Err((StatusCode::NOT_FOUND, "no hay ejecución para este test".to_string()));
    }
    Ok(Json(RunStatusResponse {
        status: "stopping".to_string(),
        done: 0,
        total: 0,
        report: None,
        error: None,
    }))
}
