import { describe, expect, it } from 'vitest'
import { MAX_CACHE_BYTES, QUOTA_FRACTION, TILE_TTL_MS, cacheCapBytes } from './budget'
import { isExpired, planSweep, shouldTouch, USED_AT_GRACE_MS, type TileMeta } from './lru'

const AHORA = Date.UTC(2026, 7, 18, 12, 0, 0)
const KB = 1024

function meta(key: string, sizeKb: number, edadDias: number, usoDias = edadDias): TileMeta {
  const dia = 24 * 3600 * 1000
  return {
    key,
    size: sizeKb * KB,
    storedAt: AHORA - edadDias * dia,
    usedAt: AHORA - usoDias * dia,
  }
}

/**
 * Las dos orillas pesan igual, como en todo lo que decide qué se tira.
 *
 * Una purga que se pasa borra teselas frescas y hace que la próxima vista sea
 * otra vez la espera de 556 ms medida en `budget.ts`; una que se queda corta
 * deja crecer la caché en el disco de quien abre la página. Cada prueba de aquí
 * comprueba los dos lados: lo que se va Y lo que se queda.
 */
describe('purga de la caché de teselas', () => {
  it('tira lo caducado aunque quepa de sobra', () => {
    const entries = [
      meta('vieja', 200, 31), // pasada de los 30 días
      meta('justa', 200, 29),
    ]
    const { drop, keptBytes } = planSweep(entries, MAX_CACHE_BYTES, AHORA)
    expect(drop).toEqual(['vieja'])
    expect(keptBytes).toBe(200 * KB)
  })

  it('no tira nada fresco mientras quepa', () => {
    const entries = Array.from({ length: 50 }, (_, i) => meta(`t${i}`, 230, 1))
    const { drop, keptBytes } = planSweep(entries, MAX_CACHE_BYTES, AHORA)
    expect(drop).toEqual([])
    expect(keptBytes).toBe(50 * 230 * KB)
  })

  it('cuando no cabe, empieza por la menos usada y para al llegar al techo', () => {
    // Tres teselas de 100 kB y un techo de 250: sobra una, y tiene que ser la
    // que lleva más tiempo sin mirarse, no la más antigua.
    const entries = [
      meta('reciente-pero-vieja', 100, 20, 0),
      meta('nueva-y-olvidada', 100, 1, 10),
      meta('normal', 100, 5, 5),
    ]
    const { drop, keptBytes } = planSweep(entries, 250 * KB, AHORA)
    expect(drop).toEqual(['nueva-y-olvidada'])
    expect(keptBytes).toBe(200 * KB)
  })

  it('lo caducado cuenta antes que el techo: no gasta purga en lo que ya no vale', () => {
    const entries = [
      meta('caducada-y-usadísima', 500, 40, 0),
      meta('fresca', 100, 1, 1),
    ]
    const { drop, keptBytes } = planSweep(entries, 200 * KB, AHORA)
    expect(drop).toEqual(['caducada-y-usadísima'])
    expect(keptBytes).toBe(100 * KB)
  })

  it('el plan no depende del orden en que llegan las filas', () => {
    const entries = [meta('a', 100, 1, 3), meta('b', 100, 1, 2), meta('c', 100, 1, 1)]
    const uno = planSweep(entries, 150 * KB, AHORA)
    const otro = planSweep([...entries].reverse(), 150 * KB, AHORA)
    expect(uno.drop).toEqual(otro.drop)
    expect(uno.keptBytes).toBe(otro.keptBytes)
  })

  it('caduca a los 30 días justos, no antes', () => {
    expect(isExpired(meta('x', 1, 0), AHORA)).toBe(false)
    const casi: TileMeta = { key: 'x', size: 1, storedAt: AHORA - TILE_TTL_MS + 1, usedAt: AHORA }
    const justo: TileMeta = { key: 'x', size: 1, storedAt: AHORA - TILE_TTL_MS, usedAt: AHORA }
    expect(isExpired(casi, AHORA)).toBe(false)
    expect(isExpired(justo, AHORA)).toBe(true)
  })
})

describe('techo de la caché', () => {
  it('sin cuota conocida manda el techo escrito', () => {
    expect(cacheCapBytes(undefined)).toBe(MAX_CACHE_BYTES)
    expect(cacheCapBytes(0)).toBe(MAX_CACHE_BYTES)
  })

  it('con un disco holgado sigue mandando el techo escrito', () => {
    // 30 GB de cuota es lo normal en un Chrome con espacio libre.
    expect(cacheCapBytes(30 * 1024 ** 3)).toBe(MAX_CACHE_BYTES)
  })

  it('con la cuota apurada manda la fracción de la cuota', () => {
    const cuota = 400 * 1024 ** 2
    expect(cacheCapBytes(cuota)).toBe(cuota * QUOTA_FRACTION)
    expect(cacheCapBytes(cuota)).toBeLessThan(MAX_CACHE_BYTES)
  })
})

describe('anotar el uso', () => {
  it('no reescribe en cada arrastre, y sí una vez por hora', () => {
    const recien = { key: 'x', size: 1, storedAt: AHORA, usedAt: AHORA - 60_000 }
    const rato = { key: 'x', size: 1, storedAt: AHORA, usedAt: AHORA - USED_AT_GRACE_MS }
    expect(shouldTouch(recien, AHORA)).toBe(false)
    expect(shouldTouch(rato, AHORA)).toBe(true)
  })
})
