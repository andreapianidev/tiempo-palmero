/**
 * La malla, montada en un `<canvas>`.
 *
 * Es lo único de `grid.ts` que necesita el navegador, y por eso vive aparte:
 * quien no tenga DOM importa `rasterizeGrid` y convierte los mismos píxeles a su
 * manera, sin arrastrar el navegador detrás.
 */

import { rasterizeGrid, type GridOptions, type GridRaster } from './grid'
import type { Dem } from './dem'
import type { RgbStop } from './palette'

export interface GridResult extends GridRaster {
  canvas: HTMLCanvasElement
}

/**
 * Píxeles sueltos → `<canvas>`. Lo comparten la malla de la isla y la mancha
 * de CO₂, que son dos rasters distintos con el mismo último paso.
 */
export function rasterToCanvas(
  pixels: Uint8ClampedArray<ArrayBuffer>,
  cols: number,
  rows: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(pixels, cols, rows), 0, 0)
  return canvas
}

/** La malla ya montada en un `<canvas>`, que es lo que consume la web. */
export function renderGrid(
  dem: Dem,
  valueAt: (lon: number, lat: number, elevation: number) => number | null,
  stops: RgbStop[],
  opts: GridOptions = {},
): GridResult {
  const raster = rasterizeGrid(dem, valueAt, stops, opts)
  return { ...raster, canvas: rasterToCanvas(raster.pixels, raster.cols, raster.rows) }
}
