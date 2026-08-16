import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RequestEditor } from './RequestEditor'
import { newRequest, type Collection } from '../types'

function renderEditor() {
  const request = {
    ...newRequest(),
    name: 'ping',
    url: 'https://httpbin.org/get',
    headers: [{ key: 'X-Token', value: 'abc', enabled: true }],
    query: [{ key: 'page', value: '2', enabled: true }],
    body: { type: 'raw', content: '{"a":1}' },
    validations: [{ kind: 'status_equals' as const, name: 'Validación', expected: 200 }],
  }
  const collections: Collection[] = []
  render(
    <RequestEditor
      request={request}
      onChange={() => {}}
      collections={collections}
      onSend={() => {}}
      onSave={vi.fn()}
      onCreateNew={vi.fn()}
      sending={false}
    />,
  )
  return request
}

describe('RequestEditor', () => {
  it('muestra la pestaña Query por defecto', () => {
    renderEditor()
    expect(screen.getByPlaceholderText('clave')).toBeInTheDocument()
  })

  it('muestra el contenido de cada pestaña al seleccionarla', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByText('Headers'))
    expect(screen.getByPlaceholderText('Clave')).toBeInTheDocument()

    await user.click(screen.getByText('Body'))
    expect(screen.getByRole('textbox', { name: 'Body raw' })).toBeInTheDocument()

    await user.click(screen.getByText('Validaciones'))
    expect(screen.getByText('Status igual a')).toBeInTheDocument()

    await user.click(screen.getByText('Query'))
    expect(screen.getByPlaceholderText('clave')).toBeInTheDocument()
  })
})
