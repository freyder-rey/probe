# PROBE

Cliente de APIs. Ejecuta solicitudes HTTP
con **cualquier verbo**, guarda colecciones por usuario y permite **validaciones
declarativas** sobre las respuestas.

## Documentacións
s
- [SPEC.md](SPEC.md) — especificación y decisiones de diseño.
- [docs/CLI.md](docs/CLI.md) — guía completa de uso del CLI, formato de
  colecciones y API del servidor.

## Stack

- Rust (workspace Cargo)
  - `probe-core` — motor HTTP (`reqwest`) + modelo + almacenamiento
  - `probe-cli` — interfaz de terminal
  - `probe-server` — backend web (`axum`) que sirve la interfaz
- Web: React + TypeScript + Vite (en `web/`), que Electron envolverá como
  cáscara de escritorio en una etapa posterior.

## Uso rápido

```sh
# Compilar
cargo build

# Ejecutar una solicitud desde la terminal
cargo run -p probe-cli -- run https://httpbin.org/json \
  --validate "status_equals:200" \
  --validate "json_exists:$.slideshow.title"

# Interfaz web (abrir http://127.0.0.1:7878)
npm --prefix web run build   # compila el frontend React a static/dist/
cargo run -p probe-server
```

Si no existe el build (`crates/probe-server/static/dist/`), el server sirve el
frontend vanilla de `static/` como fallback. Durante desarrollo de la UI se
puede usar el dev server de Vite con proxy a la API:

```sh
cargo run -p probe-server &   # API en :7878
npm --prefix web run dev      # UI en :5173 (proxya /api a :7878)
```

Las colecciones se guardan en `~/.probe/collections/` (por usuario, configurable
con `PROBE_COLLECTIONS_DIR`).
