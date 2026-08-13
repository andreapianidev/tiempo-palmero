/**
 * El pasado interpolado, validado como se valida el presente: dejando fuera
 * una estación y preguntándole al resto qué había en su sitio.
 *
 * Es el mismo criterio del leave-one-out de `interpolate.test.ts`, extendido a
 * lo largo del tiempo. Y es el único criterio que sirve: la curva de un punto
 * sin sensor no se puede comparar con nada, así que se comprueba donde SÍ hay
 * sensor y se acepta la reconstrucción solo si acierta a la estación que no ha
 * participado en ella.
 *
 * Los umbrales NO se relajan.
 */

import { describe, it, expect } from 'vitest'
import day from './__fixtures__/history-day.json'
import health from './__fixtures__/sensor-health-window.json'
import { bucketize, fieldSeries, MIN_STATIONS } from './history-field'
import type { DayPayload } from './history'

const payload = day as unknown as DayPayload
const days = [payload]

/** Las altitudes salen del DEM; aquí, del fixture de salud, que ya las trae. */
const ELEVATION = new Map(health.stations.map((s) => [s.entityId, s.elevation]))
const BY_ID = new Map(health.stations.map((s) => [s.entityId, s]))

const elevationAt = (lon: number, lat: number): number | null => {
  for (const s of health.stations) {
    if (Math.abs(s.lon - lon) < 1e-6 && Math.abs(s.lat - lat) < 1e-6) return s.elevation
  }
  return null
}

/** Las dos averiadas del archivo: no participan, igual que en producción. */
const FAULTY = new Set(
  health.stations
    .filter((s) => s.name === 'MTD3016CP (SN: 0408)' || s.name === 'Ecofinca Nogales')
    .map((s) => s.entityId),
)

const STEP_MIN = 30

describe('cubos de tiempo', () => {
  const buckets = bucketize(days, elevationAt, STEP_MIN, FAULTY)

  it('cubre el día entero a la cadencia pedida', () => {
    // 24 h a 30 min son 48 instantes, más el que cae en la medianoche siguiente
    // al redondear.
    expect(buckets.size).toBeGreaterThanOrEqual(48)
  })

  it('la mayoría de instantes tienen red suficiente para ajustar', () => {
    const enough = [...buckets.values()].filter((s) => s.length >= MIN_STATIONS)
    expect(enough.length / buckets.size).toBeGreaterThan(0.9)
  })

  it('no mete dos veces la misma estación en un instante', () => {
    for (const stations of buckets.values()) {
      const ids = stations.map((s) => s.entityId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('deja fuera a las averiadas', () => {
    for (const stations of buckets.values()) {
      for (const s of stations) expect(FAULTY.has(s.entityId)).toBe(false)
    }
  })
})

describe('reconstrucción en el punto de una estación excluida', () => {
  /**
   * Reconstruye la serie en el sitio de `entityId` SIN esa estación y la
   * compara con lo que midió de verdad.
   */
  function leaveOneOut(entityId: string) {
    const target = BY_ID.get(entityId)!
    const excluded = new Set([...FAULTY, entityId])
    const buckets = bucketize(days, elevationAt, STEP_MIN, excluded)
    const series = fieldSeries(
      buckets,
      'temperature',
      target.lon,
      target.lat,
      ELEVATION.get(entityId)!,
    )

    // Lo que midió de verdad, en los mismos instantes redondeados.
    const dayStart = Date.parse(`${payload.day}T00:00:00Z`)
    const iT = payload.columns.indexOf('temperature')
    const truth = new Map<number, number>()
    const station = payload.stations.find((s) => s.entityId === entityId)!
    for (const sample of station.samples) {
      const v = sample[iT + 1]
      if (typeof sample[0] !== 'number' || typeof v !== 'number') continue
      const at = dayStart + sample[0] * 60_000
      truth.set(Math.round(at / (STEP_MIN * 60_000)) * (STEP_MIN * 60_000), v)
    }

    const errors: number[] = []
    let covered = 0
    for (const p of series) {
      const actual = truth.get(p.at)
      if (actual === undefined) continue
      covered++
      errors.push(p.value - actual)
    }
    const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)
    const bias = errors.reduce((s, e) => s + e, 0) / errors.length
    return { rmse, bias, n: covered, series }
  }

  // Tres sitios distintos a propósito: costa, medianía y cumbre. Un único
  // punto de prueba diría muy poco sobre una isla con 2426 m de desnivel.
  const CASES = [
    'MTD3016CP (SN: 0466)', // 127 m, costa este
    'MTD3016CP (SN: 0401)', // 676 m, medianía sureste
    'CABLPA-CUMBRENUEVA', // 1409 m, filo de la cumbre
  ]

  for (const name of CASES) {
    const entry = health.stations.find((s) => s.name === name)!

    it(`${name} se reconstruye con error razonable sin participar`, () => {
      const { rmse, n } = leaveOneOut(entry.entityId)
      // Cubre casi todo el día: si bajara mucho, el RMSE describiría un rato
      // suelto y no la jornada.
      expect(n).toBeGreaterThan(30)
      // El leave-one-out instantáneo de la red entera da 1,58 °C de RMSE. Una
      // reconstrucción a lo largo de 24 h no puede ser mejor que eso, pero sí
      // del mismo orden: por encima de 4 °C ya no describe el sitio.
      expect(rmse).toBeLessThan(4)
    })
  }

  it('la curva reconstruida sigue la forma del día, no una recta', () => {
    const { series } = leaveOneOut(
      health.stations.find((s) => s.name === 'MTD3016CP (SN: 0401)')!.entityId,
    )
    const values = series.map((p) => p.value)
    const swing = Math.max(...values) - Math.min(...values)
    // El 12 de agosto la 0401 fue de 18,9 a 24,6 °C. Una reconstrucción que
    // saliera plana estaría promediando la isla, no estimando el punto.
    expect(swing).toBeGreaterThan(3)
  })

  it('cada punto lleva su banda y cuántas estaciones lo sostienen', () => {
    const { series } = leaveOneOut(
      health.stations.find((s) => s.name === 'MTD3016CP (SN: 0401)')!.entityId,
    )
    for (const p of series) {
      expect(p.uncertainty).toBeGreaterThan(0)
      expect(p.stations).toBeGreaterThanOrEqual(MIN_STATIONS)
    }
  })
})
