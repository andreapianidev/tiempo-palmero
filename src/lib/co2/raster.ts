/**
 * La mancha de CO₂, en píxeles.
 *
 * NO usa el retículo del DEM como la malla higrotérmica, y no es un descuido.
 * La malla de la isla va a 200 m por celda, que sobre la zona vigilada
 * —1,5 km de punta a punta— daría siete celdas: una zonificación de colores
 * más gruesa que las propias calles de Puerto Naos. Aquí la celda es de 15 m,
 * la misma escala a la que está puesta la red, y a cambio el raster cubre solo
 * el marco de los sensores en lugar de la isla entera.
 *
 * El coste es pequeño justamente porque casi todo queda transparente: en vez
 * de recorrer las celdas buscando sensores, se recorren los sensores pintando
 * su disco de `CO2_NEAR_M`. Son ~120 celdas por sensor y ~200 sensores; el
 * resto del marco no se toca.
 */

import { co2Band } from '../palette'
import { CO2_NEAR_M, type Co2Field } from './field'

export interface Co2Raster {
  /** RGBA, fila mayor, `cols × rows`. Fuera de la máscara, alfa 0. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  cols: number
  rows: number
  /** [[oeste, sur], [este, norte]] en grados. */
  bounds: [[number, number], [number, number]]
  /** Celdas pintadas, o sea superficie con una medida a menos de 80 m. */
  paintedCells: number
  cellMeters: number
}

const M_PER_DEG_LAT = 110_574

/** Celda por defecto, en metros. La separación mediana de la red es 15 m. */
export const CO2_CELL_M = 15

export function rasterizeCo2(
  field: Co2Field,
  opts: { cellMeters?: number; opacity?: number } = {},
): Co2Raster {
  const { cellMeters = CO2_CELL_M, opacity = 0.78 } = opts
  const [[west, south], [east, north]] = field.bounds
  const midLat = (south + north) / 2
  const mPerDegLon = 111_320 * Math.cos((midLat * Math.PI) / 180)

  const widthM = (east - west) * mPerDegLon
  const heightM = (north - south) * M_PER_DEG_LAT
  const cols = Math.max(1, Math.ceil(widthM / cellMeters))
  const rows = Math.max(1, Math.ceil(heightM / cellMeters))

  const pixels = new Uint8ClampedArray(cols * rows * 4)
  // Distancia al sensor más cercano que ya ha pintado cada celda. Es lo que
  // convierte el pintado por discos en «gana el más cercano» sin tener que
  // recorrer los 209 sensores desde cada celda.
  const best = new Float32Array(cols * rows).fill(Infinity)
  const alpha = Math.round(opacity * 255)
  const radiusCells = Math.ceil(CO2_NEAR_M / cellMeters)

  let paintedCells = 0
  for (const p of field.nodes) {
    // Centro del disco, en celdas. La fila 0 es la del norte: la latitud baja
    // según sube j, como en cualquier imagen.
    const ci = ((p.lon - west) * mPerDegLon) / cellMeters
    const cj = ((north - p.lat) * M_PER_DEG_LAT) / cellMeters
    const [r, g, b] = hexToRgb(co2Band(p.ppm).color)

    const i0 = Math.max(0, Math.floor(ci - radiusCells))
    const i1 = Math.min(cols - 1, Math.ceil(ci + radiusCells))
    const j0 = Math.max(0, Math.floor(cj - radiusCells))
    const j1 = Math.min(rows - 1, Math.ceil(cj + radiusCells))

    for (let j = j0; j <= j1; j++) {
      const dyM = (j + 0.5 - cj) * cellMeters
      for (let i = i0; i <= i1; i++) {
        const dxM = (i + 0.5 - ci) * cellMeters
        const d = Math.hypot(dxM, dyM)
        if (d > CO2_NEAR_M) continue
        const k = j * cols + i
        if (d >= best[k]) continue
        if (best[k] === Infinity) paintedCells++
        best[k] = d
        const o = k * 4
        pixels[o] = r
        pixels[o + 1] = g
        pixels[o + 2] = b
        pixels[o + 3] = alpha
      }
    }
  }

  return { pixels, cols, rows, bounds: field.bounds, paintedCells, cellMeters }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
