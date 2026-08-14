mod handlers;

use axum::{
    http::header,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Router,
};
use probe_core::Engine;

use handlers::{delete_collection, execute, list_collections, load_collection, save_collection};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let engine = Engine::new()?;
    let app = Router::new()
        .route("/", get(index))
        .route("/style.css", get(style))
        .route("/app.js", get(app_js))
        .route(
            "/api/execute",
            post(move |body| execute(engine.clone(), body)),
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
