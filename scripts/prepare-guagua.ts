/**
 * GTFS de TILP → la red de guaguas que la app puede enseñar.
 *
 * El feed publica dos cosas de naturaleza muy distinta, y aquí se separan a
 * conciencia:
 *
 *  1. LA RED. Qué líneas hay, cómo se llaman, hacia dónde van, por qué paradas
 *     pasan y por dónde discurren. Eso no caduca con el calendario: la línea
 *     100 sigue yendo de Santa Cruz a Barlovento por donde iba.
 *
 *  2. EL HORARIO. A qué hora sale cada viaje. Comprobado el 12 ago 2026: los
 *     cinco calendarios de servicio vencieron —el último, el 25 dic 2025— y no
 *     hay ni una excepción con fecha de 2026. Ese horario NO se puede anunciar
 *     como vigente.
 *
 * De lo segundo se extrae solo el volumen —cuántos viajes tenía cada línea y
 * cada parada, y entre qué horas— y siempre etiquetado como «última tabla
 * publicada». La diferencia importa: saber que por una parada pasaban 34
 * guaguas de lunes a viernes y por otra dos sigue siendo cierto sobre el
 * servicio que TILP diseñó, y es justo lo que distingue una parada de la línea
 * 300 de un apeadero de montaña. Lo que no se hace nunca es dar una hora de
 * paso concreta como si fuera a cumplirse.
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CKAN, PUBLIC, UA, getJson, log, warn, type CkanResource } from './shared.js'
import { haversineKm } from '../src/lib/geo.js'

const DATASET = 'transporte-publico-de-la-palma-paradas-y-lineas-de-guagua'
const OUT = 'guagua-red.json'

// --- Formato de salida -----------------------------------------------------
// Se documenta aquí y se consume en `src/lib/guagua/network.ts`; los dos
// ficheros describen la MISMA estructura y hay que cambiarlos a la vez.

interface DayCounts {
  weekday: number
  saturday: number
  sunday: number
}

interface RouteEntry {
  name: string
  longName: string
  /** Cabeceras de los viajes, de más frecuente a menos. */
  destinations: string[]
  /** Paradas distintas por las que pasa, sumando los dos sentidos. */
  stops: number
  /** Longitud del trazado más largo de la línea, en km. */
  lengthKm: number
  trips: DayCounts
  /** Primera y última salida de la última tabla publicada, día laborable. */
  first: string | null
  last: string | null
}

interface StopEntry {
  routes: string[]
  departures: DayCounts
  first: string | null
  last: string | null
}

interface GuaguaNetworkFile {
  generated: string
  source: string
  agency: { name: string; url: string }
  /** Última fecha de validez de `calendar.txt` (YYYY-MM-DD). */
  validUntil: string | null
  expired: boolean
  routes: Record<string, RouteEntry>
  stops: Record<string, StopEntry>
}

// --- Lectura del ZIP -------------------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const split = (line: string) => {
    // Los campos GTFS pueden llevar comas dentro de comillas.
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = !quoted
      } else if (c === ',' && !quoted) {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out
  }
  const head = split(lines[0]).map((h) => h.replace(/^\uFEFF/, '').trim())
  return lines.slice(1).map((l) => {
    const cells = split(l)
    const row: Record<string, string> = {}
    head.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()))
    return row
  })
}

/**
 * El ZIP se lee a mano: añadir una dependencia por ocho ficheros de texto no
 * compensa. Solo se soportan entradas STORE (0) y DEFLATE (8), que es lo que
 * produce cualquier generador de GTFS.
 */
async function readZip(buf: Buffer): Promise<Map<string, string>> {
  // `inflateRawSync`, no `unzipSync`: las entradas ZIP con método 8 son deflate
  // CRUDO, sin la cabecera zlib/gzip que `unzipSync` espera.
  const { inflateRawSync } = await import('node:zlib')
  const files = new Map<string, string>()
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue
    const method = buf.readUInt16LE(i + 8)
    const compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.toString('utf8', i + 30, i + 30 + nameLen)
    const start = i + 30 + nameLen + extraLen
    // compSize 0 significa que el tamaño va en un descriptor detrás de los
    // datos; ese caso no aparece en este feed y no se adivina.
    if (!compSize) continue
    const raw = buf.subarray(start, start + compSize)
    try {
      files.set(name, method === 0 ? raw.toString('utf8') : inflateRawSync(raw).toString('utf8'))
    } catch {
      /* entrada que no interesa */
    }
  }
  return files
}

// --- Tipos de día ----------------------------------------------------------
//
// `calendar.txt` da los días de la semana de cada servicio; `calendar_dates.txt`
// solo quita festivos concretos, así que no cambia el patrón semanal y no se
// mira aquí. Un servicio cuenta como «laborable» si opera cualquier día de
// lunes a viernes: en este feed no hay ninguno que opere, por ejemplo, solo los
// martes, y tratar los cinco días por separado multiplicaría el fichero por
// cinco para decir lo mismo.

type DayType = keyof DayCounts

function dayTypesOf(cal: Record<string, string>): Set<DayType> {
  const on = (k: string) => cal[k] === '1'
  const out = new Set<DayType>()
  if (on('monday') || on('tuesday') || on('wednesday') || on('thursday') || on('friday')) {
    out.add('weekday')
  }
  if (on('saturday')) out.add('saturday')
  if (on('sunday')) out.add('sunday')
  return out
}

const zeroCounts = (): DayCounts => ({ weekday: 0, saturday: 0, sunday: 0 })

/** `07:05:00` → `07:05`. GTFS admite horas ≥ 24 y se dejan como vienen. */
const hhmm = (t: string): string | null => (/^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5) : null)

// --- Preparación -----------------------------------------------------------

export async function prepareGuagua(): Promise<void> {
  const pkg = await getJson<{ result: { resources: CkanResource[] } }>(
    `${CKAN}/package_show?id=${DATASET}`,
  )
  const res = pkg.result.resources.find((r) => (r.format ?? '').toUpperCase() === 'GTFS')
  if (!res) {
    warn('GTFS: no hay recurso en el catálogo')
    return
  }

  const buf = Buffer.from(await (await fetch(res.url, { headers: UA })).arrayBuffer())
  const files = await readZip(buf)

  const agencies = parseCsv(files.get('agency.txt') ?? '')
  const routes = parseCsv(files.get('routes.txt') ?? '')
  const trips = parseCsv(files.get('trips.txt') ?? '')
  const stopTimes = parseCsv(files.get('stop_times.txt') ?? '')
  const calendar = parseCsv(files.get('calendar.txt') ?? '')
  const shapes = parseCsv(files.get('shapes.txt') ?? '')

  if (!routes.length || !trips.length || !stopTimes.length) {
    warn('GTFS: el feed no trae rutas, viajes u horarios; se deja el fichero anterior')
    return
  }

  const daysOfService = new Map<string, Set<DayType>>(
    calendar.map((c) => [c.service_id, dayTypesOf(c)]),
  )

  // --- Trazados: longitud del más largo de cada línea ----------------------
  const shapeLength = new Map<string, number>()
  {
    const points = new Map<string, [number, number][]>()
    for (const s of shapes) {
      const lat = Number(s.shape_pt_lat)
      const lon = Number(s.shape_pt_lon)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
      if (!points.has(s.shape_id)) points.set(s.shape_id, [])
      points.get(s.shape_id)!.push([lon, lat])
    }
    for (const [id, pts] of points) {
      let km = 0
      for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i])
      shapeLength.set(id, km)
    }
  }

  // --- Viajes ---------------------------------------------------------------
  interface TripInfo {
    routeId: string
    days: Set<DayType>
    headsign: string
    shapeId: string
  }
  const tripInfo = new Map<string, TripInfo>()
  for (const t of trips) {
    tripInfo.set(t.trip_id, {
      routeId: t.route_id,
      days: daysOfService.get(t.service_id) ?? new Set<DayType>(),
      headsign: (t.trip_headsign ?? '').trim(),
      shapeId: t.shape_id ?? '',
    })
  }

  // --- Recorrido de cada viaje, ordenado ------------------------------------
  const timesByTrip = new Map<string, Record<string, string>[]>()
  for (const st of stopTimes) {
    if (!tripInfo.has(st.trip_id)) continue
    if (!timesByTrip.has(st.trip_id)) timesByTrip.set(st.trip_id, [])
    timesByTrip.get(st.trip_id)!.push(st)
  }
  for (const rows of timesByTrip.values()) {
    rows.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence))
  }

  // --- Agregados por línea y por parada -------------------------------------
  const routeStops = new Map<string, Set<string>>()
  const routeTrips = new Map<string, DayCounts>()
  const routeHeadsigns = new Map<string, Map<string, number>>()
  const routeShapes = new Map<string, Set<string>>()
  /** Salidas de cabecera en día laborable, para el primera/última de la línea. */
  const routeDepartures = new Map<string, string[]>()

  const stopRoutes = new Map<string, Set<string>>()
  const stopCounts = new Map<string, DayCounts>()
  const stopWeekdayTimes = new Map<string, string[]>()

  const bump = (m: Map<string, DayCounts>, key: string, days: Set<DayType>) => {
    if (!m.has(key)) m.set(key, zeroCounts())
    const c = m.get(key)!
    for (const d of days) c[d]++
  }

  for (const [tripId, rows] of timesByTrip) {
    const info = tripInfo.get(tripId)!
    const r = info.routeId

    bump(routeTrips, r, info.days)
    if (info.headsign) {
      if (!routeHeadsigns.has(r)) routeHeadsigns.set(r, new Map())
      const h = routeHeadsigns.get(r)!
      h.set(info.headsign, (h.get(info.headsign) ?? 0) + 1)
    }
    if (info.shapeId) {
      if (!routeShapes.has(r)) routeShapes.set(r, new Set())
      routeShapes.get(r)!.add(info.shapeId)
    }
    const start = hhmm(rows[0]?.departure_time ?? rows[0]?.arrival_time ?? '')
    if (start && info.days.has('weekday')) {
      if (!routeDepartures.has(r)) routeDepartures.set(r, [])
      routeDepartures.get(r)!.push(start)
    }

    for (const st of rows) {
      const id = st.stop_id
      if (!routeStops.has(r)) routeStops.set(r, new Set())
      routeStops.get(r)!.add(id)
      if (!stopRoutes.has(id)) stopRoutes.set(id, new Set())
      stopRoutes.get(id)!.add(r)
      bump(stopCounts, id, info.days)
      const at = hhmm(st.departure_time || st.arrival_time || '')
      if (at && info.days.has('weekday')) {
        if (!stopWeekdayTimes.has(id)) stopWeekdayTimes.set(id, [])
        stopWeekdayTimes.get(id)!.push(at)
      }
    }
  }

  // --- Fichero de salida ----------------------------------------------------

  const routeName: Record<string, string> = {}
  for (const r of routes) {
    routeName[r.route_id] = r.route_short_name || r.route_long_name || r.route_id
  }
  /** Orden natural de líneas: 2, 4, 11, 100 — no 100, 11, 2. */
  const byLine = (a: string, b: string) => {
    const na = Number(routeName[a] ?? a)
    const nb = Number(routeName[b] ?? b)
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
    return (routeName[a] ?? a).localeCompare(routeName[b] ?? b, 'es')
  }

  const routeOut: Record<string, RouteEntry> = {}
  for (const r of routes) {
    const id = r.route_id
    const deps = routeDepartures.get(id) ?? []
    deps.sort()
    const lengths = [...(routeShapes.get(id) ?? [])].map((s) => shapeLength.get(s) ?? 0)
    routeOut[id] = {
      name: routeName[id],
      longName: (r.route_long_name || '').trim(),
      destinations: [...(routeHeadsigns.get(id) ?? new Map())]
        .sort((a, b) => b[1] - a[1])
        .map(([h]) => h),
      stops: routeStops.get(id)?.size ?? 0,
      lengthKm: lengths.length ? Math.round(Math.max(...lengths) * 10) / 10 : 0,
      trips: routeTrips.get(id) ?? zeroCounts(),
      first: deps[0] ?? null,
      last: deps[deps.length - 1] ?? null,
    }
  }

  const stopOut: Record<string, StopEntry> = {}
  for (const [id, set] of stopRoutes) {
    const times = (stopWeekdayTimes.get(id) ?? []).sort()
    stopOut[id] = {
      routes: [...set].sort(byLine),
      departures: stopCounts.get(id) ?? zeroCounts(),
      first: times[0] ?? null,
      last: times[times.length - 1] ?? null,
    }
  }

  const endDates = calendar.map((c) => c.end_date).filter(Boolean).sort()
  const last = endDates[endDates.length - 1] ?? null
  const validUntil = last ? `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}` : null
  const expired = validUntil !== null && validUntil < new Date().toISOString().slice(0, 10)

  const out: GuaguaNetworkFile = {
    generated: new Date().toISOString(),
    source: res.url,
    agency: {
      name: agencies[0]?.agency_name || 'Transportes Insulares La Palma',
      url: agencies[0]?.agency_url || 'https://www.tilp.es/',
    },
    validUntil,
    expired,
    routes: routeOut,
    stops: stopOut,
  }

  await writeFile(path.join(PUBLIC, OUT), JSON.stringify(out))
  log(
    `GTFS: ${routes.length} líneas, ${Object.keys(stopOut).length} paradas con servicio,` +
      ` ${timesByTrip.size} viajes · validez hasta ${validUntil}` +
      `${expired ? ' (CADUCADA — sin horas de paso en la app)' : ''}`,
  )
}
