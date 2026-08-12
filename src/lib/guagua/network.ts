/**
 * La red de guaguas de TILP, tal y como la deja el script de build.
 *
 * Este módulo es el ÚNICO que conoce el formato de `/guagua-red.json`; lo
 * genera `scripts/prepare-guagua.ts` y los dos ficheros describen la misma
 * estructura, así que se cambian a la vez.
 *
 * Lo que aquí se llama «servicio» viene de un horario CADUCADO —el feed de
 * TILP no se renueva desde el 25 dic 2025— y por eso nunca se expone una hora
 * de paso concreta como si fuera a cumplirse: solo el volumen del servicio que
 * TILP llegó a publicar, siempre con la fecha de caducidad al lado. Quien
 * necesite saber a qué hora pasa la guagua mañana tiene que preguntarle a TILP,
 * y la ficha se lo dice.
 */

export interface DayCounts {
  weekday: number
  saturday: number
  sunday: number
}

export interface GuaguaRoute {
  name: string
  longName: string
  /** Cabeceras de los viajes, de más frecuente a menos. */
  destinations: string[]
  /** Paradas distintas por las que pasa, sumando los dos sentidos. */
  stops: number
  lengthKm: number
  trips: DayCounts
  first: string | null
  last: string | null
}

/**
 * Horas de paso de una línea EN UN SENTIDO, en minutos desde medianoche.
 *
 * Agrupar solo por línea perdía la mitad del servicio: en la parada 389 la 120
 * pasa a las 07:38 hacia Barlovento y a las 07:38 hacia Santo Domingo, y sin el
 * sentido una de las dos se deduplicaba con la otra.
 */
export interface StopTimes {
  /** A dónde va ese viaje. */
  d: string
  /** `w` laborables, `s` sábados, `u` domingos. */
  w: number[]
  s: number[]
  u: number[]
}

export interface GuaguaStopService {
  routes: string[]
  departures: DayCounts
  first: string | null
  last: string | null
  /** Por línea y sentido. Vienen del mismo horario caducado que las cuentas. */
  times: Record<string, StopTimes[]>
}

export interface GuaguaNetwork {
  generated: string
  source: string
  agency: { name: string; url: string }
  /** Última fecha de validez del calendario de TILP (YYYY-MM-DD). */
  validUntil: string | null
  expired: boolean
  routes: Record<string, GuaguaRoute>
  stops: Record<string, GuaguaStopService>
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

let promise: Promise<GuaguaNetwork | null> | null = null

/** Una sola descarga por sesión, compartida entre el mapa y «cerca de aquí». */
export function loadGuaguaNetwork(): Promise<GuaguaNetwork | null> {
  promise ??= fetch('/guagua-red.json')
    .then((r) => (r.ok ? (r.json() as Promise<GuaguaNetwork>) : null))
    .catch(() => null)
  return promise
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/**
 * Orden natural de líneas: 2, 4, 11, 100 — no 100, 11, 2.
 *
 * El identificador de línea es una cadena y ordenarlo como cadena pone la 100
 * antes que la 2, que es justo al revés de como las nombra cualquiera aquí.
 */
export function compareLines(net: GuaguaNetwork | null, a: string, b: string): number {
  const label = (id: string) => net?.routes[id]?.name ?? id
  const na = Number(label(a))
  const nb = Number(label(b))
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return label(a).localeCompare(label(b), 'es')
}

export function routeLabel(net: GuaguaNetwork | null, id: string): string {
  return net?.routes[id]?.name ?? id
}

/**
 * Accesibilidad de la parada, según `wheelchair_boarding` del GTFS.
 *
 * Las 913 paradas de TILP se reparten entre `2` (675: embarque en silla NO
 * posible) y `0` (238: sin información). Ninguna declara ser accesible, así que
 * la ficha no puede decir nunca que lo sea — y tampoco puede callarse el dato:
 * que dos de cada tres paradas de la isla estén marcadas como no accesibles es
 * exactamente la clase de cosa que alguien necesita saber antes de salir.
 */
export type WheelchairState = 'accessible' | 'notAccessible' | 'unknown'

export function wheelchairState(raw: unknown): WheelchairState {
  const v = String(raw ?? '').trim()
  if (v === '1') return 'accessible'
  if (v === '2') return 'notAccessible'
  return 'unknown'
}

/**
 * Cuánto servicio tenía la parada en la última tabla publicada.
 *
 * Los cortes salen de la distribución real de las 913 paradas: la mediana son
 * 15 salidas en día laborable, el máximo 348 (la estación de Santa Cruz) y el
 * mínimo 1. Con esos números, 30 separa bien las paradas de las líneas
 * troncales y 8 el apeadero rural del que tiene servicio de verdad.
 */
export type ServiceLevel = 'frequent' | 'regular' | 'sparse' | 'none'

export function serviceLevel(d: DayCounts | undefined): ServiceLevel {
  const n = d?.weekday ?? 0
  if (n >= 30) return 'frequent'
  if (n >= 8) return 'regular'
  if (n >= 1) return 'sparse'
  return 'none'
}

/**
 * 425 → `07:05`.
 *
 * Las horas ≥ 24 del GTFS —un viaje que sale antes de medianoche y para después—
 * se dejan como 24:15 en vez de convertirlas a 00:15: en una tabla de paso, un
 * 00:15 entre las 23:40 y las 23:55 parece un error de orden.
 */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** `2025-12-25` → `25/12/2025`, que es como se lee una fecha aquí. */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

// ---------------------------------------------------------------------------
// Lo que el mapa entrega al panel
// ---------------------------------------------------------------------------

/** Una parada tal y como la publica la capa `paradas-guagua.geojson`. */
export interface GuaguaStopPoint {
  stopId: string
  name: string
  code: string | null
  wheelchair: WheelchairState
  lon: number
  lat: number
}

const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return s && s !== 'null' ? s : null
}

export function readStop(
  props: Record<string, unknown>,
  lon: number,
  lat: number,
): GuaguaStopPoint {
  const stopId = str(props.stop_id) ?? ''
  return {
    stopId,
    // Sin nombre la parada sigue teniendo identidad: su código.
    name: str(props.nombre) ?? str(props.stop_code) ?? stopId,
    code: str(props.stop_code),
    wheelchair: wheelchairState(props.wheelchair_boarding),
    lon,
    lat,
  }
}
