/**
 * La sequía de cada trozo de isla, pedida al archivo de reanálisis.
 *
 * UNA PETICIÓN, DIEZ PUNTOS. El archivo de Open-Meteo admite listas de
 * coordenadas y contesta un objeto por punto, así que toda la isla cabe en una
 * llamada. Devuelve además la latitud y la longitud de **la celda que le tocó a
 * cada punto**, no las que se le pidieron, y de ahí sale la resolución real:
 * los diez puntos caen en seis celdas distintas de ~11 km.
 *
 * NO SE INTERPOLA, que en esta aplicación es norma y no preferencia. Cada
 * punto de la isla toma la celda del modelo que le corresponde, la más cercana,
 * sin promediar con las vecinas — el mismo trato que ya reciben el CO₂ y la
 * cobertura móvil. La vertiente noreste recibe múltiplos de la suroeste a igual
 * altitud, y dibujar una superficie continua de lluvia entre dos puntos sería
 * inventarla.
 *
 * ES UN MODELO Y VA ETIQUETADO COMO MODELO, con la misma regla que el mapa de
 * viento. Las 37 estaciones frescas del Cabildo publican `dailyprecipitation` y
 * las 37 publican cero, así que no hay serie de lluvia insular que usar.
 *
 * SI NO CONTESTA, NO PASA NADA GRAVE. El índice se queda con la mitad
 * meteorológica que sí se sabe —Fosberg, que sale de las estaciones— y la
 * interfaz dice que le falta la sequía. Rellenar el hueco con un valor por
 * defecto sería inventarse un dato con aspecto de dato.
 */

import { haversineKm } from '../geo'
import { dryness, type Dryness, type RainDay } from './drought'

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'

/**
 * Cuánto archivo se pide. 120 días cubren de sobra la racha seca más larga que
 * se ha medido en la isla —el sur llevaba 62 días sin llover el 13 ago 2026— y
 * dejan margen para un verano peor sin que la respuesta pase de unos pocos KB.
 */
export const WINDOW_DAYS = 120

/**
 * Los puntos que se piden. Diez repartidos por la isla, los mismos que usa el
 * entrenamiento en `scripts/ml/run.py`, para que la escala de percentiles que
 * se calibró allí describa las mismas celdas que se consultan aquí.
 */
export const DROUGHT_POINTS: readonly [number, number][] = [
  [28.85, -17.9], [28.78, -17.75], [28.75, -17.95], [28.68, -17.77], [28.6, -17.92],
  [28.52, -17.84], [28.45, -17.85], [28.72, -17.88], [28.62, -17.78], [28.55, -17.9],
]

export interface DroughtNode {
  /** Centro de la celda del modelo, no el punto que se pidió. */
  lon: number
  lat: number
  dryness: Dryness
}

export interface DroughtField {
  nodes: DroughtNode[]
  /** Hasta qué día llega el archivo. */
  through: string
}

interface ArchiveEntry {
  latitude: number
  longitude: number
  daily?: { time?: string[]; precipitation_sum?: (number | null)[] }
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export async function fetchDrought(signal?: AbortSignal): Promise<DroughtField | null> {
  const q = new URLSearchParams({
    latitude: DROUGHT_POINTS.map(([la]) => la.toFixed(4)).join(','),
    longitude: DROUGHT_POINTS.map(([, lo]) => lo.toFixed(4)).join(','),
    start_date: isoDay(-WINDOW_DAYS),
    end_date: isoDay(0),
    daily: 'precipitation_sum',
    timezone: 'UTC',
  })

  const res = await fetch(`${ARCHIVE}?${q}`, { signal })
  if (!res.ok) return null
  const body: unknown = await res.json()
  const entries: ArchiveEntry[] = Array.isArray(body) ? body : [body as ArchiveEntry]

  const seen = new Set<string>()
  const nodes: DroughtNode[] = []
  let through = ''
  for (const entry of entries) {
    const days = entry.daily?.time
    const mm = entry.daily?.precipitation_sum
    if (!days || !mm) continue

    // El archivo colapsa varios de los diez puntos en la misma celda. Contarla
    // dos veces no cambia el resultado —el vecino más cercano es el mismo— pero
    // sí haría que el panel dijera «diez celdas» donde hay seis.
    const key = `${entry.latitude.toFixed(4)},${entry.longitude.toFixed(4)}`
    if (seen.has(key)) continue
    seen.add(key)

    const series: RainDay[] = days.map((day, i) => ({ day, mm: mm[i] ?? null }))
    nodes.push({ lon: entry.longitude, lat: entry.latitude, dryness: dryness(series) })
    if (days.length && days[days.length - 1] > through) through = days[days.length - 1]
  }

  return nodes.length ? { nodes, through } : null
}

/** La celda del modelo que le toca a un punto. Sin promediar con las vecinas. */
export function drynessAt(field: DroughtField, lon: number, lat: number): Dryness | null {
  let best: DroughtNode | null = null
  let bestKm = Infinity
  for (const node of field.nodes) {
    const km = haversineKm([lon, lat], [node.lon, node.lat])
    if (km < bestKm) {
      bestKm = km
      best = node
    }
  }
  return best?.dryness ?? null
}
