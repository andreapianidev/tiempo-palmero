/**
 * Series históricas de una estación.
 *
 * Se pide por DÍAS UTC completos, no por ventanas arbitrarias, y esa es la
 * decisión que sostiene todo lo demás: un día pasado no cambia nunca, así que
 * `/api/history?day=…` se cachea 30 días en el CDN y la gráfica de la semana
 * son siete peticiones que casi siempre responde la caché. Con ventanas
 * móviles («las últimas 24 h») cada visita produciría una URL distinta y la
 * caché no serviría de nada: 2 MB upstream por gráfica abierta, contra un
 * servicio público que ya se cae solo.
 *
 * Aquí NO se guarda nada. El archivo vive en la API del Cabildo; esto solo lo
 * lee, lo recorta a una estación y lo deja listo para dibujar.
 */

import { dewpointFrom } from './psychro'
import { BOUNDS } from './quality'

/** Lo que devuelve `/api/history` para un día. */
export interface DayPayload {
  day: string
  /** Minutos entre muestras; 0 es la cadencia cruda de cada estación. */
  step: number
  columns: readonly string[]
  stations: {
    entityId: string
    name: string
    lon: number
    lat: number
    /** `[minutosDesdeMedianocheUTC, ...valores]`, en el orden de `columns`. */
    samples: (number | null)[][]
  }[]
}

export interface SeriesPoint {
  /** Epoch ms UTC. */
  at: number
  temperature: number | null
  relativehumidity: number | null
  dewpoint: number | null
  windspeed: number | null
  winddirection: number | null
  /** true si el rocío no venía en la fila y se ha calculado con T y HR. */
  dewpointDerived: boolean
}

export type SeriesVariable = 'temperature' | 'relativehumidity' | 'dewpoint' | 'windspeed'

/** `2026-08-11`, en UTC, que es como está fechado el archivo. */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Los días UTC que hacen falta para cubrir `[from, to]`, en orden. */
export function daysCovering(fromMs: number, toMs: number): string[] {
  const out: string[] = []
  const first = Date.parse(`${utcDayKey(fromMs)}T00:00:00Z`)
  for (let t = first; t <= toMs; t += 86_400_000) out.push(utcDayKey(t))
  return out
}

export class HistoryUnavailableError extends Error {
  constructor(public readonly detail: string) {
    super('El histórico del Cabildo no responde')
    this.name = 'HistoryUnavailableError'
  }
}

export async function fetchDay(
  day: string,
  opts: { hourly?: boolean; signal?: AbortSignal } = {},
): Promise<DayPayload> {
  const q = new URLSearchParams({ day })
  if (opts.hourly) q.set('step', '60')
  const res = await fetch(`/api/history?${q}`, { signal: opts.signal })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string; error?: string }
      detail = body.detail ?? body.error ?? detail
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new HistoryUnavailableError(detail)
  }
  return (await res.json()) as DayPayload
}

/**
 * Extrae la serie de UNA estación de los días descargados.
 *
 * El rocío se completa igual que en el resto de la aplicación: T y HR
 * determinan el punto de rocío (Magnus-Tetens), así que una estación que
 * publica las dos sí dice cuál es el suyo aunque no traiga la columna. Lo
 * calculado se marca, y pasa por el mismo filtro de plausibilidad que lo
 * medido — sin eso, una humedad de sensor muerto (1 % a 852 m) produce un
 * rocío de −38 °C con aspecto de dato.
 */
export function seriesFor(days: readonly DayPayload[], entityId: string): SeriesPoint[] {
  const points: SeriesPoint[] = []

  for (const payload of days) {
    const station = payload.stations.find((s) => s.entityId === entityId)
    if (!station) continue
    const dayStart = Date.parse(`${payload.day}T00:00:00Z`)
    if (!Number.isFinite(dayStart)) continue
    const col = (name: string) => payload.columns.indexOf(name)
    const iT = col('temperature')
    const iH = col('relativehumidity')
    const iD = col('dewpoint')
    const iWs = col('windspeed')
    const iWd = col('winddirection')

    for (const sample of station.samples) {
      const minutes = sample[0]
      if (typeof minutes !== 'number') continue
      // `samples` guarda el minuto en la posición 0 y los valores desplazados
      // uno; `columns` no incluye el minuto.
      const value = (i: number): number | null => (i < 0 ? null : (sample[i + 1] ?? null))

      const temperature = bounded(value(iT), 'temperature')
      const relativehumidity = bounded(value(iH), 'relativehumidity')
      let dewpoint = bounded(value(iD), 'dewpoint')
      let dewpointDerived = false
      if (dewpoint === null && temperature !== null && relativehumidity !== null) {
        dewpoint = bounded(dewpointFrom(temperature, relativehumidity), 'dewpoint')
        dewpointDerived = dewpoint !== null
      }

      points.push({
        at: dayStart + minutes * 60_000,
        temperature,
        relativehumidity,
        dewpoint,
        dewpointDerived,
        windspeed: bounded(value(iWs), 'windspeed'),
        winddirection: value(iWd),
      })
    }
  }

  points.sort((a, b) => a.at - b.at)
  return points
}

function bounded(v: number | null, key: string): number | null {
  if (v === null || !Number.isFinite(v)) return null
  const b = BOUNDS[key]
  return b && (v < b[0] || v > b[1]) ? null : v
}

/** Recorta a una ventana `[from, to]` en epoch ms. */
export function sliceWindow(
  points: readonly SeriesPoint[],
  fromMs: number,
  toMs: number,
): SeriesPoint[] {
  return points.filter((p) => p.at >= fromMs && p.at <= toMs)
}

export interface Extremes {
  min: { value: number; at: number }
  max: { value: number; at: number }
}

/**
 * Máxima y mínima de la ventana, con la hora en que ocurrieron.
 *
 * Es lo que hoy no existe en ningún sitio de la aplicación: el instante suelto
 * dice cuánto hace ahora, no cuánto ha apretado el día.
 */
export function extremes(
  points: readonly SeriesPoint[],
  variable: SeriesVariable,
): Extremes | null {
  let min: { value: number; at: number } | null = null
  let max: { value: number; at: number } | null = null
  for (const p of points) {
    const v = p[variable]
    if (v === null) continue
    if (!min || v < min.value) min = { value: v, at: p.at }
    if (!max || v > max.value) max = { value: v, at: p.at }
  }
  return min && max ? { min, max } : null
}

/**
 * Cuánta de la ventana cubre de verdad la serie, de 0 a 1.
 *
 * Una estación que solo transmitió tres horas de las veinticuatro dibuja una
 * línea con la misma pinta que otra completa. La gráfica lo dice en vez de
 * dejar que la forma engañe.
 */
export function coverage(
  points: readonly SeriesPoint[],
  variable: SeriesVariable,
  fromMs: number,
  toMs: number,
  cadenceMin: number,
): number {
  const expected = Math.max(1, Math.round((toMs - fromMs) / (cadenceMin * 60_000)))
  const got = points.filter((p) => p[variable] !== null).length
  return Math.min(1, got / expected)
}
