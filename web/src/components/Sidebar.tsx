import { useState } from 'react'
import { api } from '../api'
import type { Collection, Request } from '../types'
import { newRequest } from '../types'

interface Props {
  collections: Collection[]
  onSelect: (r: Request) => void
  onRefresh: () => Promise<void>
  onToast: (msg: string, ok?: boolean) => void
}

export function Sidebar({ collections, onSelect, onRefresh, onToast }: Props) {
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
      </div>
      <div id="collection-list">
        {collections.map((c) => {
          const isOpen = expanded.has(c.name)
          return (
            <div className="collection" key={c.name}>
              <div className="collection-head" onClick={() => void toggle(c)}>
                <span className="name">{c.name}</span>
                <span className="count">{c.requests.length} req</span>
                <button className="del" title="Eliminar" onClick={(e) => { e.stopPropagation(); void handleDelete(c.name) }}>×</button>
              </div>
              {isOpen && (
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
