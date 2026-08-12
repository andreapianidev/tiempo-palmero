/**
 * Rejilla de viento del modelo, para rellenar lo que la red no cubre.
 *
 * De las 52 estaciones registradas, solo 25 de las 37 frescas publican
 * dirección del viento (medido el 12 ago 2026), y están casi todas en la
 * mitad baja de la isla. Sin esta capa, el mapa de viento tendría agujeros
 * exactamente donde el viento es más interesante: la Cumbre y el sotavento.
 *
 * Open-Meteo es un MODELO (mezcla ICON/GFS/ECMWF), no una medida. Aquí solo
 * entra como FONDO: donde hay estación manda la estación, y cada celda guarda
 * qué parte de su valor sostiene cada cosa (ver `field.ts`). Nunca se presenta
 * como dato del Cabildo, y la interfaz declara cuándo está en juego.
 *
 * Se piden todos los puntos en UNA petición —la API acepta listas separadas
 * por comas y devuelve un bloque por punto— para no disparar 54 llamadas.
 */

import { elevationAt, type Dem } from '../dem'
import { ISLAND_BBOX } from '../geo'
import { toComponents, type WindSample } from './field'

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

/**
 * Puntos por lado de la rejilla del modelo.
 *
 * 6 × 9 son 54 puntos sobre un rectángulo de unos 34 × 55 km: uno cada ~5 km.
 * Más fino no aporta —el modelo global no resuelve por debajo de eso— y hace
 * la URL innecesariamente larga.
 */
const GRID_COLS = 6
const GRID_ROWS = 9

export interface ModelWind {
  samples: WindSample[]
  /** Instante de la pasada del modelo, epoch ms UTC. */
  observedAt: number
}

export interface GridPoint {
  lon: number
  lat: number
  elevation: number
}

/** Los puntos donde se le pregunta al modelo, con la altitud del DEM propio. */
export function modelGridPoints(dem: Dem | null): GridPoint[] {
  const { west, east, south, north } = ISLAND_BBOX
  const points: GridPoint[] = []
  for (let j = 0; j < GRID_ROWS; j++) {
    const lat = south + ((j + 0.5) / GRID_ROWS) * (north - south)
    for (let i = 0; i < GRID_COLS; i++) {
      const lon = west + ((i + 0.5) / GRID_COLS) * (east - west)
      // Sin DEM se pide a nivel del mar; con DEM, la cota real, que en una isla
      // de 2426 m cambia el viento de forma sustancial.
      const elevation = dem ? (elevationAt(dem, lon, lat) ?? 0) : 0
      points.push({ lon, lat, elevation: Math.max(0, Math.round(elevation)) })
    }
  }
  return points
}

/**
 * `2026-08-12T13:30` llega en UTC pero SIN sufijo de zona; sin la Z el
 * navegador lo leería como hora local y en Canarias eso es una hora de
 * desfase en verano. Misma lógica que `parseModelTime` para las anclas.
 */
export function parseModelTime(time: string | undefined): number {
  if (!time) return NaN
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(time)
  if (!m) return NaN
  return Date.parse(`${m[1]}${m[2] ?? ':00'}Z`)
}

export async function fetchModelWind(
  points: readonly GridPoint[],
  signal?: AbortSignal,
): Promise<ModelWind> {
  if (!points.length) return { samples: [], observedAt: NaN }

  const url =
    `${OPEN_METEO_URL}?latitude=${points.map((p) => p.lat.toFixed(4)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(4)).join(',')}` +
    `&elevation=${points.map((p) => p.elevation).join(',')}` +
    `&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=UTC`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo viento: HTTP ${res.status}`)
  const body = await res.json()
  // Con un solo punto la API devuelve un objeto; con varios, un array.
  const blocks: unknown[] = Array.isArray(body) ? body : [body]

  const samples: WindSample[] = []
  let observedAt = NaN
  blocks.forEach((raw, i) => {
    const b = raw as {
      current?: { time?: string; wind_speed_10m?: number; wind_direction_10m?: number }
    }
    const c = b.current
    const p = points[i]
    if (!c || !p) return
    const speed = c.wind_speed_10m
    const dir = c.wind_direction_10m
    if (!Number.isFinite(speed) || !Number.isFinite(dir)) return
    const at = parseModelTime(c.time)
    // Sin hora fiable no entra: mejor un hueco que fechar mal una pasada.
    if (!Number.isFinite(at)) return
    if (!Number.isFinite(observedAt)) observedAt = at

    const { u, v } = toComponents(speed as number, dir as number)
    samples.push({ lon: p.lon, lat: p.lat, u, v, source: 'model' })
  })

  return { samples, observedAt }
}
