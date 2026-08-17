import { useEffect, useState } from 'react'
import type { Collection, KeyValue, Request, Validation } from '../types'
import { JsonEditor } from './JsonEditor'

interface Props {
  request: Request
  onChange: (r: Request) => void
  collections: Collection[]
  onSend: () => void
  onSave: (target: Collection) => Promise<void>
  onCreateNew: (name: string) => Promise<void>
  sending: boolean
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--green)',
  POST: 'var(--orange)',
  PUT: 'var(--accent)',
  PATCH: 'var(--teal)',
  DELETE: 'var(--red)',
  HEAD: 'var(--purple)',
}

const VALIDATION_KINDS: { kind: Validation['kind']; label: string; fields: { name: string; label: string; type: 'text' | 'number'; placeholder: string }[] }[] = [
  { kind: 'status_equals', label: 'Status igual a', fields: [{ name: 'expected', label: 'Código', type: 'number', placeholder: '200' }] },
  { kind: 'header_equals', label: 'Header igual a', fields: [{ name: 'header', label: 'Header', type: 'text', placeholder: 'content-type' }, { name: 'expected', label: 'Valor', type: 'text', placeholder: 'application/json' }] },
  { kind: 'header_contains', label: 'Header contiene', fields: [{ name: 'header', label: 'Header', type: 'text', placeholder: 'content-type' }, { name: 'expected', label: 'Texto', type: 'text', placeholder: 'json' }] },
  { kind: 'body_contains', label: 'Body contiene', fields: [{ name: 'expected', label: 'Texto', type: 'text', placeholder: '"users"' }] },
  { kind: 'body_equals', label: 'Body igual a', fields: [{ name: 'expected', label: 'Texto', type: 'text', placeholder: '{"ok":true}' }] },
  { kind: 'json_equals', label: 'JSON ruta igual', fields: [{ name: 'path', label: 'Ruta', type: 'text', placeholder: '$.page' }, { name: 'expected', label: 'Valor', type: 'text', placeholder: '2' }] },
  { kind: 'json_exists', label: 'JSON ruta existe', fields: [{ name: 'path', label: 'Ruta', type: 'text', placeholder: '$.items[0].id' }] },
  { kind: 'duration_lt', label: 'Duración menor a', fields: [{ name: 'max_ms', label: 'ms', type: 'number', placeholder: '1000' }] },
]

function kindFields(kind: Validation['kind']) {
  return VALIDATION_KINDS.find((k) => k.kind === kind)?.fields ?? []
}

function validationValue(v: Validation, field: string): string | number {
  switch (v.kind) {
    case 'status_equals':
      return field === 'expected' ? v.expected : ''
    case 'duration_lt':
      return field === 'max_ms' ? v.maxMs : ''
    case 'header_equals':
    case 'header_contains':
      return field === 'header' ? v.header : field === 'expected' ? v.expected : ''
    case 'body_contains':
    case 'body_equals':
      return field === 'expected' ? v.expected : ''
    case 'json_equals':
      return field === 'path' ? v.path : field === 'expected' ? String(v.expected) : ''
    case 'json_exists':
      return field === 'path' ? v.path : ''
  }
}

function validationName(v: Validation): string {
  const { name: _, ...rest } = v
  return `${v.kind}: ${JSON.stringify(rest)}`
}

function makeValidation(kind: Validation['kind']): Validation {
  switch (kind) {
    case 'status_equals':
      return { kind, name: 'Validación', expected: 200 }
    case 'duration_lt':
      return { kind, name: 'Validación', maxMs: 1000 }
    case 'header_equals':
    case 'header_contains':
      return { kind, name: 'Validación', header: '', expected: '' }
    case 'body_contains':
    case 'body_equals':
      return { kind, name: 'Validación', expected: '' }
    case 'json_equals':
      return { kind, name: 'Validación', path: '', expected: '' }
    case 'json_exists':
      return { kind, name: 'Validación', path: '' }
  }
}

export function RequestEditor({ request, onChange, onSend, onSave, onCreateNew, collections, sending }: Props) {
  const [tab, setTab] = useState<'query' | 'headers' | 'body' | 'validations'>('query')
  const [saveModal, setSaveModal] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')

  useEffect(() => {
    if (!saveModal) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSaveModal(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [saveModal])

  function set<K extends keyof Request>(key: K, value: Request[K]) {
    onChange({ ...request, [key]: value })
  }

  function setKv(list: 'query' | 'headers', rows: KeyValue[]) {
    set(list, rows)
  }

  function updateKv(list: 'query' | 'headers', idx: number, patch: Partial<KeyValue>) {
    setKv(list, request[list].map((kv, i) => (i === idx ? { ...kv, ...patch } : kv)))
  }

  function addKv(list: 'query' | 'headers') {
    setKv(list, [...request[list], { key: '', value: '', enabled: true }])
  }

  function removeKv(list: 'query' | 'headers', idx: number) {
    setKv(list, request[list].filter((_, i) => i !== idx))
  }

  function switchBodyType(type: Request['body']['type']) {
    if (type === 'raw') set('body', { type: 'raw' as const, content: '' })
    else if (type === 'urlencoded') set('body', { type: 'urlencoded' as const, fields: [] })
    else set('body', { type: 'none' as const })
  }

  function updateRawBody(content: string) {
    set('body', { type: 'raw' as const, content })
  }

  function updateUrlEncoded(idx: number, patch: Partial<KeyValue>) {
    if (request.body.type !== 'urlencoded') return
    set('body', {
      ...request.body,
      fields: request.body.fields.map((kv, i) => (i === idx ? { ...kv, ...patch } : kv)),
    })
  }

  function addUrlEncoded() {
    if (request.body.type !== 'urlencoded') return
    set('body', { ...request.body, fields: [...request.body.fields, { key: '', value: '', enabled: true }] })
  }

  function removeUrlEncoded(idx: number) {
    if (request.body.type !== 'urlencoded') return
    set('body', { ...request.body, fields: request.body.fields.filter((_, i) => i !== idx) })
  }

  function updateValidation(idx: number, patch: Partial<Validation>) {
    set('validations', request.validations.map((v, i) => {
      if (i !== idx) return v
      const merged = { ...v, ...patch } as Validation
      return { ...merged, name: validationName(merged) }
    }))
  }

  function changeValidationKind(idx: number, kind: Validation['kind']) {
    set('validations', request.validations.map((v, i) => (i === idx ? makeValidation(kind) : v)))
  }

  function removeValidation(idx: number) {
    set('validations', request.validations.filter((_, i) => i !== idx))
  }

  function addValidation() {
    set('validations', [...request.validations, makeValidation('status_equals')])
  }

  async function handleSave(target: Collection) {
    setSaveModal(false)
    await onSave(target)
  }

  async function handleCreateNew() {
    const name = newCollectionName.trim()
    if (!name) return
    setSaveModal(false)
    setNewCollectionName('')
    await onCreateNew(name)
  }

  const methodColor = METHOD_COLORS[request.method.toUpperCase()] ?? ''

  return (
    <>
      <div className="request-bar">
        <select
          id="method"
          aria-label="Método HTTP"
          value={request.method}
          style={methodColor ? { color: methodColor, borderColor: methodColor } : undefined}
          onChange={(e) => set('method', e.target.value)}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          id="url"
          placeholder="https://api.example.com/recurso"
          spellCheck={false}
          aria-label="URL"
          value={request.url}
          onChange={(e) => set('url', e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSend() }}
        />
        <button id="send" className="primary" disabled={sending} onClick={onSend}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
        <button id="save" onClick={() => setSaveModal(true)}>Guardar</button>
      </div>
      <div className="request-bar sub">
        <input
          id="req-name"
          placeholder="Nombre de la solicitud"
          spellCheck={false}
          aria-label="Nombre de la solicitud"
          value={request.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <label className="inline">
          <input
            id="follow-redirects"
            type="checkbox"
            checked={request.followRedirects}
            onChange={(e) => set('followRedirects', e.target.checked)}
          /> Seguir redirects
        </label>
        <label className="inline">
          Timeout{' '}
          <input
            id="timeout"
            type="number"
            value={request.timeoutSecs}
            min={1}
            aria-label="Timeout en segundos"
            onChange={(e) => set('timeoutSecs', parseInt(e.target.value, 10) || 30)}
          /> s
        </label>
      </div>

      <nav className="tabs" aria-label="Configuración de la solicitud">
        {(['query', 'headers', 'body', 'validations'] as const).map((t) => (
          <button key={t} data-tab={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'query' ? 'Query' : t === 'validations' ? 'Validaciones' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'query' && (
        <div id="tab-query" className="tab active">
          <div className="kv-list" id="query-list">
            {request.query.map((kv, i) => (
              <div className="kv-row" key={i}>
                <input type="checkbox" className="enabled" checked={kv.enabled} onChange={(e) => updateKv('query', i, { enabled: e.target.checked })} title="Habilitar" />
                <input className="key" placeholder="clave" value={kv.key} spellCheck={false} onChange={(e) => updateKv('query', i, { key: e.target.value })} />
                <input className="value" placeholder="valor" value={kv.value} spellCheck={false} onChange={(e) => updateKv('query', i, { value: e.target.value })} />
                <button className="del" title="Quitar" onClick={() => removeKv('query', i)}>×</button>
              </div>
            ))}
          </div>
          <button className="add-row" onClick={() => addKv('query')}>+ Agregar</button>
        </div>
      )}

      {tab === 'headers' && (
        <div id="tab-headers" className="tab">
          <div className="kv-list" id="headers-list">
            {request.headers.map((kv, i) => (
              <div className="kv-row" key={i}>
                <input type="checkbox" className="enabled" checked={kv.enabled} onChange={(e) => updateKv('headers', i, { enabled: e.target.checked })} title="Habilitar" />
                <input className="key" placeholder="Clave" value={kv.key} spellCheck={false} onChange={(e) => updateKv('headers', i, { key: e.target.value })} />
                <input className="value" placeholder="Valor" value={kv.value} spellCheck={false} onChange={(e) => updateKv('headers', i, { value: e.target.value })} />
                <button className="del" title="Quitar" onClick={() => removeKv('headers', i)}>×</button>
              </div>
            ))}
          </div>
          <button className="add-row" onClick={() => addKv('headers')}>+ Agregar</button>
        </div>
      )}

      {tab === 'body' && (
        <div id="tab-body" className="tab">
          <div className="body-toolbar">
            <select
              id="body-type"
              aria-label="Tipo de body"
              value={request.body.type}
              onChange={(e) => switchBodyType(e.target.value as Request['body']['type'])}
            >
              <option value="none">Sin cuerpo</option>
              <option value="raw">Raw</option>
              <option value="urlencoded">Urlencoded</option>
            </select>
          </div>
          {request.body.type === 'raw' && (
            <JsonEditor
              value={request.body.content}
              onChange={updateRawBody}
              placeholder='{"clave": "valor"}'
              ariaLabel="Body raw"
            />
          )}
          {request.body.type === 'urlencoded' && (
            <div className="kv-list" id="urlencoded-list">
              {request.body.fields.map((kv, i) => (
                <div className="kv-row" key={i}>
                  <input type="checkbox" className="enabled" checked={kv.enabled} onChange={(e) => updateUrlEncoded(i, { enabled: e.target.checked })} title="Habilitar" />
                  <input className="key" placeholder="clave" value={kv.key} spellCheck={false} onChange={(e) => updateUrlEncoded(i, { key: e.target.value })} />
                  <input className="value" placeholder="valor" value={kv.value} spellCheck={false} onChange={(e) => updateUrlEncoded(i, { value: e.target.value })} />
                  <button className="del" title="Quitar" onClick={() => removeUrlEncoded(i)}>×</button>
                </div>
              ))}
              <button className="add-row" onClick={addUrlEncoded}>+ Agregar</button>
            </div>
          )}
        </div>
      )}

      {tab === 'validations' && (
        <div id="tab-validations" className="tab">
          <div id="validation-list">
            {request.validations.map((v, i) => {
              const fields = kindFields(v.kind)
              return (
                <div className="validation-row" key={i}>
                  <select
                    value={v.kind}
                    onChange={(e) => changeValidationKind(i, e.target.value as Validation['kind'])}
                  >
                    {VALIDATION_KINDS.map((k) => (
                      <option key={k.kind} value={k.kind}>{k.label}</option>
                    ))}
                  </select>
                  {fields.map((f) => (
                    <input
                      key={f.name}
                      className={`v-${f.name}`}
                      type={f.type}
                      placeholder={f.placeholder}
                      value={validationValue(v, f.name)}
                      onChange={(e) => {
                        const raw = e.target.value
                        const value = f.type === 'number'
                          ? (raw === '' ? 0 : Number(raw))
                          : raw
                        updateValidation(i, { [f.name]: value })
                      }}
                    />
                  ))}
                  <button className="del" title="Quitar" onClick={() => removeValidation(i)}>×</button>
                </div>
              )
            })}
          </div>
          <button id="add-validation" onClick={addValidation}>+ Agregar validación</button>
        </div>
      )}

      {saveModal && (
        <div id="save-modal" className="modal" onClick={(e) => { if (e.target === e.currentTarget) setSaveModal(false) }}>
          <div className="modal-box" role="dialog" aria-modal="true">
            <h2>Guardar en colección</h2>
            <p className="modal-req-name">{request.name || 'Sin nombre'} — {request.method} {request.url}</p>
            <div id="save-collection-list">
              {collections.length === 0 && <p className="empty-hint-modal">Aún no hay colecciones. Creá una abajo.</p>}
              {collections.map((c) => (
                <div
                  className="save-collection-item"
                  key={c.name}
                  onClick={() => void handleSave(c)}
                >
                  <span className="icon">▸</span>
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
            <div className="modal-new">
              <input
                id="new-collection-name"
                placeholder="O crear una nueva colección…"
                spellCheck={false}
                aria-label="Nombre de la nueva colección"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateNew() } }}
              />
              <button onClick={() => void handleCreateNew()}>Crear y guardar</button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setSaveModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
