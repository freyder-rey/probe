mod handlers;
mod state;

use std::sync::Arc;

use axum::{
    http::header,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use probe_core::{
    CollectionRepository, CsvLoader, CsvRowLoader, Engine, FileCollectionRepository,
    HttpExecutor, LoadTestRunner, Runner,
};

use handlers::{
    delete_collection, execute, list_collections, load_collection, save_collection, test_start,
    test_status, test_stop,
};
use state::{AppState, RunRegistry};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Composition root: se construyen las implementaciones concretas y se
    // inyectan a los handlers como puertos (dyn traits).
    let engine: Arc<dyn HttpExecutor> = Arc::new(Engine::new()?);
    let repo: Arc<dyn CollectionRepository> = Arc::new(FileCollectionRepository::new()?);
    let csv: Arc<dyn CsvRowLoader> = Arc::new(CsvLoader);
    let runner: Arc<dyn LoadTestRunner> = Arc::new(Runner::new(engine.clone(), csv));

    let app = Router::new()
        .route("/", get(index))
        .route("/style.css", get(style))
        .route("/app.js", get(app_js))
        .route("/api/execute", post(execute))
        .route("/api/collections", get(list_collections).post(save_collection))
        .route(
            "/api/collections/{name}",
            get(load_collection).delete(delete_collection),
        )
        .route("/api/tests/{collection}/{test}/start", post(test_start))
        .route("/api/tests/{collection}/{test}/status", get(test_status))
        .route("/api/tests/{collection}/{test}/stop", post(test_stop))
        .with_state(AppState {
            repo,
            engine,
            runner,
            runs: RunRegistry::new(),
        });

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
