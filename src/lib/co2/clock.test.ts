/**
 * El reloj adelantado de DEMASE, y por qué apagaba el filtro de rancio.
 *
 * Las cifras de estos tests son las del lote real del 13 ago 2026: 201
 * lecturas, 172 de ellas fechadas 57,1 minutos en el futuro.
 */

import { describe, it, expect } from 'vitest'
import { canaryOffsetMs } from '../cabildo'
import { clockSkewMs, SKEW_TOLERANCE_MS } from './clock'

const H = 3_600_000
/** 13 ago 2026, 08:19 UTC. Canarias en horario de verano: UTC+1. */
const VERANO = Date.UTC(2026, 7, 13, 8, 19)
/** 13 ene 2026. Canarias en UTC, como el resto del invierno. */
const INVIERNO = Date.UTC(2026, 0, 13, 8, 19)

describe('canaryOffsetMs', () => {
  it('vale una hora en verano y cero en invierno', () => {
    expect(canaryOffsetMs(VERANO)).toBe(H)
    expect(canaryOffsetMs(INVIERNO)).toBe(0)
  })
})

describe('clockSkewMs', () => {
  it('detecta el adelanto por la lectura MÁS NUEVA del lote', () => {
    // 172 sensores a 57,1 min en el futuro y 8 a 42,9: el lote real.
    const lote = [
      ...Array(172).fill(VERANO + 57.1 * 60_000),
      ...Array(8).fill(VERANO + 42.9 * 60_000),
    ]
    expect(clockSkewMs(lote, VERANO)).toBe(H)
  })

  it('un lote sano no se toca', () => {
    // Lecturas de hace 1 y 12 minutos, que es como debería llegar siempre.
    const lote = [VERANO - 60_000, VERANO - 12 * 60_000]
    expect(clockSkewMs(lote, VERANO)).toBe(0)
  })

  it('el día que DEMASE lo arregle, esto deja de hacer nada solo', () => {
    // Mismo verano, mismos sensores, pero ya en UTC de verdad.
    expect(clockSkewMs([VERANO - 3 * 60_000], VERANO)).toBe(0)
  })

  it('en invierno no corrige aunque el lote viniera raro', () => {
    // Canarias está en UTC: no hay desfase que restar, y restar una hora fija
    // habría envejecido las lecturas media temporada.
    expect(clockSkewMs([INVIERNO + 57 * 60_000], INVIERNO)).toBe(0)
  })

  it('un desfase pequeño se deja pasar: no todo salto es un reloj corrido', () => {
    expect(clockSkewMs([VERANO + SKEW_TOLERANCE_MS - 1000], VERANO)).toBe(0)
  })

  it('sin lecturas no inventa una corrección', () => {
    expect(clockSkewMs([], VERANO)).toBe(0)
  })
})

describe('el efecto que esto tenía sobre el filtro de 15 minutos', () => {
  const MAX_AGE = 15 * 60_000

  it('sin corregir, un sensor callado hace 70 min pasaba por fresco', () => {
    const calladoHace70 = VERANO - 70 * 60_000 + H // así llegaba: +1 h
    expect(VERANO - calladoHace70).toBeLessThan(MAX_AGE)
  })

  it('corregido, ese mismo sensor sale rancio, que es lo que es', () => {
    const crudo = VERANO - 70 * 60_000 + H
    const corregido = crudo - clockSkewMs([VERANO + 57 * 60_000], VERANO)
    expect(VERANO - corregido).toBe(70 * 60_000)
    expect(VERANO - corregido).toBeGreaterThan(MAX_AGE)
  })
})
