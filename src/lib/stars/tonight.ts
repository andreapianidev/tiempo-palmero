/**
 * Qué se ve ahora mismo, con su nombre y su sitio en el cielo.
 *
 * POR QUÉ ESTO NO ES UN ADORNO. Todo lo demás de esta función es un dibujo
 * sobre un mapa: bonito, y difícil de comprobar desde el sofá. Esta lista sí se
 * puede comprobar — se sale a la puerta, se mira al sureste a 40° y ahí está
 * Altair o no está—. Es la parte falsable de la escena, y por eso vale la pena
 * aunque no dibuje nada.
 *
 * Y de paso resuelve un desperdicio: `nombres.json` son 22 KB con 517 estrellas
 * con nombre propio o designación de Bayer que se descargaban con el catálogo y
 * no los leía nadie. O servían para algo o sobraban del paquete.
 *
 * SE CALCULA EN LA CPU Y NO PASA NADA. Son 517 posiciones, no 8920, y solo
 * cuando el panel está abierto: unas decenas de microsegundos. La regla de que
 * el trabajo por estrella vive en la GPU es para lo que se dibuja 60 veces por
 * segundo, no para una tabla de cinco filas.
 *
 * LOS CRITERIOS DE LA LISTA, que son tres y ninguno es «las más famosas»:
 *
 *  1. Tiene que estar **por encima del horizonte del observador**, que desde una
 *     cumbre está por debajo de cero.
 *  2. Tiene que **verse esta noche**: su magnitud con la extinción de su altura
 *     por debajo del límite que marca el fotómetro. Una lista que incluya
 *     estrellas que el cielo de hoy no deja ver sería exactamente la mentira
 *     que el resto del módulo evita.
 *  3. Se ordena por **magnitud aparente**, o sea por lo que llega al ojo, y no
 *     por la del catálogo: una estrella brillante a 3° de altura llega más
 *     débil que una mediana en el cenit, y quien salga a mirar verá la segunda.
 */

import type { StarCatalog, StarNameEntry } from './catalog'
import { STRIDE_FLOATS } from './catalog'
import { applyFrame, horizontal, type SkyFrame } from './frame'
import { refractionDeg } from './refraction'
import { extinguishedMagnitude } from './visibility'

export interface VisibleStar {
  /** Nombre propio de la UAI, o la designación de Bayer si no tiene. */
  name: string
  /** Magnitud del catálogo. */
  mag: number
  /** Magnitud con la que llega, ya con la extinción del camino. */
  apparentMag: number
  /** Altura sobre el horizonte, grados, ya refractada. */
  elevationDeg: number
  azimuthDeg: number
}

export interface TonightInput {
  catalog: StarCatalog
  names: StarNameEntry[]
  frame: SkyFrame
  /** Magnitud límite de esta noche. */
  limitMag: number
  extinctionK: number
  /** Horizonte visible del observador, grados. Negativo desde una cumbre. */
  floorDeg: number
  /** Densidad relativa del aire, para la refracción. */
  pressureHpa: number
  temperatureC: number
  /** Cuántas devolver. */
  limit?: number
}

export function visibleTonight(input: TonightInput): VisibleStar[] {
  const out: VisibleStar[] = []
  for (const entry of input.names) {
    const v = entry.i * STRIDE_FLOATS
    const ra = input.catalog.vertices[v]
    const dec = input.catalog.vertices[v + 1]
    const mag = input.catalog.vertices[v + 2]

    const { elevationDeg, azimuthDeg } = horizontal(applyFrame(input.frame, ra, dec))
    const refracted =
      elevationDeg + refractionDeg(elevationDeg, input.pressureHpa, input.temperatureC)
    if (refracted < input.floorDeg) continue

    const apparentMag = extinguishedMagnitude(mag, refracted, input.extinctionK)
    if (apparentMag > input.limitMag) continue

    out.push({
      name: entry.n ?? entry.b ?? '—',
      mag,
      apparentMag,
      elevationDeg: refracted,
      azimuthDeg,
    })
  }
  out.sort((a, b) => a.apparentMag - b.apparentMag)
  return out.slice(0, input.limit ?? 5)
}

/**
 * El rumbo en palabras. Dieciséis rosas es lo que una persona usa para
 * orientarse mirando al cielo; treinta y dos serían precisión falsa, porque
 * nadie distingue NNE de NE a ojo, y ocho dejarían «este» cubriendo 45°.
 */
const ROSE = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
]

export function compassPoint(azimuthDeg: number): string {
  return ROSE[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16]
}
