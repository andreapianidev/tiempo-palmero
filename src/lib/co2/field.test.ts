/**
 * Lo que el mapa de CO₂ tiene prohibido hacer.
 *
 * Estos tests no comprueban que el campo salga bonito: comprueban las cuatro
 * reglas que separan «colorear entre sensores densos» de «inventarse un mapa
 * de gas volcánico». Si alguna se cae, el mapa afirma cosas que la red no ha
 * medido, y en esta variable eso no es un error de precisión.
 */

import { describe, it, expect } from 'vitest'
import { buildCo2Field, co2At, CO2_NEAR_M, type Co2Observation } from './field'

/** Un grado de latitud son ~110,6 km; 100 m es esto. */
const M = 1 / 110_574

function sensor(over: Partial<Co2Observation> & { lat: number; ppm: number }): Co2Observation {
  return {
    lon: over.lon ?? -17.91,
    lat: over.lat,
    outdoor: over.outdoor ?? true,
    stale: over.stale ?? false,
    reading: { ppm: over.ppm, at: 1_786_500_000_000 },
  }
}

describe('quién entra en el campo', () => {
  it('deja fuera a los de interior: miden una habitación, no la calle', () => {
    const f = buildCo2Field([
      sensor({ lat: 28.6, ppm: 400 }),
      sensor({ lat: 28.601, ppm: 9000, outdoor: false }),
    ])
    expect(f!.nodes).toHaveLength(1)
    expect(f!.max).toBe(400)
  })

  it('deja fuera lo rancio: un verde de hace una hora es peor que un hueco', () => {
    const f = buildCo2Field([
      sensor({ lat: 28.6, ppm: 400 }),
      sensor({ lat: 28.601, ppm: 40_000, stale: true }),
    ])
    expect(f!.nodes).toHaveLength(1)
  })

  it('sin ninguna lectura viva no hay campo, y no hay campo a medias', () => {
    expect(buildCo2Field([sensor({ lat: 28.6, ppm: 400, stale: true })])).toBeNull()
    expect(buildCo2Field([])).toBeNull()
  })
})

describe('hasta dónde llega una medida', () => {
  const field = buildCo2Field([sensor({ lat: 28.6, ppm: 5200 })])!

  it('dentro del alcance devuelve la lectura de ese sensor, sin tocarla', () => {
    expect(co2At(field, -17.91, 28.6 + 50 * M)).toBe(5200)
  })

  it('pasado el alcance no devuelve nada, ni siquiera el vecino más próximo', () => {
    expect(co2At(field, -17.91, 28.6 + (CO2_NEAR_M + 20) * M)).toBeNull()
    // Los Llanos, a 4 km: el hueco es la respuesta correcta.
    expect(co2At(field, -17.916, 28.658)).toBeNull()
  })
})

describe('no se promedia, y eso es una decisión de seguridad', () => {
  // El caso real que obliga a esta regla: en la red DEMASE dos sensores
  // separados 20 m dieron 400 y 69 301 ppm en el mismo minuto.
  const pozo = buildCo2Field([
    sensor({ lat: 28.6, ppm: 69_301 }),
    sensor({ lat: 28.6 + 20 * M, ppm: 400 }),
  ])!

  it('el punto medio entre los dos NO da una cifra intermedia', () => {
    const mid = co2At(pozo, -17.91, 28.6 + 10 * M)
    expect([69_301, 400]).toContain(mid)
    expect(mid).not.toBeGreaterThan(400 + 1)
    // …o sea: o es uno o es el otro. Un IDW habría dado ~34 850 ppm, un valor
    // que ningún sensor midió y que además baja el peligro a la mitad.
  })

  it('pegado a cada sensor sale exactamente lo que ese sensor midió', () => {
    expect(co2At(pozo, -17.91, 28.6 + 1 * M)).toBe(69_301)
    expect(co2At(pozo, -17.91, 28.6 + 19 * M)).toBe(400)
  })
})

describe('el marco del campo cubre el alcance, no solo los sensores', () => {
  it('se ensancha con el margen de la máscara por los cuatro lados', () => {
    const f = buildCo2Field([sensor({ lat: 28.6, ppm: 400 })])!
    const [[west, south], [east, north]] = f.bounds
    expect(north - 28.6).toBeCloseTo(CO2_NEAR_M * M, 6)
    expect(28.6 - south).toBeCloseTo(CO2_NEAR_M * M, 6)
    // En longitud el margen es mayor en grados: un grado de longitud a 28,6°
    // mide menos kilómetros que uno de latitud.
    expect(east - west).toBeGreaterThan(north - south)
  })
})
