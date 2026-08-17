import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TestPanel } from './TestPanel'
import type { LoadTestReport, RunStatus } from '../types'

const report: LoadTestReport = {
  testName: 'mi test',
  durationMs: 1200,
  totalRequests: 6,
  success: 5,
  failed: 1,
  avgMs: 200,
  p95Ms: 350,
  perRequest: [
    { name: 'ok', total: 3, success: 3, failed: 0 },
    { name: 'bad', total: 3, success: 2, failed: 1 },
  ],
  errors: ['bad: timeout'],
}

function renderPanel(status: RunStatus | null) {
  render(
    <TestPanel
      title="Test «mi test» — demo"
      status={status}
      onStop={vi.fn()}
      onRunAgain={vi.fn()}
    />,
  )
}

function status(overrides: Partial<RunStatus>): RunStatus {
  return {
    status: 'running',
    done: 0,
    total: 0,
    report: null,
    error: null,
    currentRequest: null,
    perRequest: [],
    lastEvent: null,
    ...overrides,
  }
}

describe('TestPanel', () => {
  it('muestra el progreso y la solicitud actual mientras corre', () => {
    renderPanel(status({
      status: 'running',
      done: 2,
      total: 6,
      currentRequest: 'bad',
      perRequest: [
        { name: 'ok', total: 1, success: 1, failed: 0 },
        { name: 'bad', total: 1, success: 0, failed: 1 },
      ],
    }))
    expect(screen.getByText(/en ejecución/)).toBeInTheDocument()
    expect(screen.getByText('2/6')).toBeInTheDocument()
    expect(screen.getByText('Ejecutando: bad')).toBeInTheDocument()
    expect(screen.getByText('■ Detener')).toBeInTheDocument()
    expect(screen.queryByText(/Ejecutar de nuevo/)).not.toBeInTheDocument()
  })

  it('muestra la tabla per-request en vivo mientras corre', () => {
    renderPanel(status({
      status: 'running',
      done: 2,
      total: 6,
      currentRequest: 'bad',
      perRequest: [
        { name: 'ok', total: 1, success: 1, failed: 0 },
        { name: 'bad', total: 1, success: 0, failed: 1 },
      ],
    }))
    expect(screen.getByTestId('test-panel-live-table')).toBeInTheDocument()
    expect(screen.getByText('bad')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('muestra el log en vivo con el status de cada ejecución', () => {
    const { rerender } = render(
      <TestPanel
        title="Test «mi test» — demo"
        status={status({
          status: 'running',
          done: 1,
          total: 2,
          perRequest: [{ name: 'ok', total: 1, success: 1, failed: 0 }],
          lastEvent: {
            request: 'ok',
            iteration: 1,
            csvRow: null,
            method: 'GET',
            url: 'http://localhost/ok',
            status: 200,
            ok: true,
            durationMs: 42,
            error: null,
          },
        })}
        onStop={vi.fn()}
        onRunAgain={vi.fn()}
      />,
    )
    expect(screen.getByTestId('test-panel-log')).toBeInTheDocument()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByText('42ms')).toBeInTheDocument()

    rerender(
      <TestPanel
        title="Test «mi test» — demo"
        status={status({
          status: 'running',
          done: 2,
          total: 2,
          perRequest: [
            { name: 'ok', total: 1, success: 1, failed: 0 },
            { name: 'bad', total: 1, success: 0, failed: 1 },
          ],
          lastEvent: {
            request: 'bad',
            iteration: 1,
            csvRow: null,
            method: 'POST',
            url: 'http://localhost/bad',
            status: 500,
            ok: false,
            durationMs: 120,
            error: null,
          },
        })}
        onStop={vi.fn()}
        onRunAgain={vi.fn()}
      />,
    )
    expect(screen.getByText('500')).toBeInTheDocument()
    const rows = screen.getAllByTestId('test-panel-log')[0].querySelectorAll('li')
    expect(rows.length).toBe(2)
  })

  it('muestra el reporte final con resultados', () => {
    renderPanel(status({ status: 'done', done: 6, total: 6, report }))
    expect(screen.getByText(/FALLÓ/)).toBeInTheDocument()
    expect(screen.getByText(/promedio 200 ms · p95 350 ms/)).toBeInTheDocument()
    expect(screen.getByText('bad')).toBeInTheDocument()
    expect(screen.getByText('bad: timeout')).toBeInTheDocument()
    expect(screen.getByText('▶ Ejecutar de nuevo')).toBeInTheDocument()
  })

  it('muestra el error si la ejecución falló', () => {
    renderPanel(status({ status: 'error', error: 'boom' }))
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.queryByText(/FALLÓ/)).not.toBeInTheDocument()
  })

  it('muestra el estado parado', () => {
    renderPanel(status({ status: 'stopped', done: 3, total: 6 }))
    expect(screen.getByText('stopped')).toBeInTheDocument()
  })

  it('sin status no muestra el reporte', () => {
    renderPanel(null)
    expect(screen.queryByText(/PASÓ|FALLÓ/)).not.toBeInTheDocument()
  })
})
