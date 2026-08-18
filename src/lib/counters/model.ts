/**
 * Aforos: quién pasa por un sitio y cuántos son.
 *
 * La trampa de esta red está en el nombre de sus dos endpoints, y cuesta caro
 * no verla. `count_today` NO es el acumulado del día: es el último intervalo
 * publicado, de unos cinco minutos. Comprobado el 12 ago 2026 de dos maneras
 * independientes: pidiéndolo dos veces seguidas, `CS04_peatones` pasó de 2/0 a
 * las 22:12 a 0/0 a las 22:17 —un acumulado no baja—; y a esa misma hora
 * `CC09_coches` daba 3/10 mientras `count_historic` fechado ese mismo día daba
 * 8.697/11.048. Enseñar el «today» como el día sería contar 13 coches en la
 * entrada de Santa Cruz.
 *
 * Así que las cifras del día salen de `count_historic` —que sí incluye el día
 * en curso, acumulándose— y `count_today` se usa para lo único que sabe: si el
 * aforo está vivo AHORA y a qué hora habló por última vez.
 *
 * El segundo cuidado son los peatones de carretera: en los emplazamientos CC
 * publican una sola dirección y la otra llega a `null` (97 de 145 filas de la
 * semana). Un `null` que se sume como 0 convierte un conteo de un sentido en un
 * total de dos sin que se note.
 */

import { num, parseLocation, parseTimeinstant, type CdaRow } from '../cabildo'
import { n, n0 } from '../../i18n'

/** Los CC son cruces y carreteras; los CS, accesos a senderos. */
export type CounterKind = 'road' | 'trail'

export interface CounterChannel {
  entityId: string
  siteId: string
  /**
   * Nombre del canal, que no siempre es el del emplazamiento: en `CS06` hay
   * dos senderos contados en el mismo punto —Pico de las Nieves y Virgen del
   * Pino—, con sus propios canales `_bicicletas1` y `_bicicletas2`.
   */
  name: string
  /** `coches`, `motos`, `pesados`, `bicicletas`, `peatones`, `vehiculos`. */
  type: string
  /** Cómo llama la fuente a cada sentido. En los CS suele ser entrada/salida. */
  incomingLabel: string | null
  outgoingLabel: string | null
}

export interface DayCount {
  /** `YYYY-MM-DD`, día de la isla. */
  day: string
  incoming: number | null
  outgoing: number | null
}

export interface Pulse {
  /** Epoch ms del último intervalo publicado. */
  at: number
  incoming: number | null
  outgoing: number | null
}

export interface ChannelSeries extends CounterChannel {
  /** Un día por fila, en orden ascendente. */
  days: DayCount[]
  /** Último intervalo de `count_today`, o null si hoy este canal calla. */
  pulse: Pulse | null
}

export interface CounterSite {
  id: string
  name: string
  kind: CounterKind
  lon: number
  lat: number
  channels: ChannelSeries[]
  /**
   * Pasos contados hoy, sumando SOLO lo que la fuente publica. Donde un
   * sentido llega a `null` no se cuenta como cero: no se cuenta.
   */
  todayTotal: number | null
  /** Instante del pulso más reciente de todo el emplazamiento. */
  lastPulse: number | null
}

/**
 * El denominador honesto de la red, que no es uno solo:
 * registrados ≠ con datos esta semana ≠ publicando hoy.
 */
export interface CounterCensus {
  registeredChannels: number
  registeredSites: number
  weekChannels: number
  weekSites: number
  liveChannels: number
  liveSites: number
}

/** `count_historic` fecha `DD-MM-YYYY` — el único endpoint que lo hace así. */
export function parseHistoricDay(ts: unknown): string | null {
  if (typeof ts !== 'string') return null
  const m = ts.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * Miles abreviados: en la entrada de Santa Cruz caben 20.000 pasos al día.
 *
 * Vivía en `CounterMarker.ts`, junto al marcador del DOM, y eso obligaba a
 * arrastrar `document.createElement` para poder escribir «8,7 k». Es una regla
 * de cómo se lee una cifra de esta red, no de cómo se dibuja: va con el modelo,
 * que es lo que se comparte fuera del navegador.
 */
export function compactCount(value: number): string {
  if (value < 1000) return n0(value)
  if (value < 10_000) return `${n(value / 1000, 1)} k`
  return `${n0(value / 1000)} k`
}

export function siteIdOf(entityId: string): string {
  const i = entityId.indexOf('_')
  return i === -1 ? entityId : entityId.slice(0, i)
}

export function kindOf(siteId: string): CounterKind {
  return siteId.startsWith('CS') ? 'trail' : 'road'
}

/**
 * `count_today` llama al canal «Acceso Tigalate Bicicletas» y `count_historic`
 * al mismo canal «Acceso Tigalate » —con el espacio de más—. Se quita el tipo
 * del final cuando está, para que las dos fuentes den el mismo nombre.
 */
export function cleanChannelName(raw: unknown, type: string): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!type) return name
  const suffix = new RegExp(`\\s+${type}$`, 'i')
  return name.replace(suffix, '').trim()
}

/**
 * El nombre del emplazamiento a partir de los de sus canales: el prefijo común,
 * cortado en palabra entera. En `CS06` los canales son «Acceso Sendero Hilera -
 * Pico de las Nieves» y «… - Virgen del Pino», y el sitio es «Acceso Sendero
 * Hilera». Con un solo nombre, es ese nombre.
 */
export function commonSiteName(names: readonly string[]): string {
  const uniq = [...new Set(names.filter(Boolean))]
  if (uniq.length <= 1) return uniq[0] ?? ''
  const words = uniq.map((n) => n.split(' '))
  const out: string[] = []
  for (let i = 0; i < words[0].length; i++) {
    const w = words[0][i]
    if (!words.every((ws) => ws[i] === w)) break
    out.push(w)
  }
  const joined = out.join(' ').replace(/[\s\-–—:,]+$/, '').trim()
  return joined || uniq[0]
}

function coordsOf(row: CdaRow): [number, number] | null {
  // La columna de geometría cambia de nombre según el endpoint: `location` en
  // `count_today`, `geometry` en `count_historic` y en `count_locations`.
  return parseLocation(row.location) ?? parseLocation(row.geometry)
}

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s && s !== 'NA' ? s : null
}

/** Suma que no inventa: un `null` no vale 0, y si no hay nada devuelve null. */
export function sumPublished(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null)
  return present.length ? present.reduce((a, b) => a + b, 0) : null
}

interface BuildInput {
  /** Filas de `count_historic`, la ventana entera incluido el día en curso. */
  historic: CdaRow[]
  /** Filas de `count_today`: el pulso, no el día. */
  today: CdaRow[]
  /** Filas de `count_locations`: el inventario, solo para el censo. */
  inventory?: CdaRow[]
  /** Día de la isla en curso, `YYYY-MM-DD`. */
  todayKey: string
}

/**
 * Cruza los tres endpoints en emplazamientos dibujables.
 *
 * Entra un aforo si publicó algo en la ventana histórica, aunque hoy calle: los
 * que se han quedado mudos esta mañana son justo los que hay que poder ver
 * mudos. Lo que no tiene ni una fila en la semana no se dibuja, y solo cuenta
 * en el censo.
 */
export function buildSites({ historic, today, inventory = [], todayKey }: BuildInput): {
  sites: CounterSite[]
  census: CounterCensus
} {
  const pulses = new Map<string, Pulse>()
  const coords = new Map<string, [number, number]>()
  const labels = new Map<string, CounterChannel>()

  for (const r of today) {
    const entityId = String(r.entityid ?? '')
    if (!entityId) continue
    // `count_today.timeinstant` es `YYYY-MM-DD HH:MM:SS.f` en UTC, igual que
    // el resto de la plataforma: lo lee el mismo parser que el meteo.
    const at = parseTimeinstant(r.timeinstant)
    if (at !== null) {
      pulses.set(entityId, {
        at,
        incoming: num(r.numberofincoming),
        outgoing: num(r.numberofoutgoing),
      })
    }
    const c = coordsOf(r)
    if (c) coords.set(entityId, c)
  }

  // De peor a mejor fuente del nombre, porque cada vuelta pisa a la anterior.
  // El inventario nombra los dos senderos de `CS06` igual —«Acceso Sendero
  // Hilera Peatones» los dos—, mientras que el histórico y el pulso sí los
  // distinguen; si ganara el inventario, dos senderos distintos contados en el
  // mismo punto pasarían a ser el mismo con la cifra repetida.
  for (const r of [...inventory, ...today, ...historic]) {
    const entityId = String(r.entityid ?? '')
    if (!entityId) continue
    const type = String(r.countertype ?? '').trim()
    const name = cleanChannelName(r.name, type)
    const prev = labels.get(entityId)
    labels.set(entityId, {
      entityId,
      siteId: siteIdOf(entityId),
      name: name || prev?.name || entityId,
      type: type || prev?.type || '',
      incomingLabel: str(r.incomingdescription) ?? prev?.incomingLabel ?? null,
      outgoingLabel: str(r.outgoingdescription) ?? prev?.outgoingLabel ?? null,
    })
    if (!coords.has(entityId)) {
      const c = coordsOf(r)
      if (c) coords.set(entityId, c)
    }
  }

  const days = new Map<string, DayCount[]>()
  for (const r of historic) {
    const entityId = String(r.entityid ?? '')
    const day = parseHistoricDay(r.timeinstant)
    if (!entityId || !day) continue
    const incoming = num(r.numberofincoming)
    const outgoing = num(r.numberofoutgoing)
    const list = days.get(entityId) ?? []
    list.push({ day, incoming, outgoing })
    days.set(entityId, list)
  }
  for (const list of days.values()) list.sort((a, b) => a.day.localeCompare(b.day))

  const bySite = new Map<string, ChannelSeries[]>()
  for (const [entityId, list] of days) {
    const meta = labels.get(entityId)
    if (!meta) continue
    const channels = bySite.get(meta.siteId) ?? []
    channels.push({ ...meta, days: list, pulse: pulses.get(entityId) ?? null })
    bySite.set(meta.siteId, channels)
  }

  const sites: CounterSite[] = []
  for (const [id, channels] of bySite) {
    const point = channels.map((c) => coords.get(c.entityId)).find(Boolean)
    if (!point) continue // sin coordenadas no hay pin, y hay 13 así en el inventario
    channels.sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type))
    const todayValues = channels.flatMap((c) => {
      const d = c.days.find((x) => x.day === todayKey)
      return d ? [d.incoming, d.outgoing] : []
    })
    const pulseTimes = channels
      .map((c) => c.pulse?.at)
      .filter((x): x is number => typeof x === 'number')
    sites.push({
      id,
      name: commonSiteName(channels.map((c) => c.name)) || id,
      kind: kindOf(id),
      lon: point[0],
      lat: point[1],
      channels,
      todayTotal: sumPublished(todayValues),
      lastPulse: pulseTimes.length ? Math.max(...pulseTimes) : null,
    })
  }
  sites.sort((a, b) => (b.todayTotal ?? -1) - (a.todayTotal ?? -1))

  const registered = new Set(inventory.map((r) => String(r.entityid ?? '')).filter(Boolean))
  const live = new Set(pulses.keys())
  return {
    sites,
    census: {
      registeredChannels: registered.size,
      registeredSites: new Set([...registered].map(siteIdOf)).size,
      weekChannels: days.size,
      weekSites: new Set([...days.keys()].map(siteIdOf)).size,
      liveChannels: live.size,
      liveSites: new Set([...live].map(siteIdOf)).size,
    },
  }
}
