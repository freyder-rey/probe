# AGENTS.md — Contexto del proyecto

## Qué es probe

Cliente de APIs estilo Postman (sin ser idéntico). Ejecuta solicitudes HTTP con
**cualquier verbo**, guarda colecciones **por usuario** en archivos locales y
permite **validaciones declarativas** sobre las respuestas.

- Documento fuente de verdad: `SPEC.md` (definiciones, decisiones y criterios).
- Guía de uso completa: `docs/CLI.md`.

## Arquitectura (workspace Rust)

```
crates/
├── probe-core/     # núcleo compartido (capas, ver abajo)
│   └── src/
│       ├── domain/          # modelos puros del dominio (sin IO ni HTTP)
│       ├── application/     # servicios (engine HTTP, validaciones, runner de carga futuro)
│       └── infrastructure/  # persistencia (storage) e IO
├── probe-cli/      # binario `probe` (clap): main.rs + args.rs + run.rs + collection.rs
└── probe-server/   # API axum + frontend estático: main.rs (router) + handlers.rs
```

- `probe-core` es el núcleo compartido; CLI y server lo usan. Cada capa declara
  su `mod.rs` con re-exports, y sus tests viven en un `tests.rs` hermano
  (`#[cfg(test)] mod tests;`), no dentro de los archivos de negocio.
- `lib.rs` re-exporta la API pública de consumo (`probe_core::{Engine, Request,
  Storage, ...}`).
- El frontend lo sirve el server vía `include_str!` desde
  `crates/probe-server/static/` (sin build step). Electron envolverá esta misma
  UI como cáscara de escritorio en una etapa posterior (decisión D3).

## Convenciones

- Modelo con `serde`, `#[serde(rename_all = "camelCase")]` para el JSON público
  (ej: `timeoutSecs`, `followRedirects`, `validationResults`).
- Enum de body con `#[serde(tag = "type")]`: `none | raw | urlencoded`.
  `multipart/form-data` queda fuera de alcance por ahora.
- Validaciones: enum con `#[serde(tag = "kind")]` en `domain/validation.rs`; la
  lógica vive en `application/validation.rs`. Kinds actuales: `status_equals`,
  `header_equals`, `header_contains`, `body_contains`, `body_equals`,
  `json_equals`, `json_exists`, `duration_lt`. Rutas JSON: `$.a.b[0]`.
- Mensajes de CLI en español.
- Dependencias declaradas en el workspace root (`[workspace.dependencies]`).

## Comandos

```sh
cargo build                 # compila todo el workspace
cargo test --workspace      # 9 tests unitarios
cargo clippy --workspace    # debe quedar sin warnings
cargo run -p probe-cli -- run https://httpbin.org/json
cargo run -p probe-server   # web en http://127.0.0.1:7878
```

## Almacenamiento de colecciones

- Por usuario: `~/.probe/collections/` (Linux/macOS), `%USERPROFILE%\.probe\`
  (Windows). Override con `PROBE_COLLECTIONS_DIR` (usar en tests).
- Formato: JSON (`name`, `version`, `requests[]`). El Markdown es solo lectura/export.

## Git / flujo de trabajo

- Ramas: `main` (estable) y `develop` (integración).
- `develop` está **protegida**: los cambios deben entrar por **Pull Request**
  (regla del repo; el push directo solo funciona con bypass del dueño).
- Flujo: crear rama desde `develop` → commit → push → `gh pr create --base develop`.
- Identidad git local ya configurada: `Leonardo Rey <86794757+freyder-rey@users.noreply.github.com>`.

## Estado actual

Etapa 1 completa (requests con cualquier verbo, persistencia por usuario,
validaciones declarativas, CLI y web). PR #1 `feature/core-cli-web` → develop.
Pendientes de roadmap: export Markdown, Electron, variables `{{nombre}}`
(sintaxis ya definida en SPEC, implementación futura).
