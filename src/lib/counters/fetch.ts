/**
 * Las tres peticiones de la red de aforos, y la ventana que se les pide.
 *
 * `paramfinish` es EXCLUSIVO: comprobado el 12 ago 2026, pedir del 05 al 12
 * devuelve del 05 al 11, y pedir del 12 al 13 devuelve el 12 —el día en curso,
 * acumulándose—. Así que para incluir hoy hay que pedir hasta mañana. Y sin
 * `paramfinish` el endpoint contesta 0 filas con esquema válido, que parece un
 * archivo vacío y no lo es; por eso los dos límites van siempre juntos.
 */

import { decode, isCdaPayload, islandDayKey, shiftDayKey, type CdaRow } from '../cabildo'
import { UpstreamDownError } from '../api'
import { dataUrl } from '../endpoints'

/** Días de histórico que se piden. Ocho: hoy y la semana anterior completa. */
export const HISTORY_DAYS = 7

async function query(dataAccessId: string, params: Record<string, string> = {}): Promise<CdaRow[]> {
  const q = new URLSearchParams({ vertical: 'count', dataAccessId, ...params })
  const res = await fetch(dataUrl(`/api/cda?${q}`))
  if (!res.ok) throw new UpstreamDownError(`${dataAccessId}: HTTP ${res.status}`)
  const json: unknown = await res.json()
  if (!isCdaPayload(json)) throw new UpstreamDownError(`${dataAccessId}: formato inesperado`)
  return decode(json)
}

export interface CounterWindow {
  /** Primer día pedido, `YYYY-MM-DD`. */
  start: string
  /** Día de la isla en curso. */
  today: string
}

export function counterWindow(now: number): CounterWindow {
  const today = islandDayKey(now)
  return { start: shiftDayKey(today, -HISTORY_DAYS), today }
}

export interface CounterPayload {
  historic: CdaRow[]
  today: CdaRow[]
  inventory: CdaRow[]
  window: CounterWindow
}

export async function fetchCounters(now: number): Promise<CounterPayload> {
  const window = counterWindow(now)
  const [historic, today, inventory] = await Promise.all([
    query('count_historic', {
      paramstart: window.start,
      paramfinish: shiftDayKey(window.today, 1),
      paramname: '',
      paramcountertype: '',
    }),
    query('count_today'),
    // El inventario solo sirve para el censo: cuántos aforos hay registrados
    // frente a cuántos hablan. Si falla, el mapa sale igual y el censo calla.
    query('count_locations').catch(() => [] as CdaRow[]),
  ])
  return { historic, today, inventory, window }
}
