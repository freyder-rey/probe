import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Collection, LoadTest, Request, RunStatus } from '../types'
import { newRequest } from '../types'

interface Props {
  collections: Collection[]
  onSelect: (r: Request) => void
  onRefresh: () => Promise<void>
  onToast: (msg: string, ok?: boolean) => void
  onNewTest: () => void
  onEditTest: (collectionName: string, test: LoadTest) => void
  onRunTest: (collectionName: string, testName: string) => void
  onShowReport: (collectionName: string, test: LoadTest) => void
}

function TestItem({
  collectionName,
  test,
  onEdit,
  onRun,
  onShowReport,
}: {
  collectionName: string
  test: LoadTest
  onEdit: (test: LoadTest) => void
  onRun: () => void
  onShowReport: (test: LoadTest) => void
}) {
  const [status, setStatus] = useState<RunStatus | null>(null)

  useEffect(() => {
    let alive = true
    api.testStatus(collectionName, test.name)
      .then((s) => { if (alive) setStatus(s) })
      .catch(() => {})
    return () => { alive = false }
  }, [collectionName, test.name])

  const running = status?.status === 'running'
  const hasReport = !running && status && (status.report !== null || status.error !== null)

  return (
    <div className="test-item" data-name={test.name}>
      <button className="run" title={running ? 'Detener' : 'Ejecutar'} onClick={onRun}>
        {running ? '■' : '▶'}
      </button>
      <button className="name" title="Editar" onClick={() => onEdit(test)}>{test.name}</button>
      <span className="status">
        {running ? (status.total ? `${status.done}/${status.total}` : '…') : (status ? status.status : '')}
      </span>
      {hasReport && (
        <button className="report-link" onClick={() => onShowReport(test)}>Ver reporte</button>
      )}
    </div>
  )
}

export function Sidebar({
  collections, onSelect, onRefresh, onToast, onNewTest, onEditTest, onRunTest, onShowReport,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeRequest, setActiveRequest] = useState<string | null>(null)

  async function toggle(collection: Collection) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(collection.name)) next.delete(collection.name)
      else next.add(collection.name)
      return next
    })
  }

  async function handleDelete(name: string) {
    if (!confirm(`¿Eliminar la colección "${name}"?`)) return
    await api.deleteCollection(name)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
    onToast(`Colección «${name}» eliminada.`)
    await onRefresh()
  }

  async function handleExportMarkdown(name: string) {
    try {
      const md = await api.collectionMarkdown(name)
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.md`
      a.click()
      URL.revokeObjectURL(url)
      onToast(`«${name}.md» descargado.`)
    } catch (err) {
      onToast('Error al exportar: ' + (err as Error).message, false)
    }
  }

  async function handleNewCollection() {
    const name = prompt('Nombre de la colección:')
    if (!name || !name.trim()) return
    const collection: Collection = { name: name.trim(), version: '1', requests: [], tests: [] }
    await api.saveCollection(collection)
    await onRefresh()
    setExpanded((prev) => new Set(prev).add(collection.name))
    onToast(`Colección «${collection.name}» creada.`)
  }

  function selectRequest(r: Request) {
    setActiveRequest(r.name)
    onSelect({ ...r, body: r.body ?? { type: 'none' } })
  }

  function handleNewRequest() {
    setActiveRequest(null)
    onSelect(newRequest())
  }

  return (
    <aside id="sidebar">
      <h1>⚡🅿🆁🅾🅱🅴</h1>
      <div className="sidebar-actions">
        <button onClick={handleNewCollection} title="Crear colección vacía">+ Colección</button>
        <button onClick={handleNewRequest} title="Nueva solicitud en el editor">+ Solicitud</button>
        <button onClick={onNewTest} title="Nuevo test en el editor">+ Test</button>
      </div>
      <div id="collection-list">
        {collections.map((c) => {
          const isOpen = expanded.has(c.name)
          return (
            <div className="collection" key={c.name}>
              <div className="collection-head" onClick={() => void toggle(c)}>
                <span className="name">{c.name}</span>
                <span className="count">{c.requests.length} req</span>
                <button
                  className="md"
                  title="Exportar a Markdown"
                  onClick={(e) => { e.stopPropagation(); void handleExportMarkdown(c.name) }}
                >
                  md
                </button>
                <button className="del" title="Eliminar" onClick={(e) => { e.stopPropagation(); void handleDelete(c.name) }}>×</button>
              </div>
              {isOpen && (
                <>
                  <div className="requests" style={{ display: 'block' }}>
                    {c.requests.length === 0 && <div className="request-item">(sin solicitudes)</div>}
                    {c.requests.map((r) => (
                      <div
                        className={`request-item${activeRequest === r.name ? ' active' : ''}`}
                        key={r.id ?? r.name}
                        onClick={() => selectRequest(r)}
                      >
                        <span className={`method ${r.method.toLowerCase()}`}>{r.method}</span> {r.name}
                      </div>
                    ))}
                  </div>
                  <div className="tests">
                    <div className="tests-head">
                      <span>Tests</span>
                      <button className="add-test" onClick={() => onNewTest()}>+ Nuevo test</button>
                    </div>
                    {c.tests.length === 0 && <div className="test-item">(sin tests)</div>}
                    {c.tests.map((t) => (
                      <TestItem
                        key={t.name}
                        collectionName={c.name}
                        test={t}
                        onEdit={(test) => onEditTest(c.name, test)}
                        onRun={() => onRunTest(c.name, t.name)}
                        onShowReport={(test) => onShowReport(c.name, test)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      {collections.length === 0 && (
        <p id="sidebar-empty" className="empty-hint">
          Aún no hay colecciones.<br />Creá una para empezar.
        </p>
      )}
    </aside>
  )
}
