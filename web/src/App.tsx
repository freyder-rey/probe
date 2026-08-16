import { useEffect, useState } from 'react'
import { api } from './api'
import { Sidebar } from './components/Sidebar'
import { RequestEditor } from './components/RequestEditor'
import { ResponsePanel } from './components/ResponsePanel'
import type { Collection, Request, Response } from './types'
import { newRequest } from './types'

export default function App() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [request, setRequest] = useState<Request>(newRequest)
  const [response, setResponse] = useState<Response | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    void refreshCollections()
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  async function refreshCollections() {
    const summaries = await api.listCollections()
    const collections = await Promise.all(
      summaries.map((s) => api.loadCollection(s.name).catch(() => null)),
    )
    setCollections(collections.filter((c): c is Collection => c !== null))
  }

  async function handleSend() {
    if (!request.url) {
      setError('Falta la URL.')
      setResponse(null)
      return
    }
    setSending(true)
    setError('')
    try {
      const resp = await api.execute(request)
      setResponse(resp)
    } catch (err) {
      setError('Error: ' + (err as Error).message)
      setResponse(null)
    } finally {
      setSending(false)
    }
  }

  async function handleSave(target: Collection) {
    const idx = target.requests.findIndex((r) => r.name === request.name)
    if (idx >= 0) target.requests[idx] = request
    else target.requests.push(request)
    const saved = await api.saveCollection(target)
    await refreshCollections()
    setToast(`Guardada «${request.name}» en «${saved.name}».`)
  }

  return (
    <div className="app">
      <Sidebar
        collections={collections}
        onSelect={setRequest}
        onRefresh={refreshCollections}
        onToast={setToast}
      />
      <main>
        <RequestEditor
          request={request}
          onChange={setRequest}
          collections={collections}
          onSend={handleSend}
          onSave={handleSave}
          sending={sending}
        />
        <div id="splitter" role="separator" aria-orientation="vertical" />
        <ResponsePanel response={response} error={error} />
      </main>
      <div id="toast" className={`toast ${toast ? '' : 'hidden'}`} role="status">
        {toast}
      </div>
    </div>
  )
}
