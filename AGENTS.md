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

# Atajos con Makefile (raíz)
make dev                    # backend + frontend dev en paralelo (Ctrl+C detiene ambos)
make server                 # solo el backend
make web                    # solo el frontend dev (vite :5173)
make build                  # compila el frontend React a static/dist/
make test                   # tests Rust + tests y lint del frontend

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
- **Releases**: cada push a `main` (merge de develop → main) dispara el action
  `.github/workflows/release.yml`: auto-incrementa el patch semver (`v0.1.0` →
  `v0.1.1`…), crea el tag, compila binarios de `probe` y `probe-server` para
  Linux/macOS (x86_64 + aarch64)/Windows y publica un GitHub Release con el
  changelog de PRs mergeados. La versión del tag y la del workspace
  `Cargo.toml` (`0.1.0`) se mantienen sincronizadas solo en el arranque; los
  bumps son por tag.

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

1. **PR C — frontend React+Vite**: scaffold en `web/` (React 19 + Vite 8 +
   TS 6 + oxlint), tipos TS que reflejan el JSON serde, cliente API, shell con
   sidebar de colecciones + editor de solicitud + panel de respuesta. Build →
   `crates/probe-server/static/dist/` (gitignored), servido desde disco por el
   server con fallback al frontend vanilla y SPA fallback a index.html. Dev con
   Vite :5173 proxando `/api` a :7878. `.cargo/config.toml` fija el linker `cc`.
   Verificado: build, clippy, 20 tests, smoke API + web + fallback vanilla.
2. **PR C+ — Makefile + graceful shutdown**: `make dev|server|web|build|test|lint`
   en la raíz (`make dev` levanta backend + frontend y Ctrl+C detiene ambos con
   `$(MAKE) -j2`). `probe-server` ahora hace graceful shutdown con Ctrl+C/SIGTERM
   (antes ignoraba SIGINT). Verificado: `make dev` + Ctrl+C limpia ambos procesos.
3. **PR D — paridad del modo Test en React**: mode-switch `Solicitud|Test`, editor
   de tests (nombre, colección de origen, checkboxes de solicitudes con "todas",
   iteraciones/delay/CSV), guardado eligiendo colección destino o creando una
   nueva (`SaveTestModal`), runner con polling de 400 ms y panel de reporte
   (avg/p95, tabla por solicitud, errores), y lista de tests en la sidebar con
   ejecutar/detener/editar/ver reporte. Verificado: build, lint, 20 tests,
   smoke test end-to-end del runner vía API.
4. **PR E/F — CodeMirror + paridad fina (hecho)**: resaltado de JSON y de
   `{{variables}}` con CodeMirror 6 (`@uiw/react-codemirror`) en el body raw y
   en la respuesta (read-only), tema alineado a la paleta de la app. Paridad
   fina: modal de guardado de solicitud con "crear nueva colección" y guardado
   en un clic, splitter arrastrable y Escape cierra modales. Verificado: build,
   lint, 20 tests, servido SPA + fallback vanilla.
5. **G — progreso real-time con SSE** y **H — picker de CSV** sobre el frontend
   React (regla: no construir sobre el vanilla):
   - **Backend**: `RunState` gana un canal `watch` (`progress`), y los handlers
     lo notifican en cada avance del runner (`run.notify()` dentro del closure
     `on_progress` y al terminar). Nuevo endpoint `GET
     /api/tests/{collection}/{test}/events` (`test_events`) que emite un stream
     SSE (async-stream) con el `RunStatusResponse` actual y cierra al salir de
     `running`. Nuevo `POST /api/csv` (`upload_csv`) que guarda el contenido en
     `csv_dir()` (`~/.probe/collections/csv/`, override `PROBE_COLLECTIONS_DIR`)
     y devuelve la ruta que lee el runner. `RunStatusResponse` ahora es `Clone`.
   - **web**: el polling de 400 ms se reemplazó por un `EventSource` sobre
     `/events` (cierra al recibir status != running); `TestEditor` gana un
     picker de CSV (`Subir CSV…`, lee el archivo y lo sube a `/api/csv`).
   - Verificado: build, lint, 20 tests, clippy limpio, smoke end-to-end del SSE
     (progreso 1/20→20/20 + reporte, y stop en vivo con `stopped`) y de la
     subida de CSV vía API.
6. **I — tests + docs de la UI migrada (hecho)**: Vitest 4 + Testing Library en
   `web/` (`npm --prefix web run test`; CodeMirror mockeado en
   `src/test/setup.tsx` porque no funciona en jsdom). 23 tests: `types.ts`
   (draft→LoadTest), `App` (api mockeado), `TestEditor`, `TestPanel` y
   `ResponsePanel`. `make test` ahora corre Rust + vitest + lint. Docs
   actualizadas: SPEC (RF-8/RF-9, decisiones D7/D8, criterios de aceptación),
   docs/CLI.md (endpoints `events` y `csv`), web/README.md. Electron queda en el
   roadmap.
7. **J — export Markdown + progreso real-time granular (hecho)**: `cargo fmt`
   repo-wide aplicado (PR #10). Export Markdown: generador
   `collection_to_markdown` en probe-core (plantilla D1, `application/markdown.rs`)
   + endpoint `GET /api/collections/{name}/markdown` + botón `md` en la sidebar
   (descarga `<colección>.md`). Progreso real-time granular: el runner emite
   `RunProgress` (domain) con `done/total`, `current_request` y `per_request`
   acumulado por solicitud; `on_progress` cambia de `Fn(u64,u64)` a `Fn(RunProgress)`
   (puerto `LoadTestRunner`). `RunStatusResponse` gana `currentRequest`/`perRequest`
   y **`lastEvent`** (`RunEvent`: request, iteración, status HTTP real, ok/fail,
   duración, error) para el **log en vivo secuencial** — la web muestra "Ejecutando: X",
   la tabla per-request en vivo por SSE y un log "Enviando… → Status 200/500…" que
   también queda en el reporte final. 24 tests Rust (2 markdown, 1 Validation::name,
   1 RunEvent con status), 26 tests web (3 nuevos: tabla en vivo, log y export).
8. V2 posible de load tests: pausa/reanudar, más métricas en el reporte.

### Sesión reciente (PRs #13-#17 + release CI)

- **PR #13 `fix/pestanas-tabs` mergeado** → `develop`. Las pestañas
  Headers/Body/Validaciones y de respuesta no mostraban contenido: el CSS venía
  del frontend vanilla (`.tab { display: none }`, el JSX React solo marcaba
  `tab active` en la primera). Fix en `web/src/index.css` (`.tab` siempre
  visible, `#response .tab`) + `web/src/components/RequestEditor.test.tsx`
  (2 tests). 28 tests web.
- **PR #14 `ci/release-workflow` mergeado** → `develop`. Nuevo
  `.github/workflows/release.yml`: en cada push a `main` (merge develop → main)
  auto-incrementa el patch semver (`v0.1.0` → `v0.1.1`…), crea el tag, compila
  `probe` + `probe-server` en release para Linux (x86_64), macOS (x86_64 +
  aarch64) y Windows (x86_64) y publica un GitHub Release con changelog de PRs
  mergeados. reqwest usa TLS nativo de cada SO (Linux instala `pkg-config
  libssl-dev`). Validado con actionlint.
- **Bug heredoc en GITHUB_OUTPUT**: el changelog se pasaba con
  `changelog<<'EOF'` a `GITHUB_OUTPUT`, pero GitHub Actions NO parsea el heredoc
  como bash (el delimitador se toma literal, `'EOF'` con comillas) →
  "Matching delimiter not found ''. Fix en **PR #16 `fix/ci-release-workflow`**
  (el original #14 ya estaba mergeado; rama limpia desde develop): el changelog
  se escribe a `changelog.txt`, se sube como **artefacto** (`name: changelog`) y
  el job `release` lo usa vía `body_path` (en vez de `body:` multilínea).
- **PR #17 merge develop → main** (`ad78bcb`): `main` ya tiene el workflow
  fixeado (`body_path`). **PR #15** (el primer merge develop → main) falló por
  el bug del heredoc.
- **Estado del release CI** (a 2026-08-16): el action corrió sobre `main`
  (`31923012806`), el job `version` pasó, pero **`build` de Windows falla**:
  el paso "Renombrar binarios con sufijo de plataforma" copia a `/tmp/out`
  (Git Bash de Windows lo resuelve bien, los archivos existen) pero
  `actions/upload-artifact@v4` no ve `/tmp/out` en Windows
  (`##[error]No files were found with the provided path: /tmp/out`). Fix
  pendiente: usar una ruta relativa al workspace (ej. `dist/`) en vez de
  `/tmp/out`. Los otros 3 builds (linux + 2 mac) pasan. **No hay release
  publicado** y existen tags `v0.1.0`-`v0.1.3` sin release asociado (los crea
  el job `version` en cada run; `v0.1.1`/`v0.1.2` apuntan al initial commit
  `8b6573c` — basura de los runs fallidos).
- Ramas: solo `develop` y `main` en el remoto (las de PRs ya mergeados se
  borraron con `deleteBranchOnMerge: true`; la huérfana `ci/release-workflow`
  post-merge se eliminó a mano).
- **Git flow a respetar**: ramas `feature/`, `docs/`, `fix/`, `hotfix/` — NO
  prefijos tipo `ci/`.
- Verificado local: build, clippy/fmt limpios, 24 tests Rust, 28 tests web,
  lint. `make test` corre Rust + vitest + lint.
