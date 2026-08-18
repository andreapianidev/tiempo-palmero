/**
 * El color del terreno dentro de la silueta: altura y luz.
 *
 * La altura pone el tono —la rampa de `art.ts`, de la costa quemada a la cumbre
 * pálida— y el relieve sombreado pone la forma. Sin sombreado la isla es una
 * mancha ámbar; con él se ven la Caldera de Taburiente, el Bejenado y la línea
 * de Cumbre Vieja bajando al sur, que es lo que hace que el icono sea de esta
 * isla y no de una isla.
 *
 * EL PASO DEL GRADIENTE ES EL PÍXEL DE SALIDA, no el del DEM, y eso importa: a
 * 512 px la isla mide 410 px para 45 km, o sea 110 m por píxel, y a 192 son 293
 * m. Muestrear la pendiente cada 33,54 m —lo que da el DEM— en un icono de 192
 * dibujaría barrancos de menos de un píxel, que es exactamente el ruido que
 * ensucia un icono pequeño. Midiendo a la escala del icono, cada tamaño enseña
 * el relieve que puede enseñar.
 */

import type { Grid } from '../contour.js'
import type { IconArt } from './art.js'

/** Acimut y altura de la luz. 315° es la convención cartográfica: del noroeste. */
const LIGHT_AZIMUTH = (315 * Math.PI) / 180
const LIGHT_ALTITUDE = (45 * Math.PI) / 180

/**
 * Exageración vertical del sombreado.
 *
 * A 1 la isla es tan escarpada que el sombreado sale casi binario —ladera al
 * sol o ladera a la sombra— y la Caldera se cierra en negro. A 1,6 el circo se
 * lee entero y las medianías siguen teniendo medio tono.
 */
const Z_FACTOR = 1.6

/** Cuánto queda del color en la ladera más oscura y en la más iluminada. */
const SHADE_FLOOR = 0.62
const SHADE_RANGE = 0.72

export interface Sampler {
  /** Altura en metros, en coordenadas del icono. */
  at: (x: number, y: number) => number
}

/**
 * Muestreador bilineal sobre la malla ya reducida del DEM.
 *
 * La malla entra en celdas de `cellPixels` píxeles del DEM: quien la construye
 * decide cuánto la reduce, y aquí solo hay que deshacer esa cuenta.
 */
export function sampler(grid: Grid, cellPixels: number, art: IconArt): Sampler {
  const value = (i: number, j: number) => grid.v[j * grid.w + i]
  return {
    at(x, y) {
      const [dx, dy] = art.toDem(x, y)
      const gx = Math.min(Math.max(dx / cellPixels, 0), grid.w - 1.001)
      const gy = Math.min(Math.max(dy / cellPixels, 0), grid.h - 1.001)
      const i = Math.floor(gx)
      const j = Math.floor(gy)
      const fx = gx - i
      const fy = gy - j
      return (
        value(i, j) * (1 - fx) * (1 - fy) +
        value(i + 1, j) * fx * (1 - fy) +
        value(i, j + 1) * (1 - fx) * fy +
        value(i + 1, j + 1) * fx * fy
      )
    },
  }
}

/**
 * Factor de luz de 0 a algo más de 1, con el sombreado clásico de Horn.
 *
 * `step` es el paso con el que se mide la pendiente, en unidades del icono: se
 * le pasa el tamaño de un píxel de salida.
 */
export function light(s: Sampler, art: IconArt, x: number, y: number, step: number): number {
  const run = 2 * step * art.metersPerUnit
  const dzdx = (s.at(x + step, y) - s.at(x - step, y)) / run
  const dzdy = (s.at(x, y + step) - s.at(x, y - step)) / run

  const slope = Math.atan(Z_FACTOR * Math.hypot(dzdx, dzdy))
  const aspect = Math.atan2(dzdy, -dzdx)
  const shade =
    Math.cos(LIGHT_ALTITUDE) * Math.sin(slope) * Math.cos(LIGHT_AZIMUTH - Math.PI / 2 - aspect) +
    Math.sin(LIGHT_ALTITUDE) * Math.cos(slope)

  return SHADE_FLOOR + SHADE_RANGE * Math.min(Math.max(shade, 0), 1)
}
