/**
 * Guardarraíles de calidad. El portal sirve sensores rotos, estaciones muertas
 * y coordenadas corruptas como filas normales, sin ninguna marca de calidad.
 * Nada de esto se puede saltar antes de pintar un número.
 */

import { inIslandBbox } from './geo'
import { num, parseLocation, parseTimeinstant, type CdaRow } from './cabildo'
import { normalizePressure } from './psychro'

/** Límites de plausibilidad para La Palma (0–2426 m, subtropical). */
export const BOUNDS: Record<string, [number, number]> = {
  temperature: [-8, 45], // el Roque de los Muchachos sí hiela
  relativehumidity: [0, 100],
  atmosphericpressure: [700, 1050], // 700 hPa cubre 2400 m
  windspeed: [0, 200],
  uv: [0, 16],
  dewpoint: [-20, 30],
  co2: [300, 100_000], // las fumarolas llegan de verdad al 7 %
  pm25: [0, 1000], // la calima es extrema
}

/** Antigüedad máxima por defecto de una lectura meteorológica. */
export const MAX_AGE_H = 2

export interface Station {
  entityId: string
  name: string
  lon: number
  lat: number
  /** Altitud del DEM, no de la API: la API no publica ninguna. */
  elevation: number
  timeinstant: number // epoch ms (UTC)
  ageHours: number
  temperature: number | null
  relativehumidity: number | null
  dewpoint: number | null
  windspeed: number | null
  winddirection: number | null
  precipitation: number | null
  dailyprecipitation: number | null
  /** SIEMPRE reducida al nivel del mar — ver `normalizePressure`. */
  atmosphericpressure: number | null
  /** true si la estación publicaba presión absoluta y se ha reducido aquí. */
  pressureWasReduced: boolean
  uv: number | null
  solarradiation: number | null
  /** Fila cruda, para el panel «todos los valores» de la estación. */
  raw: CdaRow
}

export type Freshness = 'live' | 'recent' | 'dead'

export function freshness(ageHours: number): Freshness {
  if (ageHours < 1) return 'live'
  if (ageHours < 24) return 'recent'
  return 'dead'
}

export interface UsableOptions {
  now?: number
  maxAgeH?: number
  /** Métricas que deben existir y estar dentro de límites. */
  require?: readonly string[]
}

/**
 * ¿Se puede usar esta fila para interpolar?
 *
 * Rechaza: sin timestamp, rancia, métrica nula, valor implausible, o
 * coordenadas fuera de la isla (hay dos estaciones en mitad del Atlántico).
 */
export function usable(row: CdaRow, opts: UsableOptions = {}): boolean {
  const { now = Date.now(), maxAgeH = MAX_AGE_H, require = ['temperature'] } = opts

  const t = parseTimeinstant(row.timeinstant)
  if (t === null) return false
  if ((now - t) / 3_600_000 > maxAgeH) return false
  // Un timestamp en el futuro es un reloj roto, no un dato fresquísimo.
  if (t - now > 30 * 60_000) return false

  for (const key of require) {
    const v = num(row[key])
    if (v === null) return false
    const b = BOUNDS[key]
    if (b && (v < b[0] || v > b[1])) return false
  }

  const loc = parseLocation(row.location)
  if (!loc) return false
  return inIslandBbox(loc[0], loc[1])
}

/**
 * Deduplica por `entityid`, NUNCA por `name`: existen dos estaciones distintas
 * llamadas `CABLPA-ELCHARCO`, a 2,4 km y 142 m la una de la otra. Ante empate
 * en entityid gana la lectura más reciente.
 */
export function dedupeByEntityId(rows: CdaRow[]): CdaRow[] {
  const best = new Map<string, CdaRow>()
  for (const row of rows) {
    const id = String(row.entityid ?? '')
    if (!id) continue
    const prev = best.get(id)
    if (!prev) {
      best.set(id, row)
      continue
    }
    const a = parseTimeinstant(row.timeinstant) ?? -Infinity
    const b = parseTimeinstant(prev.timeinstant) ?? -Infinity
    if (a > b) best.set(id, row)
  }
  return [...best.values()]
}

export interface NetworkCensus {
  total: number
  usable: number
  droppedStale: number
  droppedImplausible: number
  droppedOffIsland: number
  droppedNoMetric: number
}

/**
 * Convierte filas crudas en estaciones utilizables y devuelve el censo del
 * descarte. El denominador honesto es `total`, no el número de filas vivas.
 */
export function buildStations(
  rows: CdaRow[],
  elevationAt: (lon: number, lat: number) => number | null,
  opts: UsableOptions = {},
): { stations: Station[]; census: NetworkCensus } {
  const { now = Date.now(), maxAgeH = MAX_AGE_H } = opts
  const deduped = dedupeByEntityId(rows)
  const census: NetworkCensus = {
    total: deduped.length,
    usable: 0,
    droppedStale: 0,
    droppedImplausible: 0,
    droppedOffIsland: 0,
    droppedNoMetric: 0,
  }
  const stations: Station[] = []

  for (const row of deduped) {
    const t = parseTimeinstant(row.timeinstant)
    if (t === null) {
      census.droppedStale++
      continue
    }
    const ageHours = (now - t) / 3_600_000
    if (ageHours > maxAgeH || t - now > 30 * 60_000) {
      census.droppedStale++
      continue
    }
    const loc = parseLocation(row.location)
    if (!loc || !inIslandBbox(loc[0], loc[1])) {
      census.droppedOffIsland++
      continue
    }
    const temperature = num(row.temperature)
    if (temperature === null) {
      census.droppedNoMetric++
      continue
    }
    const [lo, hi] = BOUNDS.temperature
    if (temperature < lo || temperature > hi) {
      census.droppedImplausible++
      continue
    }
    const elevation = elevationAt(loc[0], loc[1])
    if (elevation === null) {
      census.droppedOffIsland++
      continue
    }

    const bounded = (key: string): number | null => {
      const v = num(row[key])
      if (v === null) return null
      const b = BOUNDS[key]
      return b && (v < b[0] || v > b[1]) ? null : v
    }

    stations.push({
      entityId: String(row.entityid ?? ''),
      name: String(row.name ?? 'Estación').replace(/_/g, ' '),
      lon: loc[0],
      lat: loc[1],
      elevation,
      timeinstant: t,
      ageHours,
      temperature,
      relativehumidity: bounded('relativehumidity'),
      dewpoint: bounded('dewpoint'),
      windspeed: bounded('windspeed'),
      winddirection: num(row.winddirection),
      precipitation: num(row.precipitation),
      // Índice 31 del esquema. En el histórico llega con el nombre equivocado
      // (`precipitationintensity` repetido), por eso se admiten las dos claves.
      dailyprecipitation: num(row.dailyprecipitation ?? row.precipitationintensity__31),
      ...(() => {
        const raw = bounded('atmosphericpressure')
        if (raw === null) return { atmosphericpressure: null, pressureWasReduced: false }
        const reduced = normalizePressure(raw, elevation, temperature)
        return {
          atmosphericpressure: reduced,
          pressureWasReduced: Math.abs(reduced - raw) > 0.05,
        }
      })(),
      uv: bounded('uv'),
      solarradiation: num(row.solarradiation),
      raw: row,
    })
    census.usable++
  }

  return { stations, census }
}
