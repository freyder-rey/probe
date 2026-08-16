import { describe, expect, it } from 'vitest'
import { draftToLoadTest, newRequest, newTestDraft } from './types'

describe('newRequest', () => {
  it('crea una solicitud GET por defecto sin validaciones', () => {
    const r = newRequest()
    expect(r.method).toBe('GET')
    expect(r.url).toBe('')
    expect(r.body).toEqual({ type: 'none' })
    expect(r.validations).toEqual([])
    expect(r.followRedirects).toBe(true)
    expect(r.timeoutSecs).toBe(30)
  })
})

describe('newTestDraft', () => {
  it('crea un borrador vacío con todas las solicitudes seleccionadas', () => {
    const d = newTestDraft()
    expect(d.name).toBe('')
    expect(d.all).toBe(true)
    expect(d.requestNames).toEqual([])
    expect(d.iterations).toBe(1)
    expect(d.delayMs).toBe(0)
    expect(d.csv).toBe('')
  })
})

describe('draftToLoadTest', () => {
  it('convierte el borrador a LoadTest, con todas las solicitudes si all', () => {
    const test = draftToLoadTest({ ...newTestDraft(), name: '  Smoke  ', iterations: 5 })
    expect(test.name).toBe('Smoke')
    expect(test.requestNames).toEqual([])
    expect(test.iterations).toBe(5)
    expect(test.csv).toBeNull()
  })

  it('usa la lista de solicitudes cuando all está desactivado', () => {
    const test = draftToLoadTest({
      ...newTestDraft(),
      all: false,
      requestNames: ['a', 'b'],
    })
    expect(test.requestNames).toEqual(['a', 'b'])
  })

  it('incluye el CSV como CsvSource::Path cuando hay ruta', () => {
    const test = draftToLoadTest({ ...newTestDraft(), csv: ' /tmp/datos.csv ' })
    expect(test.csv).toEqual({ type: 'path', path: '/tmp/datos.csv' })
  })
})
