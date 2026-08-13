/**
 * La cobertura simulada de los repetidores de TDT, y qué se puede decir con
 * ella sin mentir.
 *
 * QUÉ ES. El Cabildo publica `Simulaciones_Rep_TDT.kmz`: 49 simulaciones de
 * cobertura, una por sector de repetidor —«Mazo Pueblo Norte», «Tirimaga Sur»,
 * «Las Tricias, Oeste»…—, cada una como una imagen georreferenciada sobre la
 * isla. No son medidas de campo: son el resultado de un cálculo de propagación
 * hecho por el Cabildo, y lo que dibujan son sombras de radio del relieve, que
 * en esta isla es lo que manda. La Caldera de Taburiente sale hueca, y eso solo
 * puede salir de un modelo que mire el terreno.
 *
 * QUÉ NO ES, y esto es lo que la interfaz repite en todas partes:
 *
 *  - No es «dónde se ve la tele». Son los REPETIDORES; el centro emisor
 *    principal no está simulado en ese fichero. Que una celda esté fuera de las
 *    49 simulaciones no significa que allí no llegue señal.
 *  - No es una medida. Es un cálculo, y de 2018.
 *  - No dice con qué calidad. Solo cuántos sectores de repetidor alcanzan el
 *    sitio, que es una pista de redundancia: donde llegan dos, perder uno no te
 *    deja sin nada.
 *
 * CÓMO VIAJA. Las 49 imágenes se funden en build en un solo PNG del tamaño del
 * bbox insular, recortado a la línea de costa (la simulación pinta también mar
 * abierto, donde no hay a quién dar señal: 43.143 celdas de las 92.610 que
 * cubría). El número de repetidores que alcanza cada celda se guarda EN EL
 * CANAL ALFA, en tres escalones, para que la ficha de un punto pueda leer del
 * mismo píxel que el mapa pinta y no puedan contradecirse.
 */

import { ISLAND_BBOX } from '../geo'

/** Cuántos repetidores alcanzan una celda: 0, 1, 2 o «3 o más». */
export type TdtTier = 0 | 1 | 2 | 3

/**
 * Alfa con el que se graba cada escalón, y con el que se lee.
 *
 * Separados 70 sobre 255 a propósito: PNG no recomprime con pérdida, pero la
 * lectura va por `getImageData` de un canvas, y entre el `premultiplied alpha`
 * de algunos navegadores y el escalado por si acaso, un escalón de 70 aguanta
 * cualquier redondeo. Con escalones de 10 esto sería adivinar.
 */
export const TDT_TIER_ALPHA: readonly number[] = [0, 90, 160, 230]

/** Tolerancia de lectura: la mitad del escalón, menos un pelo. */
const HALF = 35

/** El color con el que se graba la mancha. Violeta: no lo usa ninguna otra capa. */
export const TDT_COLOR: readonly [number, number, number] = [150, 128, 214]

export interface TdtMask {
  width: number
  height: number
  /** Alfa crudo de cada celda, tal cual salió del PNG. */
  alpha: Uint8Array
}

/** Alfa leído → escalón. Fuera de los escalones conocidos, 0. */
export function tierOfAlpha(alpha: number): TdtTier {
  for (let tier = 3; tier >= 1; tier--) {
    if (Math.abs(alpha - TDT_TIER_ALPHA[tier]) <= HALF) return tier as TdtTier
  }
  return 0
}

/** Escalón en un punto. Fuera del bbox insular no hay simulación que valer. */
export function tdtTierAt(mask: TdtMask, lon: number, lat: number): TdtTier {
  const { west, east, south, north } = ISLAND_BBOX
  if (lon < west || lon > east || lat < south || lat > north) return 0
  const x = Math.min(
    mask.width - 1,
    Math.max(0, Math.floor(((lon - west) / (east - west)) * mask.width)),
  )
  const y = Math.min(
    mask.height - 1,
    Math.max(0, Math.floor(((north - lat) / (north - south)) * mask.height)),
  )
  return tierOfAlpha(mask.alpha[y * mask.width + x])
}

/**
 * Radio del vistazo alrededor, en celdas. Tres celdas son 276 m.
 *
 * Existe porque un «no» de una sola celda de 92 m engaña. Medido sobre el
 * fichero real: el casco de Villa de Mazo y el puerto de Tazacorte caen los dos
 * en un agujero de UNA celda con cobertura simulada a tres o cuatro celdas de
 * distancia. Son sombras de radio de verdad —el cálculo las dibuja así— pero
 * quien pincha un sitio no está preguntando por un cuadrado de 92 m, sino por
 * el sitio. Así que cuando la celda dice que no, se mira si alrededor dice que
 * sí, y la ficha lo cuenta como lo que es: cerca sí, aquí no.
 */
export const TDT_NEARBY_CELLS = 3

export interface TdtReading {
  /** Lo que dice la celda exacta. */
  tier: TdtTier
  /** El mejor escalón dentro de `TDT_NEARBY_CELLS`, la propia celda incluida. */
  nearby: TdtTier
}

export function tdtReadingAt(mask: TdtMask, lon: number, lat: number): TdtReading {
  const { west, east, south, north } = ISLAND_BBOX
  const tier = tdtTierAt(mask, lon, lat)
  if (tier || lon < west || lon > east || lat < south || lat > north) {
    return { tier, nearby: tier }
  }

  const cx = Math.floor(((lon - west) / (east - west)) * mask.width)
  const cy = Math.floor(((north - lat) / (north - south)) * mask.height)
  let nearby: TdtTier = 0
  for (let dy = -TDT_NEARBY_CELLS; dy <= TDT_NEARBY_CELLS; dy++) {
    const y = cy + dy
    if (y < 0 || y >= mask.height) continue
    for (let dx = -TDT_NEARBY_CELLS; dx <= TDT_NEARBY_CELLS; dx++) {
      const x = cx + dx
      if (x < 0 || x >= mask.width) continue
      const t = tierOfAlpha(mask.alpha[y * mask.width + x])
      if (t > nearby) nearby = t
    }
  }
  return { tier, nearby }
}
