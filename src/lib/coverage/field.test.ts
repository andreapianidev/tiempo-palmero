/**
 * El sondeo de cobertura: que no se estire y que no se promedie.
 *
 * Y sobre todo, que la fecha no se pierda. Un mapa de cobertura de 2013
 * enseñado sin año es una afirmación falsa sobre la isla de hoy, así que el
 * año va en la etiqueta de la variable y hay un test que lo fija.
 */

import { describe, it, expect } from 'vitest'
import { buildCoverageField, COVERAGE_NEAR_M, COVERAGE_BOUNDS } from './field'
import { sampleMasked } from '../masked-field'
import { coverageBand } from '../palette'
import { VARIABLES } from '../variables'

const M = 1 / 110_574

function fc(points: [number, number, number | null][]) {
  return {
    type: 'FeatureCollection',
    features: points.map(([lon, lat, gsm]) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { GSM_down: gsm, fecha: 1386288000000 },
    })),
  }
}

describe('qué medidas entran', () => {
  it('descarta el valor imposible que publica el servicio', () => {
    // El servicio trae un UMTS de +114 dBm. Sería un cuarto de megavatio
    // entrando en la antena del móvil: es un error de captura, no una señal.
    const f = buildCoverageField(fc([[-17.9, 28.6, -80], [-17.901, 28.6, 114]]))!
    expect(f.count).toBe(1)
    expect(f.range).toEqual([-80, -80])
    expect(COVERAGE_BOUNDS[1]).toBeLessThan(0)
  })

  it('sin ninguna medida buena no hay campo', () => {
    expect(buildCoverageField(fc([[-17.9, 28.6, null]]))).toBeNull()
    expect(buildCoverageField({ type: 'FeatureCollection', features: [] })).toBeNull()
    expect(buildCoverageField(null)).toBeNull()
  })
})

describe('hasta dónde llega una medida', () => {
  const f = buildCoverageField(fc([[-17.9, 28.6, -78]]))!

  it('dentro del alcance devuelve la medida tal cual', () => {
    expect(sampleMasked(f.field, -17.9, 28.6 + 300 * M)).toBe(-78)
  })

  it('pasado el alcance no hay color, y eso NO significa que no haya cobertura', () => {
    // El sondeo siguió las carreteras: lo que no se recorrió se queda sin
    // color porque nadie midió allí, no porque no haya señal.
    expect(sampleMasked(f.field, -17.9, 28.6 + (COVERAGE_NEAR_M + 50) * M)).toBeNull()
  })
})

describe('no se promedia entre medidas', () => {
  // Un punto con buena señal y otro a 500 m en sombra de radio: la media
  // diría «regular» en los dos sitios, que es falso en los dos sitios.
  const f = buildCoverageField(fc([
    [-17.9, 28.6, -62],
    [-17.9, 28.6 + 500 * M, -115],
  ]))!

  it('en medio sale una de las dos, nunca un valor intermedio', () => {
    const mid = sampleMasked(f.field, -17.9, 28.6 + 250 * M)
    expect([-62, -115]).toContain(mid)
  })

  it('los dos extremos conservan su banda', () => {
    expect(coverageBand(-62).label).toBe('Señal muy buena')
    expect(coverageBand(-115).label).toBe('Sin señal utilizable')
  })
})

describe('las bandas cubren el rango real del sondeo', () => {
  it('cada tramo tiene su banda y ninguna promete servicio', () => {
    // El sondeo real va de −119 a −54 dBm.
    for (const dbm of [-119, -110, -100, -85, -70, -54]) {
      expect(coverageBand(dbm).label.length).toBeGreaterThan(0)
    }
    const prohibidas = /garantiz|siempre|asegur|cobertura total/i
    for (const b of [-119, -110, -100, -85, -70, -54]) {
      expect(coverageBand(b).label).not.toMatch(prohibidas)
    }
  })
})

describe('la fecha viaja pegada al dato', () => {
  it('el año está en la ETIQUETA de la variable, no en una nota al pie', () => {
    // En un chip plegado, en una captura de pantalla o en el móvil, la nota al
    // pie no se ve. La etiqueta sí.
    expect(VARIABLES.coverage.label).toContain('2013')
  })

  it('y la ficha avisa además de que no cubre la isla entera', () => {
    expect(VARIABLES.coverage.local).toBeTruthy()
    expect(VARIABLES.coverage.local).toContain('2013')
  })
})
