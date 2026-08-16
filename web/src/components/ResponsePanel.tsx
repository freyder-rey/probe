import { useState } from 'react'
import type { Response } from '../types'

interface Props {
  response: Response | null
  error: string
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

export function ResponsePanel({ response, error }: Props) {
  const [tab, setTab] = useState<'body' | 'headers' | 'validations'>('body')

  if (error) {
    return (
      <div className="resp-empty">
        <div id="resp-error">{error}</div>
      </div>
    )
  }

  if (!response) {
    return (
      <div className="resp-empty">
        <p>Envía una solicitud para ver la respuesta.</p>
      </div>
    )
  }

  const passed = response.validationResults.filter((v) => v.passed).length

  return (
    <>
      <div id="resp-summary">
        <span
          id="resp-status"
          className={response.status < 300 ? 'ok' : response.status < 400 ? 'redirect' : 'error'}
        >
          {response.status} {response.statusText}
        </span>
        <span id="resp-duration">
          {response.durationMs} ms · HTTP/{response.httpVersion.replace('HTTP/', '')}
        </span>
        {response.validationResults.length > 0 && (
          <span id="resp-vcount" className={passed === response.validationResults.length ? 'pass' : 'fail'}>
            ✓ {passed}/{response.validationResults.length} validaciones
          </span>
        )}
      </div>

      <nav className="tabs" aria-label="Vistas de la respuesta">
        {(['body', 'headers', 'validations'] as const).map((t) => (
          <button key={t} data-tab={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'body' ? 'Cuerpo' : t === 'headers' ? 'Headers' : 'Validaciones'}
          </button>
        ))}
      </nav>

      {tab === 'body' && (
        <div id="rtab-body" className="tab active">
          <pre id="resp-body">{response.body ? prettyJson(response.body) : '(sin cuerpo)'}</pre>
        </div>
      )}

      {tab === 'headers' && (
        <div id="rtab-headers" className="tab">
          {response.headers.map(([k, v], i) => (
            <div key={i}>{k}: {v}</div>
          ))}
        </div>
      )}

      {tab === 'validations' && (
        <div id="rtab-validations" className="tab">
          {response.validationResults.length === 0 && <p className="empty-hint">Sin validaciones definidas.</p>}
          {response.validationResults.map((v, i) => (
            <div className={`validation-result ${v.passed ? 'pass' : 'fail'}`} key={i}>
              <span className="mark">{v.passed ? '✓' : '✗'}</span>
              <span className="name">{v.name}</span>
              <span className="detail">— {v.detail}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
