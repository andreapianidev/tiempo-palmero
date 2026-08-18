/**
 * Malla raster de la variable interpolada.
 *
 * Se calcula sobre el propio retículo del DEM, submuestreado, para que cada
 * celda tenga una altitud exacta en lugar de una interpolada dos veces. A z12
 * el píxel del DEM mide 33,5 m, así que un paso de 6 píxeles da ~200 m.
 *
 * El mar no se pinta: sobre agua no hay altitud que corregir y un valor ahí
 * sería inventado.
 */

import { pixelXToLon, pixelYToLat } from './geo'
import type { Dem } from './dem'
import { SEA_LEVEL_M } from './dem'
import { sampleRamp, type RgbStop } from './palette'

export interface GridRaster {
  /** RGBA, fila mayor, `cols × rows`. El mar queda a alfa 0. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  cols: number
  rows: number
  /** [[west, south], [east, north]] en grados. */
  bounds: [[number, number], [number, number]]
  landCells: number
  cellMeters: number
}

export interface GridOptions {
  /** Píxeles de DEM por celda. 6 × 33,5 m ≈ 200 m. */
  step?: number
  opacity?: number
}

/**
 * La malla, en píxeles sueltos y sin depender de nada del navegador.
 *
 * Aquí está todo el trabajo: una estimación por celda sobre el retículo del
 * DEM. Dónde acaban esos píxeles —un `<canvas>` en la web, una textura en una
 * aplicación 3D— es cosa de quien llama.
 *
 * `valueAt` en lugar de un modelo: el punto de rocío no se interpola, se deriva
 * de la temperatura y la humedad, así que la malla tiene que poder pintar algo
 * que no sale de un único ajuste.
 */
export function rasterizeGrid(
  dem: Dem,
  valueAt: (lon: number, lat: number, elevation: number) => number | null,
  stops: RgbStop[],
  opts: GridOptions = {},
): GridRaster {
  const { step = 6, opacity = 0.72 } = opts
  const cols = Math.floor(dem.width / step)
  const rows = Math.floor(dem.height / step)

  const out = new Uint8ClampedArray(cols * rows * 4)
  const alpha = Math.round(opacity * 255)
  const { zoom } = dem.manifest

  let landCells = 0
  for (let j = 0; j < rows; j++) {
    // Centro de la celda, no su esquina.
    const py = dem.originY + j * step + step / 2
    const lat = pixelYToLat(py, zoom)
    const rowBase = Math.min(j * step + (step >> 1), dem.height - 1) * dem.width

    for (let i = 0; i < cols; i++) {
      const sx = Math.min(i * step + (step >> 1), dem.width - 1)
      const elevation = dem.heights[rowBase + sx]
      if (elevation <= SEA_LEVEL_M) continue // mar: transparente

      const px = dem.originX + i * step + step / 2
      const lon = pixelXToLon(px, zoom)
      const value = valueAt(lon, lat, elevation)
      if (value === null) continue

      const [r, g, b] = sampleRamp(stops, value)
      const o = (j * cols + i) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = alpha
      landCells++
    }
  }
  const west = pixelXToLon(dem.originX, zoom)
  const east = pixelXToLon(dem.originX + dem.width, zoom)
  const north = pixelYToLat(dem.originY, zoom)
  const south = pixelYToLat(dem.originY + dem.height, zoom)

  return {
    pixels: out,
    cols,
    rows,
    bounds: [
      [west, south],
      [east, north],
    ],
    landCells,
    cellMeters: Math.round(step * dem.manifest.metersPerPixel),
  }
}
