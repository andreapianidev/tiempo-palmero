/**
 * El umbral de las tres horas, contra las dos orillas que lo justifican.
 *
 * La prueba que importa no es «¿caza la cámara parada?» sino «¿la caza sin
 * marcar ninguna que sigue viva?». Una webcam lenta señalada como muerta es
 * peor que una muerta sin señalar: la primera hace desconfiar de un dato bueno.
 */

import { describe, it, expect } from 'vitest'
import { isWebcamStale, WEBCAM_STALE_MS } from './freshness'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.UTC(2026, 7, 14, 14, 0, 0)

describe('frescura de una webcam', () => {
  it('no marca la viva más lenta del catálogo', () => {
    // Skywatch ORM, la que más tardó en publicar de las que siguen vivas.
    expect(isWebcamStale(NOW - 30 * MIN, NOW)).toBe(false)
    // Y con holgura: el doble de esa espera tampoco la marca.
    expect(isWebcamStale(NOW - 60 * MIN, NOW)).toBe(false)
  })

  it('marca la parada más reciente que se llegó a medir', () => {
    // Mercator, que de día no publica: 14 h de retraso a mediodía.
    expect(isWebcamStale(NOW - 14 * HOUR, NOW)).toBe(true)
    // Y las de verdad abandonadas, meses atrás.
    expect(isWebcamStale(NOW - 62 * 24 * HOUR, NOW)).toBe(true)
  })

  it('deja las dos orillas a un factor cómodo del umbral', () => {
    // Si alguien mueve el umbral, esto falla antes de que se acerque a una de
    // las dos orillas medidas. Ver la tabla de `freshness.ts`.
    expect(WEBCAM_STALE_MS).toBeGreaterThan(4 * (30 * MIN))
    expect(WEBCAM_STALE_MS).toBeLessThan(14 * HOUR / 3)
  })

  it('no juzga lo que no tiene sello', () => {
    // Las del Cabildo no mandan `Last-Modified`. No saber la hora no es saber
    // que la imagen es vieja, y marcarlas sería inventarse un diagnóstico.
    expect(isWebcamStale(null, NOW)).toBe(false)
  })
})
