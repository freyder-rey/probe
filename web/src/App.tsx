import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { Sidebar } from './components/Sidebar'
import { RequestEditor } from './components/RequestEditor'
import { ResponsePanel } from './components/ResponsePanel'
import { TestEditor } from './components/TestEditor'
import { TestPanel } from './components/TestPanel'
import { SaveTestModal } from './components/SaveTestModal'
import type { Collection, LoadTest, Request, Response, RunStatus, TestDraft } from './types'
import { draftToLoadTest, newRequest, newTestDraft } from './types'

type Mode = 'request' | 'test'

export default function App() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [request, setRequest] = useState<Request>(newRequest)
  const [response, setResponse] = useState<Response | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [toastOk, setToastOk] = useState(true)

  const [mode, setMode] = useState<Mode>('request')
  const [draft, setDraft] = useState<TestDraft>(newTestDraft)
  const [runKey, setRunKey] = useState<{ collection: string; test: string } | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const [runTitle, setRunTitle] = useState('')
  const [saveTestOpen, setSaveTestOpen] = useState(false)
  const pollRef = useRef<number | null>(null)

  function notify(msg: string, ok = true) {
    setToastOk(ok)
    setToast(msg)
  }

  const refreshCollections = useCallback(async () => {
    const summaries = await api.listCollections()
    const collections = await Promise.all(
      summaries.map((s) => api.loadCollection(s.name).catch(() => null)),
    )
    setCollections(collections.filter((c): c is Collection => c !== null))
  }, [])

  useEffect(() => {
    void refreshCollections()
  }, [refreshCollections])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(t)
  }, [toast])

  async function loadCollection(name: string): Promise<Collection> {
    return api.loadCollection(name)
  }

  async function upsertTest(collectionName: string, test: LoadTest): Promise<boolean> {
    try {
      const collection = await loadCollection(collectionName)
      const idx = collection.tests.findIndex((t) => t.name === test.name)
      if (idx >= 0) collection.tests[idx] = test
      else collection.tests.push(test)
      await api.saveCollection(collection)
      await refreshCollections()
      return true
    } catch (err) {
      notify('Error al guardar el test: ' + (err as Error).message, false)
      return false
    }
  }

  async function startTest(collectionName: string, testName: string) {
    try {
      const status = await api.startTest(collectionName, testName)
      setRunKey({ collection: collectionName, test: testName })
      setRunTitle(`Test «${testName}» — ${collectionName}`)
      setRunStatus(status)
    } catch (err) {
      notify('No se pudo iniciar el test: ' + (err as Error).message, false)
    }
  }

  function stopTest() {
    if (!runKey) return
    void api.stopTest(runKey.collection, runKey.test)
  }

  useEffect(() => {
    if (!runKey) return
    clearInterval(pollRef.current ?? undefined)
    const { collection, test } = runKey
    pollRef.current = window.setInterval(async () => {
      try {
        const status = await api.testStatus(collection, test)
        setRunStatus(status)
        if (status.status !== 'running') {
          clearInterval(pollRef.current ?? undefined)
          pollRef.current = null
          await refreshCollections()
        }
      } catch {
        clearInterval(pollRef.current ?? undefined)
        pollRef.current = null
      }
    }, 400)
    return () => {
      clearInterval(pollRef.current ?? undefined)
      pollRef.current = null
    }
  }, [runKey, refreshCollections])

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
    notify(`Guardada «${request.name}» en «${saved.name}».`)
  }

  async function handleRunTest() {
    const test = draftToLoadTest(draft)
    if (!test.name) { notify('El nombre del test es obligatorio.', false); return }
    if (!draft.collection) { notify('Elegí una colección de origen.', false); return }
    if (!draft.all && draft.requestNames.length === 0) {
      notify('Seleccioná al menos una solicitud para el test.', false)
      return
    }
    const ok = await upsertTest(draft.collection, test)
    if (!ok) return
    setMode('test')
    await startTest(draft.collection, test.name)
  }

  async function handleSaveTest(collectionName: string) {
    const test = draftToLoadTest(draft)
    setSaveTestOpen(false)
    if (collectionName === draft.collection) {
      if (await upsertTest(collectionName, test)) {
        notify(`Test «${test.name}» guardado en «${collectionName}».`)
      }
      return
    }
    const isNew = !collections.some((c) => c.name === collectionName)
    if (isNew) {
      try {
        const collection: Collection = { name: collectionName, version: '1', requests: [], tests: [test] }
        await api.saveCollection(collection)
        await refreshCollections()
        notify(`Test «${test.name}» guardado en «${collectionName}».`)
      } catch (err) {
        notify('Error al guardar: ' + (err as Error).message, false)
      }
      return
    }
    if (await upsertTest(collectionName, test)) {
      notify(`Test «${test.name}» guardado en «${collectionName}».`)
    }
  }

  function selectRequest(r: Request) {
    setMode('request')
    setRequest({ ...r, body: r.body ?? { type: 'none' } })
  }

  function newTest(collectionName = '') {
    setMode('test')
    setDraft({ ...newTestDraft(), collection: collectionName })
    setRunKey(null)
    setRunStatus(null)
  }

  function editTest(collectionName: string, test: LoadTest) {
    setMode('test')
    setDraft({
      name: test.name,
      collection: collectionName,
      all: test.requestNames.length === 0,
      requestNames: test.requestNames,
      iterations: test.iterations,
      delayMs: test.delayMs,
      csv: test.csv && test.csv.type === 'path' ? test.csv.path : '',
    })
    setRunKey(null)
    setRunStatus(null)
  }

  function showReport(collectionName: string, test: LoadTest) {
    editTest(collectionName, test)
    setRunKey({ collection: collectionName, test: test.name })
    setRunTitle(`Test «${test.name}» — ${collectionName}`)
    void api.testStatus(collectionName, test.name).then(setRunStatus).catch(() => setRunStatus(null))
  }

  return (
    <div className="app">
      <Sidebar
        collections={collections}
        onSelect={selectRequest}
        onRefresh={refreshCollections}
        onToast={notify}
        onNewTest={() => newTest()}
        onEditTest={editTest}
        onRunTest={(collectionName, testName) => { setMode('test'); void startTest(collectionName, testName) }}
        onShowReport={showReport}
      />
      <main>
        <section id="editor" aria-label="Editor de solicitud y tests">
          <div id="mode-switch">
            <button data-mode="request" className={mode === 'request' ? 'active' : ''} onClick={() => setMode('request')}>Solicitud</button>
            <button data-mode="test" className={mode === 'test' ? 'active' : ''} onClick={() => setMode('test')}>Test</button>
          </div>

          {mode === 'request' ? (
            <RequestEditor
              request={request}
              onChange={setRequest}
              collections={collections}
              onSend={handleSend}
              onSave={handleSave}
              sending={sending}
            />
          ) : (
            <TestEditor
              collections={collections}
              draft={draft}
              onChange={setDraft}
              onRun={handleRunTest}
              onSave={() => setSaveTestOpen(true)}
            />
          )}
        </section>

        <div id="splitter" role="separator" aria-orientation="vertical" />

        <section id="response" aria-label="Respuesta">
          {mode === 'request' ? (
            <ResponsePanel response={response} error={error} />
          ) : runKey ? (
            <TestPanel
              title={runTitle}
              status={runStatus}
              onStop={stopTest}
              onRunAgain={() => { if (runKey) void startTest(runKey.collection, runKey.test) }}
            />
          ) : (
            <div className="resp-empty">
              <p>Configurá un test y ejecutalo para ver el reporte.</p>
            </div>
          )}
        </section>
      </main>

      {saveTestOpen && (
        <SaveTestModal
          testLabel={`«${draft.name || 'Sin nombre'}» — ${draft.iterations} iteración(es), ${draft.all ? 'todas las solicitudes' : `${draft.requestNames.length} solicitud(es)`}`}
          collections={collections}
          origin={draft.collection}
          onSave={handleSaveTest}
          onClose={() => setSaveTestOpen(false)}
        />
      )}

      <div id="toast" className={`toast ${toast ? '' : 'hidden'}${toastOk ? '' : ' error'}`} role="status">
        {toast}
      </div>
    </div>
  )
}
