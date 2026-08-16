import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Collection } from './types'

vi.mock('./api', () => ({
  api: {
    listCollections: vi.fn(),
    loadCollection: vi.fn(),
    saveCollection: vi.fn(),
    deleteCollection: vi.fn(),
    execute: vi.fn(),
    startTest: vi.fn(),
    testStatus: vi.fn(),
    stopTest: vi.fn(),
    uploadCsv: vi.fn(),
  },
}))

import { api } from './api'

const collection: Collection = {
  name: 'demo',
  version: '1',
  requests: [
    { name: 'ping', method: 'GET', url: 'https://httpbin.org/get', query: [], headers: [], body: { type: 'none' }, timeoutSecs: 30, followRedirects: true, validations: [] },
  ],
  tests: [],
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listCollections).mockResolvedValue([{ name: 'demo', size: 1 }])
    vi.mocked(api.loadCollection).mockResolvedValue(collection)
  })

  it('carga las colecciones y las muestra en la sidebar', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('demo')).toBeInTheDocument()
    })
  })

  it('ejecuta una solicitud y muestra la respuesta', async () => {
    const user = userEvent.setup()
    vi.mocked(api.execute).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      httpVersion: 'HTTP/1.1',
      headers: [],
      body: '{"a":1}',
      durationMs: 5,
      url: 'https://httpbin.org/get',
      validationResults: [],
    })
    render(<App />)
    await waitFor(() => expect(screen.getByLabelText(/URL/)).toBeInTheDocument())
    await user.type(screen.getByLabelText(/URL/), 'https://httpbin.org/get')
    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText(/200 OK/)).toBeInTheDocument())
  })

  it('marca un error si la solicitud falla', async () => {
    const user = userEvent.setup()
    vi.mocked(api.execute).mockRejectedValue(new Error('conexión rechazada'))
    render(<App />)
    await waitFor(() => expect(screen.getByLabelText(/URL/)).toBeInTheDocument())
    await user.type(screen.getByLabelText(/URL/), 'https://httpbin.org/get')
    await user.click(screen.getByRole('button', { name: /enviar/i }))
    await waitFor(() => expect(screen.getByText(/conexión rechazada/)).toBeInTheDocument())
  })
})
