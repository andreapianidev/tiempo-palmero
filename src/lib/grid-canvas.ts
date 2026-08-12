/**
 * La malla, montada en un `<canvas>`.
 *
 * Es lo único de `grid.ts` que necesita el navegador, y por eso vive aparte: el
 * móvil importa `rasterizeGrid` y convierte los mismos píxeles en un PNG con
 * Skia, sin arrastrar el DOM detrás.
 */

import { rasterizeGrid, type GridOptions, type GridRaster } from './grid'
import type { Dem } from './dem'
import type { RgbStop } from './palette'

export interface GridResult extends GridRaster {
  canvas: HTMLCanvasElement
}

/** La malla ya montada en un `<canvas>`, que es lo que consume la web. */
export function renderGrid(
  dem: Dem,
  valueAt: (lon: number, lat: number, elevation: number) => number | null,
  stops: RgbStop[],
  opts: GridOptions = {},
): GridResult {
  const raster = rasterizeGrid(dem, valueAt, stops, opts)
  const canvas = document.createElement('canvas')
  canvas.width = raster.cols
  canvas.height = raster.rows
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(new ImageData(raster.pixels, raster.cols, raster.rows), 0, 0)
  return { ...raster, canvas }
}
