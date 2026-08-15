# probe — Guía de uso (CLI)

Cliente de APIs desde la terminal. Todo lo que hace el CLI también está
disponible vía API del servidor (ver [API del servidor](#api-del-servidor)).

---

## Índice

1. [Compilar e instalar](#1-compilar-e-instalar)
2. [Estructura de comandos](#2-estructura-de-comandos)
3. [Ejecutar una solicitud en línea](#3-ejecutar-una-solicitud-en-línea)
4. [Cuerpos de solicitud](#4-cuerpos-de-solicitud)
5. [Validaciones declarativas](#5-validaciones-declarativas)
6. [Colecciones](#6-colecciones)
7. [Tests de carga](#7-tests-de-carga)
8. [Formato JSON de una colección](#8-formato-json-de-una-colección)
9. [Almacenamiento por usuario](#9-almacenamiento-por-usuario)
10. [API del servidor](#10-api-del-servidor)

---

## 1. Compilar e instalar

Requiere Rust (`rustc` ≥ 1.74, `cargo`).

```sh
cargo build --release          # compila todo el workspace
./target/release/probe --help  # binario del CLI
```

Opcional, para usar el comando `probe` desde cualquier directorio:

```sh
cargo install --path crates/probe-cli
```

Para ver la ayuda en cualquier momento:

```sh
probe --help
probe run --help
probe collection --help
```

---

## 2. Estructura de comandos

```
probe
├── run [URL] [opciones]          # ejecuta una solicitud HTTP
├── collection
│   ├── list                      # lista colecciones guardadas
│   ├── save <archivo.json>       # importa una colección desde archivo
│   ├── new <nombre>              # crea una colección vacía
│   └── delete <nombre>           # elimina una colección guardada
└── test
    ├── list <colección>          # lista los tests de una colección
    └── run <colección> <test>    # ejecuta un test de carga
```

---

## 3. Ejecutar una solicitud en línea

La forma más simple: pasar la URL como primer argumento.

```sh
# GET por defecto
probe run https://api.example.com/users

# Con verbo explícito
probe run https://api.example.com/users --method POST

# Cualquier verbo HTTP funciona: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE, ...
probe run https://api.example.com/users/42 --method DELETE
```

### Query params

```sh
probe run "https://api.example.com/users" --query "limit=10" --query "sort=desc"
# → https://api.example.com/users?limit=10&sort=desc
```

### Headers

Formato `Clave: Valor` (con los dos puntos). Repetible.

```sh
probe run https://api.example.com/users \
  --header "Authorization: Bearer token123" \
  --header "Accept: application/json"
```

### Timeout y redirecciones

```sh
probe run https://api.example.com --timeout 10      # timeout en segundos (default 30)
probe run https://example.com --no-follow           # no seguir redirecciones (ver 3xx)
```

---

## 4. Cuerpos de solicitud

Hay tres modos de cuerpo. Si no se indica ninguno, la solicitud se envía sin
cuerpo.

### Modo raw (texto libre)

```sh
probe run https://api.example.com/users --method POST \
  --header "Content-Type: application/json" \
  --body '{"name":"ana","role":"admin"}'
```

> **Importante**: al enviar body raw, el `Content-Type` **no** se agrega solo.
> Indícalo con `--header "Content-Type: ..."` según tu caso.

### Modo urlencoded (`application/x-www-form-urlencoded`)

```sh
probe run https://api.example.com/login --method POST \
  --form "user=ana" --form "password=secret"
```

El `Content-Type` se agrega automáticamente.

### Sin cuerpo

```sh
probe run https://api.example.com/status --method GET
```

> `--body` y `--form` son excluyentes: si pasas ambos, gana `--body`.

---

## 5. Validaciones declarativas

Las validaciones son comprobaciones que **el motor ejecuta contra la respuesta**
y muestra como `[PASÓ]` o `[FALLÓ]`. Se definen con `--validate`, repetible,
en el formato `tipo:campo:esperado`.

| tipo             | formato                          | ejemplo                                      |
|------------------|----------------------------------|----------------------------------------------|
| `status_equals`  | `status_equals:código`           | `--validate "status_equals:200"`             |
| `header_equals`  | `header_equals:header:valor`     | `--validate "header_equals:content-type:application/json"` |
| `header_contains`| `header_contains:header:subtexto`| `--validate "header_contains:content-type:json"` |
| `body_contains`  | `body_contains:texto`            | `--validate "body_contains:\"users\""`       |
| `body_equals`    | `body_equals:texto`              | `--validate "body_equals:{\"ok\":true}"`     |
| `json_equals`    | `json_equals:ruta:valor`         | `--validate "json_equals:$.page:2"`          |
| `json_exists`    | `json_exists:ruta`               | `--validate "json_exists:$.items[0].id"`     |
| `duration_lt`    | `duration_lt:ms`                 | `--validate "duration_lt:1000"`              |

### Rutas JSON

Las rutas usan la sintaxis `$.campo.subcampo[índice]`:

```sh
# Suponiendo la respuesta: {"users":[{"id":1,"name":"ana"}],"meta":{"page":2}}
probe run https://api.example.com --validate "json_exists:$.users[0].name"
probe run https://api.example.com --validate "json_equals:$.meta.page:2"
```

En `json_equals`, el valor esperado se interpreta como JSON si es posible
(`2` = número, `"2"` = string).

### Ejemplo completo

```sh
probe run https://httpbin.org/json \
  --validate "status_equals:200" \
  --validate "header_contains:content-type:json" \
  --validate "json_exists:$.slideshow.title" \
  --validate "duration_lt:5000"
```

Salida:

```
200 OK
URL final: https://httpbin.org/json
Tiempo: 375 ms | HTTP/1.1

Validaciones:
  [PASÓ] status_equals:200 — status esperado 200, obtenido 200
  [PASÓ] header_contains:content-type:json — header "content-type" = "application/json", debe contener "json"
  [PASÓ] json_exists:$.slideshow.title — la ruta "$.slideshow.title" existe
  [FALLÓ] duration_lt:5000 — duración esperada < 5000 ms, obtenida 5231 ms

date: Fri, 14 Aug 2026 20:17:34 GMT
content-type: application/json
...
```

---

## 6. Colecciones

Las colecciones agrupan solicitudes guardadas. Se administran así:

```sh
# Listar colecciones guardadas
probe collection list

# Crear una colección vacía
probe collection new "Mi API"

# Importar una colección desde un archivo JSON
probe collection save /ruta/mi-coleccion.json

# Eliminar una colección
probe collection delete "Mi API"
```

### Ejecutar una solicitud guardada

```sh
# Por nombre de colección guardada
probe run "Mi API" --name "Obtener usuarios"

# O desde un archivo JSON directo
probe run /ruta/mi-coleccion.json --name "Obtener usuarios"
```

El `--name` busca una solicitud por su campo `name` dentro de la colección. Si
no la encuentra, falla con un error claro.

> Nota: si pasas `--name`, el primer argumento se interpreta como **colección**;
> si no, se interpreta como **URL** y se envía en línea.

---

## 7. Tests de carga

Un test ejecuta un subconjunto de solicitudes de una colección en **secuencia**,
un número de veces (iteraciones), con un delay configurable entre solicitudes.
Las validaciones de cada solicitud se evalúan en cada ejecución.

```sh
# Listar los tests de una colección
probe test list "Mi API"

# Ejecutar un test (Ctrl+C para detener)
probe test run "Mi API" "Smoke"
```

Salida:

```
Ejecutando test "Smoke" (Ctrl+C para detener)...
  10 de 10 solicitudes

== Reporte del test "Smoke" (PASÓ) ==
  Duración: 2413 ms
  Solicitudes: 10 total, 10 OK, 0 fallidas
  Tiempo por solicitud: promedio 241 ms, p95 412 ms

  Por solicitud:
    login — 10 total, 10 OK, 0 fallidas
```

Opciones para sobreescribir la configuración del test:

```sh
probe test run "Mi API" "Smoke" --iterations 50 --delay 100
```

### Datos variables con CSV

Un test puede leer filas de un archivo CSV local. La primera fila son los
**nombres de variables**; cada fila siguiente ejecuta el flujo con esos valores,
interpolados con la sintaxis `{{variable}}` en URL, query, headers y body. Si
hay más iteraciones que filas, el CSV se **cicla**.

```sh
# usuarios.csv
# id,nombre
# 1,ana
# 2,leo

probe test run "Mi API" "Usuarios por lote"
```

Si el test referencia una solicitud que no existe, o el CSV no se puede leer, el
comando falla con un error claro antes de ejecutar.

---

## 8. Formato JSON de una colección

Las colecciones se guardan y se intercambian como JSON. Ejemplo completo:

```json
{
  "name": "Mi API",
  "version": "1",
  "requests": [
    {
      "name": "Obtener usuarios",
      "method": "GET",
      "url": "https://api.example.com/users",
      "query": [
        { "key": "limit", "value": "10", "enabled": true }
      ],
      "headers": [
        { "key": "Authorization", "value": "Bearer xyz", "enabled": true }
      ],
      "body": { "type": "none" },
      "timeoutSecs": 30,
      "followRedirects": true,
      "validations": [
        { "kind": "status_equals", "name": "Es 200", "expected": 200 },
        { "kind": "json_exists", "name": "Tiene id", "path": "$.id" }
      ]
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

### Campos de un test

| campo          | tipo                       | obligatorio | descripción                                   |
|----------------|----------------------------|-------------|-----------------------------------------------|
| `name`         | string                     | sí          | nombre único del test                         |
| `requestNames` | lista de string            | no          | solicitudes del flujo; vacío = todas          |
| `iterations`   | número                     | no          | veces que corre el flujo (default `1`)        |
| `delayMs`      | número                     | no          | pausa entre solicitudes (default `0`)         |
| `csv`          | `{ "type": "path", "path" }` | no        | archivo CSV con variables `{{nombre}}`        |

El campo `tests` es opcional: las colecciones viejas (sin él) siguen cargando.

### Campos de una solicitud

| campo            | tipo                       | obligatorio | descripción                                  |
|------------------|----------------------------|-------------|----------------------------------------------|
| `name`           | string                     | sí          | nombre único dentro de la colección          |
| `method`         | string                     | sí          | verbo HTTP                                   |
| `url`            | string                     | sí          | URL del destino                              |
| `query`          | lista de `{key,value,enabled}` | no       | parámetros de query (enabled=false = omitido)|
| `headers`        | lista de `{key,value,enabled}` | no       | cabeceras                                    |
| `body`           | objeto                     | no          | ver modos de body                            |
| `timeoutSecs`    | número                     | no          | default `30`                                 |
| `followRedirects`| booleano                   | no          | default `true`                               |
| `validations`    | lista                      | no          | ver validaciones                             |

### Modos de body

```json
{ "type": "none" }
{ "type": "raw", "content": "{\"a\":1}" }
{ "type": "urlencoded", "fields": [ { "key": "a", "value": "1", "enabled": true } ] }
```

### Campos opcionales que se omiten

`id` es opcional y puede ser `null`. `enabled` en `query`/`headers`/`fields`
también es opcional (default `true`): los pares con `"enabled": false` se
ignoran al enviar la solicitud.

---

## 9. Almacenamiento por usuario

Las colecciones viven en el **directorio local de cada usuario**:

| Sistema | Ubicación por defecto      |
|---------|----------------------------|
| Linux/macOS | `~/.probe/collections/` |
| Windows | `%USERPROFILE%\.probe\collections\` |

La ubicación se puede cambiar con la variable de entorno `PROBE_COLLECTIONS_DIR`
(útil para tests y para tener perfiles separados):

```sh
export PROBE_COLLECTIONS_DIR=~/mi-studio-probe
probe collection list
```

> `probe collection new` y `probe collection save` escriben dentro de ese
> directorio. El CLI nunca escribe en el repositorio del proyecto.

---

## 10. API del servidor

Además del CLI, existe `probe-server`, que expone lo mismo vía HTTP. Ideal para
la interfaz web (y el futuro Electron).

```sh
cargo run -p probe-server
# probe server escuchando en http://127.0.0.1:7878
```

### Endpoints

| Método | Ruta                        | Descripción                                  |
|--------|-----------------------------|----------------------------------------------|
| GET    | `/`                         | mensaje de estado del server                 |
| POST   | `/api/execute`              | ejecuta una solicitud y devuelve la respuesta|
| GET    | `/api/collections`          | lista las colecciones guardadas              |
| POST   | `/api/collections`          | guarda una colección (body = colección JSON) |
| GET    | `/api/collections/{name}`   | carga una colección por nombre               |
| DELETE | `/api/collections/{name}`   | elimina una colección                        |
| POST   | `/api/tests/{c}/{t}/start`  | inicia un test en segundo plano              |
| GET    | `/api/tests/{c}/{t}/status` | estado y reporte de la ejecución             |
| POST   | `/api/tests/{c}/{t}/stop`   | detiene una ejecución en curso               |

### Ejemplo: ejecutar una solicitud

```sh
curl -X POST http://127.0.0.1:7878/api/execute \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "name": "Ping",
      "method": "GET",
      "url": "https://httpbin.org/json",
      "query": [],
      "headers": [],
      "body": { "type": "none" },
      "timeoutSecs": 30,
      "followRedirects": true,
      "validations": [
        { "kind": "status_equals", "name": "Es 200", "expected": 200 }
      ]
    }
  }'
```

La respuesta incluye `response.validationResults` con el resultado de cada
validación.

### Ejemplo: guardar y listar colecciones

```sh
curl -X POST http://127.0.0.1:7878/api/collections \
  -H "Content-Type: application/json" \
  -d '{"name":"Mi API","version":"1","requests":[]}'

curl http://127.0.0.1:7878/api/collections
# → [{"name":"Mi API","size":37}]

curl http://127.0.0.1:7878/api/collections/Mi%20API
```
