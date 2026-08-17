// Cliente tipado para la API de probe-server.
import type { Collection, CollectionSummary, Request, RunStatus } from './types'

type ApiResponse = import('./types').Response

async function json<T>(res: globalThis.Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<T>
}

export const api = {
  async execute(request: Request): Promise<ApiResponse> {
    const res = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    })
    const data = await json<{ response: ApiResponse }>(res)
    return data.response
  },

  async listCollections(): Promise<CollectionSummary[]> {
    const res = await fetch('/api/collections')
    return json<CollectionSummary[]>(res)
  },

  async loadCollection(name: string): Promise<Collection> {
    const res = await fetch(`/api/collections/${encodeURIComponent(name)}`)
    return json<Collection>(res)
  },

  async saveCollection(collection: Collection): Promise<Collection> {
    const res = await fetch('/api/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    })
    return json<Collection>(res)
  },

  async deleteCollection(name: string): Promise<void> {
    const res = await fetch(`/api/collections/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
  },

  async collectionMarkdown(name: string): Promise<string> {
    const res = await fetch(`/api/collections/${encodeURIComponent(name)}/markdown`)
    if (!res.ok) throw new Error(await res.text())
    return res.text()
  },

  async startTest(collection: string, test: string): Promise<RunStatus> {
    const res = await fetch(
      `/api/tests/${encodeURIComponent(collection)}/${encodeURIComponent(test)}/start`,
      { method: 'POST' },
    )
    return json<RunStatus>(res)
  },

  async testStatus(collection: string, test: string): Promise<RunStatus> {
    const res = await fetch(
      `/api/tests/${encodeURIComponent(collection)}/${encodeURIComponent(test)}/status`,
    )
    return json<RunStatus>(res)
  },

  async stopTest(collection: string, test: string): Promise<void> {
    await fetch(
      `/api/tests/${encodeURIComponent(collection)}/${encodeURIComponent(test)}/stop`,
      { method: 'POST' },
    )
  },

  async uploadCsv(name: string, content: string): Promise<{ path: string; columns: string[] }> {
    const res = await fetch('/api/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    })
    return json<{ path: string; columns: string[] }>(res)
  },
}
