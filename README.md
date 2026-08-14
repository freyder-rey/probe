# probe

Cliente de APIs similar a Postman (sin ser idéntico). Ejecuta solicitudes HTTP
con **cualquier verbo**, guarda colecciones por usuario y permite **validaciones
declarativas** sobre las respuestas.

## Documentación

- [SPEC.md](SPEC.md) — especificación y decisiones de diseño.
- [docs/CLI.md](docs/CLI.md) — guía completa de uso del CLI, formato de
  colecciones y API del servidor.

## Stack

- Rust (workspace Cargo)
  - `probe-core` — motor HTTP (`reqwest`) + modelo + almacenamiento
  - `probe-cli` — interfaz de terminal
  - `probe-server` — backend web (`axum`) que sirve la interfaz
- Web: HTML + JS (sin build step), envuelta en Electron en una etapa posterior.

## Uso rápido

```sh
# Compilar
cargo build

# Ejecutar una solicitud desde la terminal
cargo run -p probe-cli -- run https://httpbin.org/json \
  --validate "status_equals:200" \
  --validate "json_exists:$.slideshow.title"

# Interfaz web (abrir http://127.0.0.1:7878)
cargo run -p probe-server
```

Las colecciones se guardan en `~/.probe/collections/` (por usuario, configurable
con `PROBE_COLLECTIONS_DIR`).
