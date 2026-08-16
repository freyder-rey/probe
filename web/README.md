# web — Frontend React de probe

UI de probe en **React 19 + TypeScript + Vite** (raíz del repo, reutilizable por
Electron como cáscara de escritorio en una etapa posterior).

## Comandos

```sh
npm install        # instalar dependencias
npm run dev        # dev server :5173 (proxya /api a 127.0.0.1:7878)
npm run build      # genera ../crates/probe-server/static/dist/ (gitignored)
npm run test       # tests unitarios con Vitest + Testing Library
npm run lint       # oxlint
```

El build de producción (`static/dist/`) lo sirve `probe-server` desde disco en
runtime, con fallback al frontend vanilla de `static/` si el build no existe.

## Estructura

- `src/types.ts` — tipos TS que reflejan el JSON público de `probe-core`
  (serde `camelCase`, enums con `tag`: body `none|raw|urlencoded`, validaciones
  por `kind`) + helpers `newRequest`, `newTestDraft`, `draftToLoadTest`.
- `src/api.ts` — cliente fetch tipado para la API de `probe-server`
  (colecciones, execute, tests y subida de CSV).
- `src/App.tsx` — layout general + estado de la sesión + suscripción SSE al
  progreso de los tests.
- `src/components/` — `Sidebar`, `RequestEditor`, `ResponsePanel`,
  `TestEditor`, `TestPanel`, `SaveTestModal`, `JsonEditor`.
- `src/editor/extensions.ts` — extensiones de CodeMirror 6 (resaltado de JSON y
  de `{{variables}}`, tema).
- `src/test/setup.tsx` — setup de Vitest (jest-dom + mock de CodeMirror para
  jsdom).

## Tests

`npm run test` corre los tests unitarios (Vitest + jsdom + Testing Library).
Cubren la lógica pura de `types.ts` y los componentes `App`, `TestEditor`,
`TestPanel` y `ResponsePanel`. CodeMirror se mockea en `setup.tsx` porque no
funciona en jsdom.

El dev flow: `cargo run -p probe-server` en una terminal y `npm run dev` en
otra; Vite proxya `/api` al server en `:7878`.
