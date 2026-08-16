import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestEditor } from './TestEditor'
import type { Collection, TestDraft } from '../types'
import { newTestDraft } from '../types'

const collection: Collection = {
  name: 'demo',
  version: '1',
  requests: [
    { name: 'ping', method: 'GET', url: 'https://httpbin.org/get', query: [], headers: [], body: { type: 'none' }, timeoutSecs: 30, followRedirects: true, validations: [] },
    { name: 'post', method: 'POST', url: 'https://httpbin.org/post', query: [], headers: [], body: { type: 'none' }, timeoutSecs: 30, followRedirects: true, validations: [] },
  ],
  tests: [],
}

function renderEditor(overrides: Partial<TestDraft> = {}) {
  const draft: TestDraft = { ...newTestDraft(), collection: 'demo', ...overrides }
  const onChange = vi.fn()
  render(
    <TestEditor
      collections={[collection]}
      draft={draft}
      onChange={onChange}
      onRun={() => {}}
      onSave={() => {}}
    />,
  )
  return { draft, onChange }
}

describe('TestEditor', () => {
  it('lista las solicitudes de la colección de origen', () => {
    renderEditor()
    expect(screen.getByText('ping')).toBeInTheDocument()
    expect(screen.getByText('post')).toBeInTheDocument()
  })

  it('marca todas como seleccionadas por defecto', () => {
    renderEditor()
    const all = screen.getByLabelText(/Todas las solicitudes/) as HTMLInputElement
    expect(all.checked).toBe(true)
    expect(screen.getByText('todas')).toBeInTheDocument()
  })

  it('al desmarcar todas y tildar una, emite el cambio en onChange', async () => {
    const user = userEvent.setup()
    const { draft, onChange } = renderEditor()
    const all = screen.getByLabelText(/Todas las solicitudes/)
    await user.click(all)
    expect(onChange).toHaveBeenCalledWith({ ...draft, all: false })

    await user.click(screen.getByText('post'))
    expect(onChange).toHaveBeenCalledWith({ ...draft, requestNames: ['post'] })
  })

  it('cambia iteraciones y delay', () => {
    const { draft, onChange } = renderEditor()
    fireEvent.change(screen.getByLabelText(/^Iteraciones/), { target: { value: '10' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...draft, iterations: 10 })

    fireEvent.change(screen.getByLabelText('Delay (ms)'), { target: { value: '250' } })
    expect(onChange).toHaveBeenLastCalledWith({ ...draft, delayMs: 250 })
  })
})
