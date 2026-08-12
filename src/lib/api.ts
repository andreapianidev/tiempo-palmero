/**
 * Cliente de runtime. Todo pasa por /api/*, que en producción es una función
 * edge de Vercel y en desarrollo el proxy de Vite.
 *
 * En runtime la app NO llama a Open-Meteo, Nominatim ni Overpass. La licencia
 * gratuita de Open-Meteo es solo para uso no comercial y la usage policy de
 * OSM prohíbe el uso sistemático desde una app; todo lo que viene de ahí está
 * precalculado en `public/` por `scripts/prepare-data.ts`.
 */

import { decode, isCdaPayload, type CdaRow, type Vertical } from './cabildo'

export class UpstreamDownError extends Error {
  constructor(public readonly detail: string) {
    super('El servicio de datos del Cabildo no responde')
    this.name = 'UpstreamDownError'
  }
}

async function cda(vertical: Vertical, dataAccessId: string): Promise<CdaRow[]> {
  const res = await fetch(`/api/cda?vertical=${vertical}&dataAccessId=${dataAccessId}`)
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new UpstreamDownError(detail)
  }
  const json: unknown = await res.json()
  if (!isCdaPayload(json)) throw new UpstreamDownError('respuesta con formato inesperado')
  return decode(json)
}

export const fetchWeather = () => cda('environment', 'weatherobserved_lastdata')
export const fetchAirQuality = () => cda('environment', 'airqualityobserved_lastdata')
export const fetchSkyQuality = () => cda('skyobservation', 'skyobservation_lastdata')
export const fetchFireCameras = () => cda('fireforest', 'fireforest_lastdata')

// ---------------------------------------------------------------------------
// CO₂ — DEMASE
// ---------------------------------------------------------------------------

export interface Co2Reading {
  id: number
  ppm: number
  percent: number
  tempC: number | null
  battery: number | null
  /** Epoch ms. `Ts` viene en segundos y es la referencia fiable: `Fecha` es
   *  DD/MM/YYYY y ordena mal como cadena. */
  at: number
}

export interface Co2Sensor {
  id: number
  name: string
  alias: string | null
  lon: number
  lat: number
  heightM: number | null
  zone: string | null
  outdoor: boolean
}

/** Antigüedad máxima de una lectura de CO₂. Pasado esto: «sin datos». */
export const CO2_MAX_AGE_MS = 15 * 60 * 1000

export async function fetchCo2Readings(): Promise<{ fetchedAt: number; readings: Co2Reading[] }> {
  const res = await fetch('/api/co2?resource=actuales')
  if (!res.ok) {
    // Fallo en cerrado: aquí no hay «última lectura buena». Un verde rancio
    // sobre un sensor de gas volcánico es peor que una pantalla vacía.
    throw new UpstreamDownError('red de CO₂ no disponible')
  }
  const body = (await res.json()) as {
    fetchedAt: number
    data: {
      Ts: number
      valores?: { Id: number; Co2?: number; 'co2%'?: number; temp?: number; bat?: number }
    }[]
  }
  const readings: Co2Reading[] = []
  for (const r of body.data) {
    const v = r.valores
    if (!v || typeof v.Id !== 'number' || typeof v.Co2 !== 'number') continue
    readings.push({
      id: v.Id,
      ppm: v.Co2,
      percent: v['co2%'] ?? v.Co2 / 10_000,
      tempC: v.temp ?? null,
      battery: v.bat ?? null,
      at: r.Ts * 1000,
    })
  }
  return { fetchedAt: body.fetchedAt, readings }
}

export async function fetchCo2Sensors(): Promise<Co2Sensor[]> {
  const res = await fetch('/api/co2?resource=metadato')
  if (!res.ok) throw new UpstreamDownError('inventario de sensores de CO₂ no disponible')
  const body = (await res.json()) as {
    data: {
      Id: number
      Nombre: string
      Alias: string | null
      Longitud: number
      Latitud: number
      Altura: number | null
      Poblacion: string | null
      Exterior: unknown
    }[]
  }
  return body.data
    .filter((s) => Number.isFinite(s.Longitud) && Number.isFinite(s.Latitud))
    .map((s) => ({
      id: s.Id,
      name: s.Nombre,
      alias: s.Alias,
      lon: s.Longitud,
      lat: s.Latitud,
      heightM: s.Altura,
      zone: s.Poblacion,
      outdoor: s.Exterior === true || s.Exterior === 1 || s.Exterior === 'S',
    }))
}

// ---------------------------------------------------------------------------
// Activos estáticos precalculados
// ---------------------------------------------------------------------------

export interface GazetteerEntry {
  name: string
  lon: number
  lat: number
  kind: string
  municipality: string | null
}

export async function fetchGazetteer(): Promise<GazetteerEntry[]> {
  const res = await fetch('/gazetteer.json')
  if (!res.ok) return []
  const body = (await res.json()) as { entries: GazetteerEntry[] }
  return body.entries ?? []
}

export async function fetchLayer<T = unknown>(file: string): Promise<T | null> {
  const res = await fetch(`/layers/${file}`)
  return res.ok ? ((await res.json()) as T) : null
}
