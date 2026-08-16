# probe — Especificación del sistema

> Cliente de APIs inspirado en Postman, sin pretender ser idéntico.
> Este documento es la fuente de verdad del alcance y evoluciona junto con el desarrollo.

## 1. Propósito

Construir un cliente de APIs que permita crear, guardar y ejecutar solicitudes
HTTP hacia cualquier endpoint, con soporte para **cualquier verbo HTTP**.

El proyecto se compone de dos superficies de uso:

- **CLI**: uso rápido y automatizable desde la terminal.
- **Web**: interfaz gráfica para explorar y administrar colecciones.

> Nota de alcance: en esta primera etapa **solo** se implementará la capacidad de
> ejecutar solicitudes HTTP con cualquier verbo. El resto de las funcionalidades
> se irá definiendo y agregando de forma incremental.

## 2. Objetivos

- Ejecutar solicitudes HTTP sin restricción de verbo: `GET`, `POST`, `PUT`,
  `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, etc.
- Permitir configurar por solicitud:
  - URL (con soporte de variables/placeholders a futuro).
  - Cabeceras (`headers`).
  - Cuerpo (`body`) en distintos formatos: texto plano, JSON, formulario, etc.
  - Parámetros de consulta (`query params`).
- Persistir las solicitudes y agruparlas en **colecciones** como archivos locales
  (JSON/Markdown).
- Compartir el núcleo de ejecución de solicitudes entre CLI y Web
  (un solo motor, dos interfaces).
- Mantener una experiencia simple y sin fricción al hacer una request.

## 3. No-objetivos (por ahora)

- No se implementan aún entornos/colecciones con variables.
- No hay historial ni pestañas múltiples.
- No hay autenticación de usuario ni sincronización en la nube.
- No hay generación de código a partir de solicitudes.
- No hay "documentación" pública de endpoints.

Estos puntos se evalúan en etapas posteriores, a definir conforme avance el proyecto.

## 4. Requisitos funcionales (etapa 1)

### RF-1: Ejecutar solicitudes HTTP con cualquier verbo

- El usuario puede elegir el verbo entre una lista abierta (no limitada a los
  estándar) y enviar la solicitud.
- Verbo por defecto: `GET`.

### RF-2: Configurar una solicitud

- **URL** (obligatoria).
- **Headers**: pares clave/valor, con la posibilidad de desactivar individualmente
  cada uno.
- **Query params**: pares clave/valor que se serializan en la URL.
- **Body** (etapa 1):
  - Modo *raw*: texto libre, con opción de sintaxis/resaltado para JSON.
  - Modo *x-www-form-urlencoded*: pares clave/valor que se serializan como
    `application/x-www-form-urlencoded`.
  - Modo *none*: sin cuerpo (para verbos como `GET`/`HEAD`).
  - `multipart/form-data` (subida de archivos): **fuera de alcance** en esta etapa.

### RF-3: Timeout y redirecciones

- **Timeout**: configurable por solicitud, valor por defecto **30 s**.
- **Redirecciones**: se siguen por defecto (hasta **10** saltos). Desactivable
  para ver el código 3xx tal cual.

### RF-4: Ver la respuesta

- Mostrar código de estado HTTP, tiempo total y tamaño.
- Mostrar cuerpo de la respuesta (texto/JSON) y cabeceras de respuesta.
- Mostrar el resultado de cada validación definida (PASÓ/FALLÓ).

### RF-5: Validaciones (declarativas)

- El usuario **define** (no ejecuta código) una lista de comprobaciones por
  solicitud. El motor las evalúa contra la respuesta y devuelve, por cada una,
  `pasó/falló` + detalle.
- Cada validación es un objeto con `kind`, un `name` descriptivo y sus campos
  propios:

  ```json
  { "kind": "status_equals",    "name": "Es 200", "expected": 200 }
  { "kind": "header_contains",  "name": "Es JSON", "header": "content-type", "expected": "application/json" }
  { "kind": "header_equals",    "name": "...", "header": "x-cache", "expected": "HIT" }
  { "kind": "body_contains",    "name": "...", "expected": "\"users\"" }
  { "kind": "body_equals",      "name": "...", "expected": "texto exacto" }
  { "kind": "json_equals",      "name": "...", "path": "$.page", "expected": 2 }
  { "kind": "json_exists",      "name": "...", "path": "$.items[0].id" }
  { "kind": "duration_lt",      "name": "...", "max_ms": 1000 }
  ```

- Rutas JSON con sintaxis `$.campo.subcampo[índice]`.
- Resultados forman parte del modelo `Response` (`validationResults`), visibles en
  CLI, Web y (futuro) Electron.
- **No** hay scripting en esta etapa (puerta abierta a futuro).

### RF-6: Colecciones y persistencia

- Las solicitudes se agrupan en colecciones guardadas como archivos locales **del
  usuario actual** (en `~/.probe/collections/`).
- Formato principal de intercambio: **JSON**.
- Representación **Markdown** de las colecciones para lectura humana.
- Comandos de gestión en el CLI: `list`, `save`, `new`, `delete`.
- El servidor expone los mismos recursos por API (`/api/collections`).

### RF-7: CLI

- Comando para ejecutar una solicitud directamente:

  ```sh
  probe run <colección|archivo> --name <solicitud>
  probe run --url <url> --method POST --header "Content-Type: application/json" --body '{"a":1}'
  ```

- Salida a consola con el resultado de la request (status, headers, body).
- Flag `--validate "kind:campo:esperado"` repetible para validar en línea.

### RF-8: Web

- Interfaz React + TypeScript (Vite) compilada a `crates/probe-server/static/dist/`
  y servida por el backend desde disco (SPA con fallback a `index.html`).
  Mientras no exista el build, el server sirve el frontend vanilla de `static/`.
- Editor de solicitud: método (cualquier verbo), URL, query, headers, body
  (none/raw/urlencoded), timeout, seguir redirects y validaciones.
- Visor de respuesta: status, tiempo, resultado de validaciones (✓/✗), headers
  y cuerpo (JSON con formato y resaltado, editor CodeMirror).
- Listado de colecciones locales: cargar, crear, guardar, eliminar y **exportar
  a Markdown** (botón `md` por colección, descarga de `<colección>.md` vía
  `GET /api/collections/{name}/markdown`, plantilla D1).
- Progreso real-time de los tests por **SSE** (`/api/tests/{c}/{t}/events`):
  la UI muestra `done/total`, la **solicitud que se está ejecutando** y una
  tabla **per-request en vivo** sin polling.
- Picker de **CSV** para los tests: el navegador sube el archivo a
  `/api/csv`, el server lo guarda en `~/.probe/collections/csv/` y devuelve la
  ruta que el runner lee (decisión D7).
- Tests unitarios del frontend con **Vitest + Testing Library** (`npm --prefix
  web run test`), incluidos en `make test`.
- Es la misma app que Electron envolverá como cáscara de escritorio en una
  etapa posterior.

### RF-9: Tests de carga

- Un **test** agrupa un subconjunto de solicitudes de una colección
  (`requestNames`, vacío = todas) y las ejecuta en **secuencia** `iterations`
  veces, con un `delayMs` configurable entre solicitudes.
- **Datos variables (CSV)**: el test puede apuntar a un archivo CSV local
  (`csv: { type: "path", path: "…" }`), escrito a mano en el CLI o **subido
  desde la web** (`POST /api/csv` lo guarda en `~/.probe/collections/csv/` y
  devuelve la ruta). La primera fila define los nombres de variables; cada fila
  siguiente define una ejecución del flujo (se **cicla** si hay más iteraciones
  que filas). Las variables se interpolan en URL, query, headers y body con la
  sintaxis `{{nombre}}` (decisión D5).
- Las **validaciones** de cada solicitud se evalúan en cada ejecución; una
  solicitud cuenta como fallida si alguna validación no pasa o hubo error de red.
- **V1**: ejecución secuencial (una petición a la vez, con delays reales),
  sin pausa/reanudar; solo **detener**. El reporte se genera al final (o
  parcial si se detuvo). El progreso se publica en vivo por **SSE**
  (`/api/tests/{c}/{t}/events`) con **granularidad por solicitud**: cada evento
  trae `done`/`total`, la `currentRequest` que se está ejecutando y el
  `perRequest` acumulado (decisión D8); la web lo muestra sin polling en una
  tabla en vivo.
- **Reporte**: duración, total de solicitudes, OK/fallidas, tiempo promedio y
  p95, desglose por solicitud y primeros errores encontrados.
- Superficies: CLI (`probe test list|run`), Web (panel de tests) y API
  (`/api/tests/{collection}/{test}/start|status|stop|events`).

## 5. Arquitectura

```
┌────────────┐   ┌────────────┐
│    CLI     │   │    Web     │  ← interfaces
└─────┬──────┘   └─────┬──────┘
      │                │
      └───────┬────────┘
              ▼
     ┌────────────────┐
     │  Motor HTTP    │  ← núcleo compartido (librería)
     └────────┬───────┘
              ▼
     ┌────────────────┐
     │ Almacenamiento │  ← colecciones en archivos (JSON/MD)
     └────────────────┘
```

- **Motor HTTP**: librería interna (`probe-core`) encargada de construir,
  ejecutar y serializar solicitudes y respuestas. Usa un cliente HTTP de Rust
  (`reqwest`).
- **CLI**: crate binario que envuelve `probe-core`.
- **Backend Web**: servidor `axum` que sirve la UI y expone la API de
  colecciones/requests. Comparte `probe-core`.
- **Frontend Web**: app **React + TypeScript (Vite)** compilada a
  `crates/probe-server/static/dist/` y servida desde disco por axum (fallback al
  frontend vanilla si no existe el build). Habla con la API vía `fetch`/`SSE` en
  `localhost`.
- **Electron** (etapa posterior): cáscara de escritorio que carga la misma UI
  web. No duplica código ni cambia el backend.

## 6. Persistencia (formato)

Las colecciones se guardan **por usuario** en el directorio local de su cuenta,
nunca en el repo ni compartidas:

- **Ubicación por defecto**: `~/.probe/collections/`
- **Sobreescribible** con la variable de entorno `PROBE_COLLECTIONS_DIR`
  (útil para tests y power users).

### JSON

Cada colección es un archivo `*.json` con esta forma (provisional):

```json
{
  "name": "Mi colección",
  "version": "1",
  "requests": [
    {
      "id": "uuid",
      "name": "Obtener usuarios",
      "method": "GET",
      "url": "https://api.example.com/users",
      "query": [ { "key": "limit", "value": "10", "enabled": true } ],
      "headers": [ { "key": "Authorization", "value": "Bearer xyz", "enabled": true } ],
      "body": { "type": "none" }
    }
  ],
  "tests": [
    {
      "name": "Smoke",
      "requestNames": [],
      "iterations": 10,
      "delayMs": 200,
      "csv": { "type": "path", "path": "~/datos.csv" }
    }
  ]
}
```

El campo `tests` es opcional y las colecciones viejas (sin él) siguen cargando.

### Markdown

Representación legible de una colección. Un archivo `*.md` por colección con una
sección por solicitud (plantilla fija):

```md
# <nombre de la colección>

## GET /users — Obtener usuarios

- **Método:** GET
- **URL:** https://api.example.com/users?limit=10

**Headers**

```text
Authorization: Bearer xyz
```

**Body**

```json
{
  "active": true
}
```

---

_Generado desde la colección `<archivo>.json`_
```

> El Markdown es **solo lectura** (formato de export/visualización). El JSON es
> siempre la fuente de verdad.

## 7. Stack propuesto

| Capa             | Tecnología                      |
|------------------|---------------------------------|
| Lenguaje         | Rust (workspace Cargo)          |
| Cliente HTTP     | `reqwest`                       |
| CLI              | `clap`                          |
| Backend Web      | `axum`                          |
| Frontend Web     | React + TypeScript (Vite)       |
| App de escritorio | Electron (etapa posterior)     |

## 8. Estructura del repo (propuesta)

```
probe/
├── Cargo.toml          # workspace
├── SPEC.md             # este documento
├── crates/
│   ├── probe-core/     # motor HTTP + almacenamiento
│   ├── probe-cli/      # interfaz de línea de comandos
│   └── probe-server/   # backend web + frontend estático
└── electron/           # (etapa posterior) cáscara de escritorio
```

## 9. Decisiones tomadas

- **D1 — Markdown**: plantilla simple, una sección por request (definida arriba).
- **D2 — Body etapa 1**: `raw` + `x-www-form-urlencoded` + `none`.
  `multipart/form-data` fuera de alcance.
- **D3 — Frontend**: web con **React + TypeScript (Vite)** compilado a
  `crates/probe-server/static/dist/` y servido desde disco por axum; el frontend
  vanilla de `static/` queda como fallback mientras no exista el build.
  Electron será una cáscara de escritorio en etapa posterior que carga la misma
  UI web. El dev server de Vite proxya `/api` al server en `:7878`.
- **D4 — Timeout/redirects**: timeout 30 s configurable; seguir redirecciones
  hasta 10 por defecto, desactivable.
- **D5 — Variables**: sintaxis `{{nombre}}` definida e **implementada** (los
  tests de carga interpolan CSV). Aplican a URL, query, headers y body. Las
  referencias `{{env.NOMBRE}}` para entornos quedan de etapa posterior.
- **D6 — Tests de carga**: v1 secuencial (una petición a la vez), sin
  concurrencia y sin pausa/reanudar; solo detener. El archivo CSV se guarda como
  ruta (`CsvSource::Path`) y se carga en memoria al ejecutar.
- **D7 — CSV desde la web**: como el navegador no puede dar rutas locales al
  server, la web sube el contenido del archivo a `POST /api/csv`; el server lo
  guarda en `csv_dir()` (`~/.probe/collections/csv/`, override
  `PROBE_COLLECTIONS_DIR`) y devuelve la ruta que el runner lee.
- **D8 — Progreso real-time**: el server publica el estado de cada ejecución por
  un canal `watch` (`RunState.progress`); la web lo consume por **SSE**
  (`/api/tests/{c}/{t}/events`) en vez de polling. Cada evento lleva
  `currentRequest` y `perRequest` (acumulado por solicitud en vivo), no solo
  `done`/`total`, para que la UI muestre qué se está ejecutando.
- **D9 — Export Markdown**: la generación de Markdown vive en `probe-core`
  (`collection_to_markdown`, plantilla D1); el server la expone por
  `GET /api/collections/{name}/markdown` y la web descarga el archivo. No hay
  parseo de Markdown: es solo export/visualización, el JSON es la fuente de verdad.

## 10. Criterios de aceptación (etapa 1)

- [ ] `probe run --url <url>` devuelve el resultado de la request en consola.
- [ ] Se puede elegir cualquier verbo HTTP y se envía correctamente.
- [ ] Se pueden enviar headers, query params y body (raw y urlencoded).
- [ ] La respuesta muestra status, headers y body.
- [ ] Timeout de 30 s por defecto y seguimiento de redirecciones activable/desactivable.
- [ ] Una colección se puede guardar/cargar desde un archivo JSON.
- [ ] `probe collection list|save|new|delete` administran colecciones por usuario.
- [ ] Las validaciones declarativas se ejecutan y muestran PASÓ/FALLÓ en el CLI.
- [ ] La interfaz web permite editar/enviar solicitudes y ver respuestas y validaciones.
- [ ] `probe test list|run` listan y ejecutan tests de carga con reporte.
- [ ] Un test puede leer datos de un CSV e interpolar `{{variables}}`.
- [ ] El test se puede detener (CLI con Ctrl+C, web con el botón detener).
- [ ] La web muestra el progreso del test en vivo por SSE sin polling.
- [ ] El progreso en vivo muestra la solicitud que se está ejecutando y el
      acumulado por solicitud (tabla per-request).
- [ ] Una colección se puede exportar a Markdown desde la web (descarga `.md`).
- [ ] La web permite subir un CSV desde el navegador para un test.
- [ ] Los tests del frontend (Vitest) y del backend (cargo) pasan con `make test`.
