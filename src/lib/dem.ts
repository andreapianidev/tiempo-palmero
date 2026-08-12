/**
 * DEM en el navegador.
 *
 * Las mismas teselas terrarium que sirven de fuente `raster-dem` para el
 * hillshade de MapLibre se leen aquí a mano para consultar altitudes. Es
 * deliberado: descargar dos modelos de elevación distintos para la misma isla
 * sería tirar ancho de banda y arriesgarse a que el relieve que se ve y el que
 * se calcula no coincidan.
 *
 * Decodificación terrarium:  altura_m = (R · 256 + G + B / 256) − 32768
 */

import { lonToPixelX, latToPixelY } from './geo'

export interface DemManifest {
  /** Zoom del que se leen las altitudes: siempre el más fino. */
  zoom: number
  /** Zoom más bajo disponible, para la fuente `raster-dem` del relieve. */
  minZoom: number
  tileSize: number
  x0: number
  y0: number
  cols: number
  rows: number
  metersPerPixel: number
  attribution: string
  encoding: 'terrarium'
  generated: string
}

export interface Dem {
  manifest: DemManifest
  /** Altura en metros por píxel, ya decodificada. Fila mayor. */
  heights: Float32Array
  width: number
  height: number
  /** Origen en píxeles globales del nivel de zoom. */
  originX: number
  originY: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`tesela DEM: ${src}`))
    img.src = src
  })
}

export async function loadDem(
  onProgress?: (done: number, total: number) => void,
): Promise<Dem> {
  const manifest: DemManifest = await fetch('/dem/manifest.json').then((r) => {
    if (!r.ok) throw new Error('falta /dem/manifest.json — ejecuta npm run prepare-data')
    return r.json()
  })

  const { zoom, tileSize, x0, y0, cols, rows } = manifest
  const width = cols * tileSize
  const height = rows * tileSize

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sin contexto 2D para el DEM')

  const total = cols * rows
  let done = 0
  // Las teselas son locales y están cacheadas por el CDN con immutable, así
  // que en paralelo no hay a quién molestar.
  await Promise.all(
    Array.from({ length: total }, async (_, k) => {
      const tx = x0 + (k % cols)
      const ty = y0 + Math.floor(k / cols)
      const img = await loadImage(`/dem/${zoom}/${tx}/${ty}.png`)
      ctx.drawImage(img, (tx - x0) * tileSize, (ty - y0) * tileSize)
      onProgress?.(++done, total)
    }),
  )

  const rgba = ctx.getImageData(0, 0, width, height).data
  const heights = new Float32Array(width * height)
  for (let i = 0, p = 0; i < heights.length; i++, p += 4) {
    heights[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768
  }

  return {
    manifest,
    heights,
    width,
    height,
    originX: x0 * tileSize,
    originY: y0 * tileSize,
  }
}

function heightAtPixel(dem: Dem, px: number, py: number): number | null {
  const x = px - dem.originX
  const y = py - dem.originY
  if (x < 0 || y < 0 || x >= dem.width || y >= dem.height) return null
  return dem.heights[y * dem.width + x]
}

/**
 * Muestreo bilineal. El vecino más cercano da escalones de 34 m en la
 * pendiente, y en una isla que sube 2426 m eso se traduce en saltos visibles
 * de temperatura al arrastrar el dedo por el mapa.
 */
export function elevationAt(dem: Dem, lon: number, lat: number): number | null {
  const fx = lonToPixelX(lon, dem.manifest.zoom) - 0.5
  const fy = latToPixelY(lat, dem.manifest.zoom) - 0.5
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const dx = fx - x0
  const dy = fy - y0

  const a = heightAtPixel(dem, x0, y0)
  const b = heightAtPixel(dem, x0 + 1, y0)
  const c = heightAtPixel(dem, x0, y0 + 1)
  const d = heightAtPixel(dem, x0 + 1, y0 + 1)
  if (a === null || b === null || c === null || d === null) return null

  return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy
}

/** Bajo esto se considera mar y no se pinta malla. */
export const SEA_LEVEL_M = 1.5

export function isLand(dem: Dem, lon: number, lat: number): boolean {
  const h = elevationAt(dem, lon, lat)
  return h !== null && h > SEA_LEVEL_M
}
