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
└── probe-server/   # API axum + frontend: main.rs (router) + handlers.rs + state.rs
```

- `probe-core` es el núcleo compartido; CLI y server lo usan. Cada capa declara
  su `mod.rs` con re-exports, y sus tests viven en un `tests.rs` hermano
  (`#[cfg(test)] mod tests;`), no dentro de los archivos de negocio.
- `lib.rs` re-exporta la API pública de consumo (`probe_core::{Engine, Runner,
  Request, CollectionRepository, ...}`).
- DIP: la capa `application` define puertos (traits `CollectionRepository`,
  `HttpExecutor`, `CsvRowLoader`, `LoadTestRunner`); `infrastructure` los
  implementa. CLI y server construyen los concretos en su composition root
  (`main.rs`) y los inyectan a los handlers/comandos.
- Frontend: **React + TypeScript + Vite** en `web/` (raíz del repo, reutilizable
  por Electron). El build (`npm --prefix web run build`) genera
  `crates/probe-server/static/dist/` y el server lo sirve **desde disco** en
  runtime (fallback a index.html para rutas SPA). Si no existe el build, el
  server sirve el frontend vanilla de `static/` como fallback (decisión D3).
  Dev: Vite en :5173 con proxy de `/api` a `:7878`.

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
cargo test --workspace      # 20 tests unitarios + integración del runner
cargo clippy --workspace    # debe quedar sin warnings
cargo run -p probe-cli -- run https://httpbin.org/json
cargo run -p probe-server   # web en http://127.0.0.1:7878

# Frontend React (web/)
npm --prefix web install
npm --prefix web run build  # genera crates/probe-server/static/dist/ (gitignored)
npm --prefix web run dev    # dev server :5173 con proxy de /api a :7878
npm --prefix web run lint   # oxlint
```

> Si no existe `static/dist/`, el server sirve el frontend vanilla de `static/`
> como fallback (ambos caminos se mantienen durante la migración).
> Nota de toolchain: `.cargo/config.toml` fija `linker = "cc"` (en Arch/CachyOS
> gcc no expone el prefijo triple `x86_64-linux-gnu-`).

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

- **PR #3 mergeado** → `develop` (merge commit `6b19981`, squash del ex-PR #2 ya
  incluido). Load tests en `develop`.
- Antes del merge hubo que **rebasear** `feature/load-tests` sobre `develop`
  (los commits del refactor por capas y del layout web ya estaban en develop vía
  PR #2 y git los descartó automáticamente) y crear el fixture
  `crates/probe-core/src/infrastructure/testdata/usuarios.csv` (los tests lo
  referenciaban pero estaba gitignoreado en `crates/test/`). Backup local:
  `backup/load-tests-pre-rebase`.
- Contenido del PR #3:
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

### Sesión posterior (PRs #4-#6)

- **PR #4** (docs tras merge del #3) y **PR #5** (`fix/quick-wins`: verbo como
  `<select>` + arreglo CSS de checkboxes, incluido el padding global que los
  deformaba) mergeados → `develop`.
- **PR #6 `refactor/core-dip` mergeado** → `develop`. Aplica **DIP** en el
  núcleo:
  - Puertos en `application/ports.rs`: `CollectionRepository`, `HttpExecutor`,
    `CsvRowLoader`, `LoadTestRunner` (async vía `async-trait`).
  - Infraestructura implementa los puertos: `Storage` → `FileCollectionRepository`,
    `CsvLoader`, nuevo `InMemoryCollectionRepository` (tests).
  - `Engine` impl `HttpExecutor`; `Runner` recibe `Arc<dyn>` inyectados (ya no
    construye engine ni importa CSV de infraestructura) e impl `LoadTestRunner`.
  - `CollectionSummary` → dominio, sin campo `path`.
  - **Composition roots** en `main.rs` (server y CLI): construyen los concretos y
    los inyectan. Handlers sin `Storage::new()`/`Runner::new()`. `RunRegistry`
    encapsula el `Mutex<HashMap>` en `state.rs`.
  - 20 tests OK, clippy sin warnings, smoke test API + CLI OK.
- Pendiente conocido: **`cargo fmt` repo-wide** nunca se aplicó (no hay
  rustfmt.toml); barrido ajeno al refactor → PR separado.

### Dónde vamos

1. **PR C (este) — frontend React+Vite**: scaffold en `web/` (React 19 + Vite 8 +
   TS 6 + oxlint), tipos TS que reflejan el JSON serde, cliente API, shell con
   sidebar de colecciones + editor de solicitud + panel de respuesta. Build →
   `crates/probe-server/static/dist/` (gitignored), servido desde disco por el
   server con fallback al frontend vanilla y SPA fallback a index.html. Dev con
   Vite :5173 proxando `/api` a :7878. `.cargo/config.toml` fija el linker `cc`.
   Verificado: build, clippy, 20 tests, smoke API + web + fallback vanilla.
2. **D/E/F — migración por fases + CodeMirror**: completar la paridad del editor
   React (validaciones por kind, body urlencoded, modal de guardado con
   colección destino, modo Test con polling/reporte) y sumar CodeMirror para
   resaltado de JSON y de `{{variables}}`.
3. **G (progreso real-time)** y **H (picker de CSV)** sobre el frontend React
   (regla: no construir sobre el vanilla).
4. **I — tests + docs** de la UI migrada. Export Markdown y Electron (roadmap).
5. V2 posible de load tests: pausa/reanudar, más métricas en el reporte.
