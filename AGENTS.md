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
│       ├── application/     # servicios (engine HTTP, validaciones, interpolación, runner de carga)
│       └── infrastructure/  # persistencia (storage) e IO (csv)
├── probe-cli/      # binario `probe` (clap): main.rs + args.rs + run.rs + collection.rs + test.rs
└── probe-server/   # API axum + frontend estático: main.rs (router) + handlers.rs + state.rs
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
cargo test --workspace      # 19 tests unitarios + integración del runner
cargo clippy --workspace    # debe quedar sin warnings
cargo run -p probe-cli -- run https://httpbin.org/json
cargo run -p probe-server   # web en http://127.0.0.1:7878
```

## Almacenamiento de colecciones

- Por usuario: `~/.probe/collections/` (Linux/macOS), `%USERPROFILE%\.probe\`
  (Windows). Override con `PROBE_COLLECTIONS_DIR` (usar en tests).
- Formato: JSON (`name`, `version`, `requests[]`, `tests[]` opcional). El
  Markdown es solo lectura/export. Las colecciones viejas (sin `tests`) siguen cargando.

## Git / flujo de trabajo

- Ramas: `main` (estable) y `develop` (integración).
- `develop` está **protegida**: los cambios deben entrar por **Pull Request**
  (regla del repo; el push directo solo funciona con bypass del dueño).
- Flujo: crear rama desde `develop` → commit → push → `gh pr create --base develop`.
- Identidad git local ya configurada: `Leonardo Rey <86794757+freyder-rey@users.noreply.github.com>`.

## Estado actual

Etapa 1 completa (requests con cualquier verbo, persistencia por usuario,
validaciones declarativas, CLI y web). PR #1 `feature/core-cli-web` → develop
merged.

Incluido en la rama `feature/load-tests` (retoma el trabajo del ex-PR #2
`refactor/arquitectura-capas-frontend`): reescritura del núcleo por capas
(domain/application/infrastructure), split CLI/server y layout web con tabs y
modal de guardado.

### Dónde quedamos (última sesión)

- **PR #3 abierta** → https://github.com/freyder-rey/probe/pull/3
  (`feature/load-tests` → `develop`), último commit `748a531`. Contenido:
  - **probe-core**: runner de tests de carga (secuencial, iteraciones/delay,
    datos CSV interpolados con `{{variable}}`, reporte con avg/p95 y
    cancelación con `AtomicBool`). 19 tests OK.
  - **probe-cli**: `probe test list|run` (Ctrl+C y reporte).
  - **probe-server**: `/api/tests/{collection}/{test}/start|status|stop` +
    `state.rs` (AppState/RunState).
  - **web**: editor de tests en el panel principal — modo `Solicitud|Test`
    (`setMode`), selector de colección de origen con checkboxes, guardado
    eligiendo destino (`#save-test-modal`), ejecución con polling de 400 ms y
    reporte en `#test-panel`. `state.collectionCache` se invalida al guardar.
  - Docs (SPEC, CLI, AGENTS) y `.gitignore` actualizados.
- `crates/test/` (CSVs de prueba del runner) está gitignoreado — no se sube.
- Verificado: `cargo test --workspace` 19 OK, `clippy` sin warnings, smoke test
  de la API (crear → start → status done → stop) OK.

### Dónde vamos

1. Revisar y mergear **PR #3** → `develop`; borrar `feature/load-tests`.
2. Roadmap pendiente: **export Markdown** y **Electron** (envolver la UI como
   cáscara de escritorio, decisión D3).
3. V2 posible de load tests: pausa/reanudar, más métricas en el reporte.
