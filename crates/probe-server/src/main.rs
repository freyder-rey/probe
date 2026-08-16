mod handlers;
mod state;

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    http::header,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use probe_core::{
    CollectionRepository, CsvLoader, CsvRowLoader, Engine, FileCollectionRepository, HttpExecutor,
    LoadTestRunner, Runner,
};
use tower_http::services::{ServeDir, ServeFile};

use handlers::{
    collection_markdown, delete_collection, execute, list_collections, load_collection,
    save_collection, test_events, test_start, test_status, test_stop, upload_csv,
};
use state::{AppState, RunRegistry};

/// Directorio con el build de Vite (frontend React). Si no existe, se sirve el
/// frontend vanilla de `static/` como fallback.
const DIST_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/static/dist");

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Composition root: se construyen las implementaciones concretas y se
    // inyectan a los handlers como puertos (dyn traits).
    let engine: Arc<dyn HttpExecutor> = Arc::new(Engine::new()?);
    let repo: Arc<dyn CollectionRepository> = Arc::new(FileCollectionRepository::new()?);
    let csv: Arc<dyn CsvRowLoader> = Arc::new(CsvLoader);
    let runner: Arc<dyn LoadTestRunner> = Arc::new(Runner::new(engine.clone(), csv));

    let api = Router::new()
        .route("/api/execute", post(execute))
        .route(
            "/api/collections",
            get(list_collections).post(save_collection),
        )
        .route(
            "/api/collections/{name}",
            get(load_collection).delete(delete_collection),
        )
        .route("/api/collections/{name}/markdown", get(collection_markdown))
        .route("/api/tests/{collection}/{test}/start", post(test_start))
        .route("/api/tests/{collection}/{test}/status", get(test_status))
        .route("/api/tests/{collection}/{test}/stop", post(test_stop))
        .route("/api/tests/{collection}/{test}/events", get(test_events))
        .route("/api/csv", post(upload_csv))
        .with_state(AppState {
            repo,
            engine,
            runner,
            runs: RunRegistry::new(),
        });

    let app = if Path::new(DIST_DIR).join("index.html").is_file() {
        // Frontend React build: sirve los assets desde disco y cae en
        // index.html para rutas no encontradas (SPA).
        let serve = ServeDir::new(DIST_DIR)
            .not_found_service(ServeFile::new(PathBuf::from(DIST_DIR).join("index.html")));
        api.fallback_service(serve)
    } else {
        // Frontend vanilla (sin build de Vite): se embebe con include_str!.
        api.route("/", get(index))
            .route("/style.css", get(style))
            .route("/app.js", get(app_js))
    };

    let addr = "127.0.0.1:7878";
    println!("probe server escuchando en http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// Detiene el server limpiamente con Ctrl+C (SIGINT) o SIGTERM.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    println!("probe server deteniéndose…");
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
        [(
            header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("../static/app.js"),
    )
        .into_response()
}
