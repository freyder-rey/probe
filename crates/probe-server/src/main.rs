use axum::{
    extract::Path,
    http::{header, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};

use probe_core::{
    engine::Engine,
    model::Collection,
    storage::Storage,
};

#[derive(serde::Deserialize)]
struct ExecuteBody {
    request: probe_core::model::Request,
}

#[derive(serde::Serialize)]
struct ExecuteResponse {
    response: probe_core::model::Response,
}

#[derive(serde::Serialize)]
struct CollectionSummary {
    name: String,
    size: u64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let engine = Engine::new()?;
    let app = Router::new()
        .route("/", get(index))
        .route("/style.css", get(style))
        .route("/app.js", get(app_js))
        .route(
            "/api/execute",
            post(move |body: Json<ExecuteBody>| execute(engine.clone(), body)),
        )
        .route("/api/collections", get(list_collections).post(save_collection))
        .route(
            "/api/collections/{name}",
            get(load_collection).delete(delete_collection),
        );

    let addr = "127.0.0.1:7878";
    println!("probe server escuchando en http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn index() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

async fn style() -> Response {
    (
        [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
        include_str!("../static/style.css"),
    )
        .into_response()
}

async fn app_js() -> Response {
    (
        [(header::CONTENT_TYPE, "application/javascript; charset=utf-8")],
        include_str!("../static/app.js"),
    )
        .into_response()
}

async fn execute(
    engine: Engine,
    body: Json<ExecuteBody>,
) -> Result<Json<ExecuteResponse>, (StatusCode, String)> {
    match engine.execute(&body.request).await {
        Ok(response) => Ok(Json(ExecuteResponse { response })),
        Err(err) => Err((StatusCode::BAD_REQUEST, err.to_string())),
    }
}

async fn list_collections() -> Result<Json<Vec<CollectionSummary>>, (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    let collections = storage
        .list()
        .map_err(internal)?
        .into_iter()
        .map(|c| CollectionSummary { name: c.name, size: c.size })
        .collect();
    Ok(Json(collections))
}

async fn save_collection(
    Json(collection): Json<Collection>,
) -> Result<(StatusCode, Json<Collection>), (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    storage.save(&collection).map_err(internal)?;
    Ok((StatusCode::CREATED, Json(collection)))
}

async fn load_collection(
    Path(name): Path<String>,
) -> Result<Json<Collection>, (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    match storage.load(&name) {
        Ok(collection) => Ok(Json(collection)),
        Err(err) => Err((StatusCode::NOT_FOUND, err.to_string())),
    }
}

async fn delete_collection(
    Path(name): Path<String>,
) -> Result<StatusCode, (StatusCode, String)> {
    let storage = Storage::new().map_err(internal)?;
    storage.delete(&name).map_err(internal)?;
    Ok(StatusCode::NO_CONTENT)
}

fn internal(err: anyhow::Error) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}
