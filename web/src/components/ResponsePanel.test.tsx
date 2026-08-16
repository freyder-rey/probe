import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResponsePanel } from './ResponsePanel'
import type { Response } from '../types'

const response: Response = {
  status: 200,
  statusText: 'OK',
  httpVersion: 'HTTP/1.1',
  headers: [['content-type', 'application/json']],
  body: '{"a":1}',
  durationMs: 42,
  url: 'https://httpbin.org/get',
  validationResults: [
    { name: 'Es 200', passed: true, detail: '200 == 200' },
    { name: 'Es JSON', passed: false, detail: 'no content-type' },
  ],
}

describe('ResponsePanel', () => {
  it('muestra el estado y el resumen de validaciones', () => {
    render(<ResponsePanel response={response} error="" />)
    expect(screen.getByText(/200 OK/)).toBeInTheDocument()
    expect(screen.getByText(/42 ms · HTTP\/1.1/)).toBeInTheDocument()
    expect(screen.getByText(/✓ 1\/2 validaciones/)).toBeInTheDocument()
  })

  it('muestra el cuerpo con formato JSON', () => {
    render(<ResponsePanel response={response} error="" />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('muestra los headers en su pestaña', async () => {
    const user = userEvent.setup()
    render(<ResponsePanel response={response} error="" />)
    await user.click(screen.getByText('Headers'))
    expect(screen.getByText(/content-type: application\/json/)).toBeInTheDocument()
  })

  it('muestra las validaciones con su resultado', async () => {
    const user = userEvent.setup()
    render(<ResponsePanel response={response} error="" />)
    await user.click(screen.getByText('Validaciones'))
    expect(screen.getByText('Es 200')).toBeInTheDocument()
    expect(screen.getByText('Es JSON')).toBeInTheDocument()
    expect(screen.getByText('— 200 == 200')).toBeInTheDocument()
  })

  it('muestra el error cuando la solicitud falló', () => {
    render(<ResponsePanel response={null} error="No se pudo conectar" />)
    expect(screen.getByText('No se pudo conectar')).toBeInTheDocument()
  })

  it('invita a enviar una solicitud cuando no hay respuesta', () => {
    render(<ResponsePanel response={null} error="" />)
    expect(screen.getByText('Envía una solicitud para ver la respuesta.')).toBeInTheDocument()
  })
})
