use axum::{
    extract::Path,
    http::StatusCode,
    Json,
};
use probe_core::{Collection, Engine, Storage};

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
