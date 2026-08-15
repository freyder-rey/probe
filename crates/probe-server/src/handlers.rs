use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use probe_core::{Collection, LoadTestReport};

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
    State(state): State<AppState>,
    body: Json<ExecuteBody>,
) -> Result<Json<ExecuteResponse>, (StatusCode, String)> {
    match state.engine.execute(&body.request).await {
        Ok(response) => Ok(Json(ExecuteResponse { response })),
        Err(err) => Err((StatusCode::BAD_REQUEST, err.to_string())),
    }
}

pub async fn list_collections(
    State(state): State<AppState>,
) -> Result<Json<Vec<CollectionSummary>>, (StatusCode, String)> {
    let collections = state
        .repo
        .list()
        .map_err(internal)?
        .into_iter()
        .map(|c| CollectionSummary { name: c.name, size: c.size })
        .collect();
    Ok(Json(collections))
}

pub async fn save_collection(
    State(state): State<AppState>,
    Json(collection): Json<Collection>,
) -> Result<(StatusCode, Json<Collection>), (StatusCode, String)> {
    state.repo.save(&collection).map_err(internal)?;
    Ok((StatusCode::CREATED, Json(collection)))
}

pub async fn load_collection(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<Collection>, (StatusCode, String)> {
    match state.repo.load(&name) {
        Ok(collection) => Ok(Json(collection)),
        Err(err) => Err((StatusCode::NOT_FOUND, err.to_string())),
    }
}

pub async fn delete_collection(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    state.repo.delete(&name).map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

fn internal(err: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

fn test_key(collection: &str, test: &str) -> String {
    format!("{collection}:{test}")
}

async fn run_test(
    collection_name: &str,
    test_name: &str,
    cancel: &Arc<AtomicBool>,
    state: &AppState,
    key: &str,
) -> anyhow::Result<LoadTestReport> {
    let collection = state.repo.load(collection_name)?;
    let test = collection
        .tests
        .iter()
        .find(|t| t.name == test_name)
        .ok_or_else(|| anyhow::anyhow!("test \"{test_name}\" no encontrado"))?
        .clone();

    let runs = state.runs.clone();
    let key = key.to_string();
    state
        .runner
        .run(
            &test,
            &collection.requests,
            Some(cancel),
            Box::new(move |done, total| {
                runs.update(&key, |run| {
                    run.done = done;
                    run.total = total;
                });
            }),
        )
        .await
}

pub async fn test_start(
    State(state): State<AppState>,
    Path((collection, test)): Path<(String, String)>,
) -> Result<Json<RunStatusResponse>, (StatusCode, String)> {
    let key = test_key(&collection, &test);
    if let Some(existing) = state.runs.get(&key) {
        if existing.status == "running" {
            return Err((
                StatusCode::CONFLICT,
                "ya hay una ejecución en curso para este test".to_string(),
            ));
        }
    }

    let cancel = Arc::new(AtomicBool::new(false));
    state.runs.insert(key.clone(), RunState::running(cancel.clone()));

    let collection = collection.clone();
    let test = test.clone();
    let key_for_run = key.clone();
    let state_for_run = state.clone();
    tokio::spawn(async move {
        let outcome = run_test(&collection, &test, &cancel, &state_for_run, &key_for_run).await;
        state_for_run.runs.update(&key_for_run, |run| match outcome {
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
        });
    });

    let run = state
        .runs
        .get(&key)
        .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "no se pudo iniciar el test".to_string()))?;
    Ok(Json(RunStatusResponse::from_run(&run)))
}

pub async fn test_status(
    State(state): State<AppState>,
    Path((collection, test)): Path<(String, String)>,
) -> Result<Json<RunStatusResponse>, (StatusCode, String)> {
    let key = test_key(&collection, &test);
    let run = state
        .runs
        .get(&key)
        .ok_or((StatusCode::NOT_FOUND, "no hay ejecución para este test".to_string()))?;
    Ok(Json(RunStatusResponse::from_run(&run)))
}

pub async fn test_stop(
    State(state): State<AppState>,
    Path((collection, test)): Path<(String, String)>,
) -> Result<Json<RunStatusResponse>, (StatusCode, String)> {
    let key = test_key(&collection, &test);
    if state.runs.get(&key).is_none() {
        return Err((StatusCode::NOT_FOUND, "no hay ejecución para este test".to_string()));
    }
    state.runs.update(&key, |run| {
        run.cancel.store(true, Ordering::Relaxed);
    });
    Ok(Json(RunStatusResponse {
        status: "stopping".to_string(),
        done: 0,
        total: 0,
        report: None,
        error: None,
    }))
}
