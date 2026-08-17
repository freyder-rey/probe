// Tipos que reflejan el JSON público de probe-core (serde camelCase + tags).

export interface KeyValue {
  key: string
  value: string
  enabled: boolean
}

export type Body = { type: 'none' } | { type: 'raw'; content: string } | { type: 'urlencoded'; fields: KeyValue[] }

export type Validation =
  | { kind: 'status_equals'; name: string; expected: number }
  | { kind: 'header_equals'; name: string; header: string; expected: string }
  | { kind: 'header_contains'; name: string; header: string; expected: string }
  | { kind: 'body_contains'; name: string; expected: string }
  | { kind: 'body_equals'; name: string; expected: string }
  | { kind: 'json_equals'; name: string; path: string; expected: unknown }
  | { kind: 'json_exists'; name: string; path: string }
  | { kind: 'duration_lt'; name: string; maxMs: number }

export interface Request {
  id?: string
  name: string
  method: string
  url: string
  query: KeyValue[]
  headers: KeyValue[]
  body: Body
  timeoutSecs: number
  followRedirects: boolean
  validations: Validation[]
}

export interface Collection {
  name: string
  version: string
  requests: Request[]
  tests: LoadTest[]
}

export interface CollectionSummary {
  name: string
  size: number
}

export interface ValidationResult {
  name: string
  passed: boolean
  detail: string
}

export interface Response {
  status: number
  statusText: string
  httpVersion: string
  headers: [string, string][]
  body: string | null
  durationMs: number
  url: string
  validationResults: ValidationResult[]
}

export type CsvSource = { type: 'path'; path: string }

export interface LoadTest {
  name: string
  requestNames: string[]
  iterations: number
  delayMs: number
  csv: CsvSource | null
}

export interface RequestSummary {
  name: string
  total: number
  success: number
  failed: number
}

export interface LoadTestReport {
  testName: string
  durationMs: number
  totalRequests: number
  success: number
  failed: number
  avgMs: number
  p95Ms: number
  perRequest: RequestSummary[]
  errors: string[]
}

/** Resultado de una ejecución individual (solicitud × iteración/CSV row). */
export interface RunEvent {
  request: string
  /** Iteración 1-based en la que se ejecutó la solicitud. */
  iteration: number
  /** Índice 0-based de la fila CSV usada (null si no hay CSV). */
  csvRow: number | null
  /** Status HTTP real (null si hubo error de red/parseo). */
  status: number | null
  ok: boolean
  durationMs: number
  error: string | null
}

export interface RunStatus {
  status: string
  done: number
  total: number
  report: LoadTestReport | null
  error: string | null
  /** Solicitud que se está ejecutando ahora (progreso real-time). */
  currentRequest: string | null
  /** Acumulado por solicitud en vivo (progreso real-time). */
  perRequest: RequestSummary[]
  /** Última ejecución completada (log en vivo). */
  lastEvent: RunEvent | null
}

export function newRequest(): Request {
  return {
    name: '',
    method: 'GET',
    url: '',
    query: [],
    headers: [],
    body: { type: 'none' },
    timeoutSecs: 30,
    followRedirects: true,
    validations: [],
  }
}

// Borrador del editor de tests (estado local del formulario).
export interface TestDraft {
  name: string
  collection: string
  all: boolean
  requestNames: string[]
  iterations: number
  delayMs: number
  csv: string
  csvColumns: string[]
}

export function newTestDraft(): TestDraft {
  return { name: '', collection: '', all: true, requestNames: [], iterations: 1, delayMs: 0, csv: '', csvColumns: [] }
}

export function draftToLoadTest(d: TestDraft): LoadTest {
  return {
    name: d.name.trim(),
    requestNames: d.all ? [] : d.requestNames,
    iterations: d.iterations,
    delayMs: d.delayMs,
    csv: d.csv.trim() ? { type: 'path', path: d.csv.trim() } : null,
  }
}
