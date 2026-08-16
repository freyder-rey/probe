import type { Collection, TestDraft } from '../types'

interface Props {
  collections: Collection[]
  draft: TestDraft
  onChange: (d: TestDraft) => void
  onRun: () => void
  onSave: () => void
}

export function TestEditor({ collections, draft, onChange, onRun, onSave }: Props) {
  const source = collections.find((c) => c.name === draft.collection)
  const requests = source?.requests ?? []
  const checked = draft.requestNames.filter((n) => requests.some((r) => r.name === n)).length

  function set<K extends keyof TestDraft>(key: K, value: TestDraft[K]) {
    onChange({ ...draft, [key]: value })
  }

  function toggleRequest(name: string, nextChecked: boolean) {
    const names = nextChecked
      ? [...draft.requestNames, name]
      : draft.requestNames.filter((n) => n !== name)
    set('requestNames', names)
  }

  return (
    <div id="test-editor">
      <h2 className="panel-title">Test de carga</h2>

      <label className="field">Nombre
        <input
          id="test-name"
          spellCheck={false}
          placeholder="mi test"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>

      <label className="field">Colección de origen
        <select
          id="test-collection"
          aria-label="Colección de origen"
          value={draft.collection}
          onChange={(e) => set('collection', e.target.value)}
        >
          <option value="">— Elegí una colección —</option>
          {collections.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </label>

      <fieldset className="field">
        <legend>Solicitudes del flujo</legend>
        <label className="test-all-row">
          <input
            id="test-all"
            type="checkbox"
            checked={draft.all}
            onChange={(e) => set('all', e.target.checked)}
          />
          <span>Todas las solicitudes</span>
          <span className="test-req-count" id="test-req-count">
            {draft.all ? 'todas' : `${checked} de ${requests.length}`}
          </span>
        </label>
        <div id="test-request-list">
          {requests.length === 0 && (
            <p className="empty-hint-modal">Esta colección todavía no tiene solicitudes.</p>
          )}
          {requests.map((r) => {
            const on = draft.all || draft.requestNames.includes(r.name)
            return (
              <div
                className="test-req-row"
                key={r.name}
                title={r.url || r.name}
                onClick={() => {
                  if (draft.all) {
                    set('all', false)
                    set('requestNames', [r.name])
                  } else {
                    toggleRequest(r.name, !on)
                  }
                }}
              >
                <input
                  type="checkbox"
                  className="test-req-cb"
                  checked={on}
                  readOnly
                />
                <span className={`method ${r.method.toLowerCase()}`}>{r.method}</span>
                <span className="req-name">{r.name}</span>
              </div>
            )
          })}
        </div>
      </fieldset>

      <div className="test-fields">
        <label className="field">Iteraciones
          <input
            id="test-iterations"
            type="number"
            value={draft.iterations}
            min={1}
            onChange={(e) => set('iterations', parseInt(e.target.value, 10) || 1)}
          />
        </label>
        <label className="field">Delay (ms)
          <input
            id="test-delay"
            type="number"
            value={draft.delayMs}
            min={0}
            onChange={(e) => set('delayMs', parseInt(e.target.value, 10) || 0)}
          />
        </label>
      </div>

      <label className="field">CSV (ruta local)
        <input
          id="test-csv"
          placeholder="~/datos.csv"
          spellCheck={false}
          value={draft.csv}
          onChange={(e) => set('csv', e.target.value)}
        />
      </label>

      <div className="test-actions">
        <button id="test-run" className="primary" onClick={onRun}>▶ Ejecutar</button>
        <button id="test-save" onClick={onSave}>Guardar en colección…</button>
      </div>
    </div>
  )
}
