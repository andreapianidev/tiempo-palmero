/**
 * La imagen del CO₂: que lo transparente siga siendo transparente.
 *
 * El riesgo de un raster no es equivocarse de tono, es rellenar. Aquí se fija
 * que fuera del alcance de los sensores no se escribe ni un píxel, que el
 * color que se escribe es el de una banda entera —nunca una mezcla de dos— y
 * que la resolución sigue siendo la de la red y no la de la isla.
 */

import { describe, it, expect } from 'vitest'
import { buildCo2Field, CO2_NEAR_M, type Co2Observation } from './field'
import { rasterizeCo2, CO2_CELL_M } from './raster'
import { CO2_BANDS } from '../palette'

const M = 1 / 110_574

function sensor(lat: number, ppm: number, lon = -17.91): Co2Observation {
  return { lon, lat, outdoor: true, stale: false, reading: { ppm, at: 1_786_500_000_000 } }
}

describe('la mancha se queda dentro de la zona vigilada', () => {
  const field = buildCo2Field([sensor(28.6, 400)])!
  const r = rasterizeCo2(field)

  it('la celda es la de la red, no la de la malla de la isla', () => {
    expect(r.cellMeters).toBe(CO2_CELL_M)
    // Un solo sensor: el marco son 160 m de lado, o sea ~11 celdas.
    expect(r.cols).toBeLessThan(16)
    expect(r.rows).toBeLessThan(16)
  })

  it('deja transparente todo lo que cae fuera del disco de 80 m', () => {
    // El disco ocupa π·80² de un marco de 160×160: algo menos del 79 %.
    const share = r.paintedCells / (r.cols * r.rows)
    expect(share).toBeGreaterThan(0.6)
    expect(share).toBeLessThan(0.8)

    // Las esquinas del marco están a 80·√2 ≈ 113 m del sensor: fuera.
    for (const k of [0, r.cols - 1, (r.rows - 1) * r.cols, r.cols * r.rows - 1]) {
      expect(r.pixels[k * 4 + 3]).toBe(0)
    }
  })

  it('ningún píxel pintado lleva un color que no sea el de una banda', () => {
    const bandColors = new Set(
      CO2_BANDS.map((b) => {
        const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(b.color.slice(i, i + 2), 16))
        return `${rr},${gg},${bb}`
      }),
    )
    for (let k = 0; k < r.cols * r.rows; k++) {
      if (r.pixels[k * 4 + 3] === 0) continue
      expect(bandColors).toContain(
        `${r.pixels[k * 4]},${r.pixels[k * 4 + 1]},${r.pixels[k * 4 + 2]}`,
      )
    }
  })
})

describe('dos sensores contiguos con lecturas opuestas', () => {
  // El pozo a 69 301 ppm y su vecino a 400, separados 20 m.
  const field = buildCo2Field([sensor(28.6, 69_301), sensor(28.6 + 20 * M, 400)])!
  const r = rasterizeCo2(field)

  it('solo aparecen los dos colores medidos, sin tramos intermedios', () => {
    const seen = new Set<string>()
    for (let k = 0; k < r.cols * r.rows; k++) {
      if (r.pixels[k * 4 + 3] === 0) continue
      seen.add(`${r.pixels[k * 4]},${r.pixels[k * 4 + 1]},${r.pixels[k * 4 + 2]}`)
    }
    expect(seen.size).toBe(2)
  })

  it('el marco crece con los dos sensores, no se queda en uno', () => {
    const [[, south], [, north]] = r.bounds
    expect((north - south) / M).toBeCloseTo(20 + 2 * CO2_NEAR_M, 0)
  })
})
