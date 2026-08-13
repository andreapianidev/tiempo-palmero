/**
 * Qué teselas del modelo de elevación existen de verdad.
 *
 * `public/dem/` no es el mundo: son 63 teselas de z12 que cubren el recuadro
 * de La Palma, más sus antecesoras hasta z9. Preguntar por una que no está
 * cuesta un 404 en producción y —en desarrollo— un `index.html` que el
 * decodificador de imágenes rechaza con un error rojo en la consola.
 *
 * El manifiesto describe la cobertura en el zoom más fino. Aquí se traduce a
 * cualquiera de los otros, que es división entera y nada más, pero conviene que
 * esté en un sitio con un test al lado: un desfase de una tesela deja una
 * columna del relieve sin dibujar en el borde de la isla, y eso se ve.
 */

import type { DemManifest } from '../dem'
import { pixelXToLon, pixelYToLat } from '../geo'

export interface TileRange {
  x0: number
  y0: number
  /** Ambos inclusive. */
  x1: number
  y1: number
}

/** El rectángulo de teselas que existe en ese zoom. */
export function tileRange(manifest: DemManifest, zoom: number): TileRange | null {
  if (zoom > manifest.zoom || zoom < manifest.minZoom) return null
  const scale = 2 ** (manifest.zoom - zoom)
  return {
    x0: Math.floor(manifest.x0 / scale),
    y0: Math.floor(manifest.y0 / scale),
    x1: Math.floor((manifest.x0 + manifest.cols - 1) / scale),
    y1: Math.floor((manifest.y0 + manifest.rows - 1) / scale),
  }
}

export function hasTile(manifest: DemManifest, zoom: number, x: number, y: number): boolean {
  const r = tileRange(manifest, zoom)
  return r !== null && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
}

/**
 * El recuadro en grados que cubre el modelo, para el `bounds` de la fuente.
 * Sin él, MapLibre pide las teselas de mar abierto que rodean la ventana.
 */
export function coverageBounds(
  manifest: DemManifest,
): [number, number, number, number] {
  const { x0, y0, cols, rows, tileSize, zoom } = manifest
  return [
    pixelXToLon(x0 * tileSize, zoom),
    pixelYToLat((y0 + rows) * tileSize, zoom),
    pixelXToLon((x0 + cols) * tileSize, zoom),
    pixelYToLat(y0 * tileSize, zoom),
  ]
}

/**
 * Metros por píxel del modelo en el centro de una tesela.
 *
 * La proyección de Mercator estira lo que está lejos del ecuador, así que un
 * píxel no mide lo mismo en Puerto Naos que en Groenlandia. Sin esta corrección
 * la pendiente sale mal por un factor de 1,14 en esta latitud, y la pendiente
 * es de lo que vive el sombreado.
 *
 * A z12 y a la latitud de La Palma da 33,54 m/px, que es exactamente lo que
 * declara el manifiesto — y es la comprobación de que esto es la misma cuenta
 * que hizo `prepare-data`.
 */
export const EQUATOR_M = 40075016.686

export function metersPerPixel(zoom: number, tileY: number, tileSize: number): number {
  const tiles = 2 ** zoom
  // Latitud del centro de la fila de teselas, en Mercator.
  const n = Math.PI - (2 * Math.PI * (tileY + 0.5)) / tiles
  const lat = Math.atan(Math.sinh(n))
  return (EQUATOR_M * Math.cos(lat)) / (tiles * tileSize)
}
