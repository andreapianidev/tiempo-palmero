/**
 * Cobertura móvil: un sondeo de campo de 2013, y hay que decirlo en todas
 * partes.
 *
 * QUÉ ES. 669 medidas de nivel de señal recibida (GSM y UMTS, en dBm) que el
 * Cabildo tomó recorriendo la isla. Comprobado el 13 ago 2026 contra el
 * servicio en vivo: **las 669 llevan fecha de noviembre o diciembre de 2013**
 * —324 de noviembre, 344 de diciembre y una con el año tecleado al revés,
 * «2103-11»—. No hay ninguna medida posterior.
 *
 * POR QUÉ SE ENSEÑA IGUAL, y con la fecha pegada al nombre de la variable.
 * Porque es el único dato de cobertura que existe publicado de esta isla, y
 * porque las sombras de radio que dibuja son de relieve: un barranco que
 * tapaba la señal en 2013 la sigue tapando. Lo que ha cambiado —y mucho— es
 * todo lo demás: en 2013 no había 4G desplegado, no existía el 5G, y la
 * erupción de 2021 se llevó por delante parte de la red del oeste. Así que
 * esto NO dice qué cobertura hay hoy, y la interfaz no lo insinúa en ningún
 * sitio: la variable se llama «Cobertura móvil (2013)» y la ficha lo repite.
 *
 * POR QUÉ NO SE PROMEDIA. La señal la corta el terreno, no la distancia: dos
 * puntos a 400 m con una arista en medio no tienen por qué parecerse en nada.
 * Un IDW rellenaría de cobertura justo las sombras de radio, que son lo único
 * que de verdad interesa saber. Cada celda toma la medida más cercana y solo
 * hasta `COVERAGE_NEAR_M`. Ver `masked-field.ts`.
 */

import { buildMaskedField, type MaskedField } from '../masked-field'
import { coverageBand } from '../palette'

/**
 * Hasta dónde llega una medida, en metros.
 *
 * El sondeo tiene una separación mediana de 430 m entre puntos y de 955 m en
 * el percentil 90 (medido el 13 ago 2026 sobre los 669). Con 600 m el recorrido
 * queda cubierto sin huecos y, en cuanto la ruta del sondeo se acaba, el campo
 * se corta: los montes por los que nadie condujo se quedan sin color, que es
 * exactamente lo que se sabe de ellos.
 */
export const COVERAGE_NEAR_M = 600

/** Lado de celda del raster. Muy por debajo del espaciado del sondeo. */
export const COVERAGE_CELL_M = 100

/**
 * Suelo y techo físicos del nivel de señal, en dBm.
 *
 * El servicio publica un valor de UMTS de **+114 dBm**, que no es una señal
 * sino un error de captura: +114 dBm serían 250 kW en la antena del móvil.
 * Cualquier valor positivo se cae, igual que los que quedan por debajo del
 * suelo de sensibilidad de un receptor.
 */
export const COVERAGE_BOUNDS: [number, number] = [-130, -30]

export type CoverageBand = 'gsm' | 'umts'

export interface CoverageField {
  field: MaskedField
  band: CoverageBand
  /** Cuántas medidas lo sostienen. */
  count: number
  /** Mejor y peor nivel del sondeo, en dBm. */
  range: [number, number]
}

interface RawFeature {
  geometry?: { type?: string; coordinates?: unknown } | null
  properties?: Record<string, unknown> | null
}

/**
 * Monta el campo a partir del GeoJSON del sondeo.
 *
 * `GSM_down` es el nivel en el sentido que importa para quien lleva el
 * teléfono —lo que llega al móvil— y es la columna que viene completa en las
 * 669 filas; `UMTS` es la de tercera generación y trae el valor imposible.
 */
export function buildCoverageField(
  fc: unknown,
  band: CoverageBand = 'gsm',
): CoverageField | null {
  const features = (fc as { features?: RawFeature[] })?.features
  if (!Array.isArray(features)) return null

  const key = band === 'gsm' ? 'GSM_down' : 'UMTS'
  const nodes: { lon: number; lat: number; value: number }[] = []
  for (const f of features) {
    const c = f.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) continue
    const lon = Number(c[0])
    const lat = Number(c[1])
    const value = Number(f.properties?.[key] ?? f.properties?.[key.toLowerCase()])
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(value)) continue
    if (value < COVERAGE_BOUNDS[0] || value > COVERAGE_BOUNDS[1]) continue
    nodes.push({ lon, lat, value })
  }
  if (!nodes.length) return null

  const field = buildMaskedField(nodes, {
    radiusM: COVERAGE_NEAR_M,
    cellM: COVERAGE_CELL_M,
    colorOf: (dbm) => coverageBand(dbm).color,
  })
  if (!field) return null

  const values = nodes.map((n) => n.value)
  return {
    field,
    band,
    count: nodes.length,
    range: [Math.min(...values), Math.max(...values)],
  }
}
