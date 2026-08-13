/**
 * Mercator normalizado: el sistema en el que habla la GPU.
 *
 * MapLibre le pasa a una capa personalizada una matriz que espera coordenadas
 * Mercator de 0 a 1 —0 en el antimeridiano y en el polo norte, 1 en el otro
 * extremo—, no grados. Todo el océano trabaja en esas unidades: la rejilla, las
 * texturas y las longitudes de onda.
 *
 * La proyección NO se redefine aquí. Se envuelve la de `geo.ts`, que es la que
 * ya usan el DEM y el motor, dividida por el tamaño de tesela. Dos definiciones
 * de la misma proyección es la clase de duplicado que un día se desincroniza en
 * el sexto decimal y deja el mar medio metro corrido respecto a la costa.
 */

import { TILE_SIZE, latToPixelY, lonToPixelX, pixelXToLon, pixelYToLat } from '../geo'

/** Longitud del ecuador, m. Es la escala de una unidad Mercator entera. */
export const EARTH_CIRCUMFERENCE_M = 40_075_016.686

export const mercatorX = (lon: number): number => lonToPixelX(lon, 0) / TILE_SIZE
export const mercatorY = (lat: number): number => latToPixelY(lat, 0) / TILE_SIZE
export const lonFromMercatorX = (x: number): number => pixelXToLon(x * TILE_SIZE, 0)
export const latFromMercatorY = (y: number): number => pixelYToLat(y * TILE_SIZE, 0)

export interface MercatorBox {
  x0: number
  y0: number
  /** Ancho y alto en unidades Mercator. `y0` es el borde NORTE. */
  width: number
  height: number
}

export function mercatorBox(bbox: {
  west: number
  east: number
  south: number
  north: number
}): MercatorBox {
  const x0 = mercatorX(bbox.west)
  const y0 = mercatorY(bbox.north)
  return {
    x0,
    y0,
    width: mercatorX(bbox.east) - x0,
    height: mercatorY(bbox.south) - y0,
  }
}

/**
 * Cuántos metros de terreno mide una unidad Mercator a esta latitud.
 *
 * Mercator estira: en el ecuador una unidad son los 40.075 km del ecuador, y a
 * 28,65° —la latitud de esta isla— son 35.180 km, un 12 % menos. Sin esta
 * corrección, una ola de 47 m de longitud de onda se dibujaría de 41 m, y la
 * marea de medio metro levantaría el agua 44 cm.
 */
export function metersPerMercatorUnit(latDeg: number): number {
  return EARTH_CIRCUMFERENCE_M * Math.cos((latDeg * Math.PI) / 180)
}

/** Y la vuelta: una altura en metros, en unidades Mercator (el eje z). */
export function metersToMercator(meters: number, latDeg: number): number {
  return meters / metersPerMercatorUnit(latDeg)
}
