import { useEffect, useRef, useState } from 'react'
import type { LoadTestReport, RunEvent, RunStatus } from '../types'

interface Props {
  title: string
  status: RunStatus | null
  onStop: () => void
  onRunAgain: () => void
}

function renderReport(r: LoadTestReport) {
  const pass = r.failed === 0
  return (
    <>
      <p className={`report-result ${pass ? 'pass' : 'fail'}`}>
        {pass ? 'PASÓ' : 'FALLÓ'} — {r.totalRequests} solicitudes · {r.success} OK · {r.failed} fallidas
      </p>
      <p className="report-detail">
        Duración: {r.durationMs} ms · promedio {r.avgMs} ms · p95 {r.p95Ms} ms
      </p>
      {r.perRequest.length > 0 && (
        <table className="report-table">
          <thead>
            <tr><th>Solicitud</th><th>Total</th><th>OK</th><th>Fallidas</th></tr>
          </thead>
          <tbody>
            {r.perRequest.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td><td>{s.total}</td><td>{s.success}</td><td>{s.failed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.errors.length > 0 && (
        <>
          <p className="report-detail">Errores:</p>
          <ul className="report-errors">
            {r.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </>
      )}
    </>
  )
}

function renderEvent(e: RunEvent) {
  const label = e.status != null ? `Status ${e.status}` : 'error de red'
  const detail = e.error ?? `${e.durationMs} ms`
  return (
    <li className={`log-row ${e.ok ? 'ok' : 'fail'}`} key={`${e.request}-${e.iteration}`}>
      <span className="log-iter">#{e.iteration}</span>
      {e.csvRow != null && <span className="log-csv">CSV#{e.csvRow + 1}</span>}
      <span className="log-req">{e.request}</span>
      <span className="log-status">{label}</span>
      <span className="log-detail">{detail}</span>
    </li>
  )
}

function renderLog(log: RunEvent[]) {
  if (log.length === 0) return null
  return (
    <>
      <p className="report-detail">Ejecuciones:</p>
      <ul className="report-log" data-testid="test-panel-log">
        {log.map(renderEvent)}
      </ul>
    </>
  )
}

export function TestPanel({ title, status, onStop, onRunAgain }: Props) {
  const running = status?.status === 'running'
  const prevStatus = useRef<string | null>(null)
  const [log, setLog] = useState<RunEvent[]>([])

  useEffect(() => {
    if (!status) {
      prevStatus.current = null
      setLog([])
      return
    }
    if (status.status === 'running' && prevStatus.current !== 'running') {
      setLog([])
    }
    prevStatus.current = status.status
    if (status.lastEvent) {
      const e = status.lastEvent
      setLog((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.request === e.request && last.iteration === e.iteration && last.durationMs === e.durationMs) {
          return prev
        }
        return [...prev, e]
      })
    }
  }, [status])

  return (
    <div id="test-panel">
      <h2 className="panel-title" id="test-panel-title">{title}</h2>
      <div className="test-panel-actions">
        {!running && status && (
          <button id="test-panel-run" className="primary" onClick={onRunAgain}>▶ Ejecutar de nuevo</button>
        )}
        {running && (
          <button id="test-panel-stop" onClick={onStop}>■ Detener</button>
        )}
      </div>
      <div id="test-panel-status">
        {running && (
          <>
            <span className="report-status running">en ejecución</span>
            <span className="run-count">{status.done}/{status.total || '…'}</span>
            {status.currentRequest && (
              <span className="run-current" id="test-panel-current">Ejecutando: {status.currentRequest}</span>
            )}
          </>
        )}
      </div>
      {running && (
        <>
          <div className="progress" id="test-panel-progress">
            <div
              className="bar"
              style={{ width: `${status.total ? Math.round((status.done / status.total) * 100) : 0}%` }}
            />
          </div>
          {renderLog(log)}
          {status.perRequest.length > 0 && (
            <table className="report-table live" data-testid="test-panel-live-table" id="test-panel-live-table">
              <thead>
                <tr><th>Solicitud</th><th>Total</th><th>OK</th><th>Fallidas</th></tr>
              </thead>
              <tbody>
                {status.perRequest.map((s) => (
                  <tr key={s.name} className={status.currentRequest === s.name ? 'running-row' : ''}>
                    <td>{s.name}</td><td>{s.total}</td><td>{s.success}</td><td>{s.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {!running && status && (
        <div id="test-panel-report">
          <p className={`report-status ${status.status}`}>{status.status}</p>
          {status.error && <p className="report-error">{status.error}</p>}
          {status.report && renderReport(status.report)}
          {renderLog(log)}
        </div>
      )}
    </div>
  )
}
