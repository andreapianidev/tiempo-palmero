/**
 * Cliente de la API del Cabildo Insular de La Palma (Pentaho CDA).
 *
 * Dos reglas que no se pueden relajar:
 *  1. Se decodifica POR ÍNDICE, nunca por nombre. `weatherobserved` sirve
 *     `precipitationintensity` dos veces (índices 17 y 31) y `Object.fromEntries`
 *     descarta la segunda en silencio.
 *  2. Los endpoints históricos necesitan `paramstart` Y `paramfinish`. Con uno
 *     solo devuelven 0 filas con esquema válido, que es indistinguible de un
 *     archivo vacío.
 */

export type Vertical =
  | 'environment'
  | 'skyobservation'
  | 'fireforest'
  | 'agro'
  | 'energyefficiency'
  | 'count'

export interface CdaPayload {
  metadata: { colName: string; colType: string; colIndex: number }[]
  resultset: unknown[][]
  queryInfo?: { totalRows: string | number }
}

export type CdaRow = Record<string, unknown>

/**
 * Decodifica por `colIndex`. Si un nombre está duplicado se conserva la
 * primera aparición bajo su nombre y la segunda como `nombre__<índice>`,
 * de forma que ningún valor se pierde.
 */
export function decode(payload: CdaPayload): CdaRow[] {
  const seen = new Map<string, number>()
  const keys = payload.metadata
    .slice()
    .sort((a, b) => a.colIndex - b.colIndex)
    .map((m) => {
      const n = seen.get(m.colName) ?? 0
      seen.set(m.colName, n + 1)
      return n === 0 ? m.colName : `${m.colName}__${m.colIndex}`
    })
  return payload.resultset.map((row) => {
    const out: CdaRow = {}
    for (let i = 0; i < keys.length; i++) out[keys[i]] = row[i]
    return out
  })
}

/** El servidor a veces responde 200 con un HTML «Unavailable» en vez de JSON. */
export function isCdaPayload(x: unknown): x is CdaPayload {
  return (
    !!x &&
    typeof x === 'object' &&
    Array.isArray((x as CdaPayload).metadata) &&
    Array.isArray((x as CdaPayload).resultset)
  )
}

export const PENTAHO_BASE = 'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery'

export function pentahoUrl(
  vertical: Vertical,
  dataAccessId: string,
  params: Record<string, string> = {},
): string {
  const q = new URLSearchParams({
    path: `/public/sc_lapalma/verticals/sql/${vertical}.cda`,
    _TRUST_USER_: 'opendata_sc_lapalma',
    dataAccessId,
    outputType: 'json',
    ...params,
  })
  return `${PENTAHO_BASE}?${q}`
}

export interface FetchOptions {
  tries?: number
  timeoutMs?: number
  /** Sustituye la URL final. El navegador va por /api/cda; Node va directo. */
  resolveUrl?: (vertical: Vertical, dataAccessId: string, params: Record<string, string>) => string
}

/** GET con reintentos escalonados. Un fallo transitorio no es «no hay datos». */
export async function fetchCda(
  vertical: Vertical,
  dataAccessId: string,
  params: Record<string, string> = {},
  opts: FetchOptions = {},
): Promise<CdaRow[]> {
  const { tries = 4, timeoutMs = 90_000, resolveUrl = pentahoUrl } = opts
  const url = resolveUrl(vertical, dataAccessId, params)
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetch(url, { signal: ctrl.signal })
        if (!res.ok) throw new Error(`${dataAccessId}: HTTP ${res.status}`)
        const json: unknown = await res.json()
        if (!isCdaPayload(json)) throw new Error(`${dataAccessId}: respuesta no JSON-CDA`)
        return decode(json)
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      last = err
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 3000 + i * 3000))
    }
  }
  throw last instanceof Error ? last : new Error(String(last))
}

// ---------------------------------------------------------------------------
// Parsing de campos concretos
// ---------------------------------------------------------------------------

/** `location` es un GeoJSON Point serializado como cadena. */
export function parseLocation(loc: unknown): [number, number] | null {
  if (!loc) return null
  try {
    const g = typeof loc === 'string' ? JSON.parse(loc) : loc
    const c = (g as { coordinates?: unknown }).coordinates
    if (Array.isArray(c) && c.length >= 2) {
      const lon = Number(c[0])
      const lat = Number(c[1])
      if (Number.isFinite(lon) && Number.isFinite(lat)) return [lon, lat]
    }
  } catch {
    /* cae abajo */
  }
  return null
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * `timeinstant` llega como `YYYY-MM-DD HH:MM:SS[.f]` sin sufijo de zona.
 *
 * Está en UTC, no en hora local de Canarias. Comprobado el 12 ago 2026: el
 * `timeinstant` más reciente era 08:48:00 cuando el reloj del propio servidor
 * marcaba 08:52 UTC. Si se interpretara como hora canaria (UTC+1) toda la red
 * parecería tener una hora más de la que tiene, lo que en el corte de 2 h
 * descarta estaciones vivas — y en el de 15 min del CO₂, todas.
 *
 * `new Date('2026-08-12 08:48:00')` lo lee como hora LOCAL del navegador, así
 * que no sirve: hay que construir el instante explícitamente en UTC.
 */
export function parseTimeinstant(ts: unknown): number | null {
  if (typeof ts !== 'string' || !ts) return null
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0'] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
}

/** Zona horaria de la isla, para presentar horas al usuario. */
export const ISLAND_TZ = 'Atlantic/Canary'

export function formatIslandTime(epochMs: number): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: ISLAND_TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epochMs))
}
