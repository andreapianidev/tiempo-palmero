/**
 * DEM: modelo, decodificación y consulta de altitudes.
 *
 * Las mismas teselas terrarium que sirven de fuente `raster-dem` para el
 * hillshade de MapLibre se leen aquí a mano para consultar altitudes. Es
 * deliberado: descargar dos modelos de elevación distintos para la misma isla
 * sería tirar ancho de banda y arriesgarse a que el relieve que se ve y el que
 * se calcula no coincidan.
 *
 * Decodificación terrarium:  altura_m = (R · 256 + G + B / 256) − 32768
 *
 * Este fichero no descarga nada: quién trae los píxeles depende de la
 * plataforma —`<canvas>` en el navegador, Skia en el móvil— y vive en
 * `dem-loader.ts` / `dem-loader.native.ts`. Aquí queda lo que es igual en las
 * dos, que es todo lo demás.
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

/** Ruta de una tesela dentro del sitio. La base la pone `endpoints.ts`. */
export function demTilePath(manifest: DemManifest, tx: number, ty: number): string {
  return `/dem/${manifest.zoom}/${tx}/${ty}.png`
}

/** Recorre las teselas del manifiesto en el orden en que se guardaron. */
export function demTiles(manifest: DemManifest): { tx: number; ty: number }[] {
  const { x0, y0, cols, rows } = manifest
  return Array.from({ length: cols * rows }, (_, k) => ({
    tx: x0 + (k % cols),
    ty: y0 + Math.floor(k / cols),
  }))
}

/**
 * Malla de alturas vacía con la geometría del manifiesto, lista para que el
 * cargador de cada plataforma vaya volcando teselas encima.
 */
export function emptyDem(manifest: DemManifest): Dem {
  const width = manifest.cols * manifest.tileSize
  const height = manifest.rows * manifest.tileSize
  return {
    manifest,
    heights: new Float32Array(width * height),
    width,
    height,
    originX: manifest.x0 * manifest.tileSize,
    originY: manifest.y0 * manifest.tileSize,
  }
}

/**
 * Vuelca una tesela ya decodificada a RGBA sobre la malla de alturas.
 *
 * `stride` es el ancho en píxeles del buffer de origen: con una tesela suelta
 * coincide con `tileSize`, pero el navegador pinta las 63 sobre un único lienzo
 * y entonces es el ancho entero del DEM.
 */
export function blitTerrarium(
  dem: Dem,
  rgba: Uint8Array | Uint8ClampedArray,
  opts: { x: number; y: number; width: number; height: number; stride?: number },
): void {
  const { x, y, width, height } = opts
  const stride = opts.stride ?? width
  for (let j = 0; j < height; j++) {
    const dst = (y + j) * dem.width + x
    const src = j * stride * 4
    for (let i = 0; i < width; i++) {
      const p = src + i * 4
      dem.heights[dst + i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768
    }
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

/**
 * Qué fracción de la tierra emergida queda por encima de una cota, en tanto por
 * ciento. Se cuenta sobre el propio retículo del DEM, así que sale de la misma
 * malla que se pinta.
 *
 * Sirve para poder decir cuánta isla queda por encima de la estación más alta,
 * en lugar de la fórmula cómoda de «algunas zonas altas». Sobre estas teselas
 * la superficie emergida da 711 km² contra los 708 km² reales de La Palma, y la
 * cota máxima 2400 m contra los 2426 m del Roque de los Muchachos: el error de
 * muestreo a 33,5 m/píxel, que para un porcentaje redondeado no importa.
 */
export function landShareAbove(dem: Dem, elevationM: number): number {
  let land = 0
  let above = 0
  for (const h of dem.heights) {
    if (h <= SEA_LEVEL_M) continue
    land++
    if (h > elevationM) above++
  }
  return land ? (100 * above) / land : 0
}
