import { useState } from 'react'
import type { Collection } from '../types'

interface Props {
  testLabel: string
  collections: Collection[]
  origin: string
  onSave: (collection: string) => void
  onClose: () => void
}

export function SaveTestModal({ testLabel, collections, origin, onSave, onClose }: Props) {
  const [newName, setNewName] = useState('')

  function createAndSave() {
    const name = newName.trim()
    if (!name) return
    onSave(name)
  }

  return (
    <div id="save-test-modal" className="modal" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="save-test-modal-title">
        <h2 id="save-test-modal-title">Guardar test en colección</h2>
        <p className="modal-req-name" id="save-test-test-name">{testLabel}</p>
        <div id="save-test-collection-list">
          {collections.length === 0 && (
            <p className="empty-hint-modal">Aún no hay colecciones. Creá una abajo.</p>
          )}
          {collections.map((c) => {
            const isOrigin = c.name === origin
            return (
              <div
                className={`save-collection-item${isOrigin ? ' current' : ''}`}
                key={c.name}
                onClick={() => { onSave(c.name) }}
              >
                <span className="icon">▸</span>
                <span>{c.name}</span>
                {isOrigin && <span className="tag">origen</span>}
              </div>
            )
          })}
        </div>
        <div className="modal-new">
          <input
            id="save-test-new-name"
            placeholder="O crear una nueva colección…"
            spellCheck={false}
            aria-label="Nombre de la nueva colección"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createAndSave() } }}
          />
          <button id="save-test-create" onClick={createAndSave}>Crear y guardar</button>
        </div>
        <div className="modal-actions">
          <button id="save-test-cancel" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
