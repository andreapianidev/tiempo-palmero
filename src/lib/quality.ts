/**
 * Guardarraíles de calidad. El portal sirve sensores rotos, estaciones muertas
 * y coordenadas corruptas como filas normales, sin ninguna marca de calidad.
 * Nada de esto se puede saltar antes de pintar un número.
 */

import { inIslandBbox } from './geo'
import { num, parseLocation, parseTimeinstant, type CdaRow } from './cabildo'
import {
  clampHumidity,
  dewpointFrom,
  normalizePressure,
  relativeHumidityFrom,
  seaLevelReference,
  vapourPressureDeficit,
} from './psychro'

/** Límites de plausibilidad para La Palma (0–2426 m, subtropical). */
export const BOUNDS: Record<string, [number, number]> = {
  temperature: [-8, 45], // el Roque de los Muchachos sí hiela
  relativehumidity: [0, 100],
  atmosphericpressure: [700, 1050], // 700 hPa cubre 2400 m
  windspeed: [0, 200],
  uv: [0, 16],
  dewpoint: [-20, 30],
  // VPD. Es la envolvente FÍSICA, no un filtro de verosimilitud: con el techo
  // de 45 °C de `temperature` y 0 % de humedad salen 9,6 kPa, así que nada
  // legítimo puede pasar de ahí. Quien atrapa al sensor de humedad averiado no
  // es este límite —2,3 kPa con 1 % de humedad a 20 °C tiene aspecto de cifra
  // buena— sino el punto de rocío implícito, que se comprueba aparte en
  // `stationReading`.
  vpd: [0, 10],
  // La sensación térmica se mueve en el mismo rango físico que la temperatura:
  // puede separarse bastante de ella con viento o bochorno, pero no salirse de
  // lo que la isla admite.
  feellikestemperature: [-8, 45],
  // Lux a cielo abierto. El sol de mediodía en Canarias ronda los 100 000 y el
  // máximo medido en un día de histórico fue 89 258; por debajo de 0 no existe.
  illuminance: [0, 150_000],
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
  /**
   * Evapotranspiración de referencia acumulada del día, en mm.
   *
   * CUIDADO: la columna mezcla dos convenciones, igual que la presión, y aquí
   * NO se resuelve. Medido en vivo el 12 ago 2026 sobre las 37 estaciones
   * frescas: las 20 restantes dan 0 clavado; la familia `LaPalma_WSAQPM_*` da
   * 1,4–2,06 (mm acumulados del día, coherente con ~5 mm/día en agosto) y la
   * familia `CABLPA-*` da 0,066–0,089, dos órdenes de magnitud por debajo —
   * compatible con el acumulado de un solo intervalo, pero el portal no
   * documenta cuál.
   *
   * Por eso se enseña por estación y tal cual, nunca agregado ni interpolado:
   * una media de la isla mezclaría unidades distintas y saldría un número que
   * no significa nada. Mientras el publicador no lo aclare, no hay cifra de
   * evapotranspiración insular que se pueda afirmar.
   */
  dailyevapotranspiration: number | null
  /**
   * Sensación térmica, en °C.
   *
   * Se ENSEÑA REDONDEADA a propósito. Los valores que llegan son conversiones
   * exactas de grados Fahrenheit enteros: 17,222221 °C es 63 °F clavados y
   * 22,777778 °C es 73 °F clavados (comprobado el 12 ago 2026 sobre las 1635
   * filas no nulas de un día de histórico). Esa familia de sensores mide en
   * Fahrenheit y la plataforma convierte, así que la resolución real es de
   * 1 °F ≈ 0,56 °C. Un decimal aquí promete una precisión que el sensor no
   * tiene.
   */
  feellikestemperature: number | null
  /** Iluminancia en lux. 699 de 4939 filas del histórico, 101–89 258 lx. */
  illuminance: number | null
  /**
   * Visibilidad. Columna de tipo String, no numérica.
   *
   * VACÍA EN TODO EL ARCHIVO: 0 filas no nulas de las 4939 de un día de
   * histórico y 0 de las 52 de `_lastdata` (12 ago 2026). Se parsea y se pasa
   * al panel igualmente —son cuatro líneas y aparecerá sola el día que el
   * Cabildo la rellene—, pero hoy no se pinta nunca. No es un campo raro: es
   * un campo muerto, y conviene que quede escrito para que nadie lo persiga
   * como si fuera un fallo de la aplicación.
   */
  visibility: string | null
  /** Fila cruda, para el panel «todos los valores» de la estación. */
  raw: CdaRow
}

/** Las variables que la app pinta. Coincide con `DisplayVariable`. */
export type MeasuredVariable = 'temperature' | 'relativehumidity' | 'dewpoint' | 'vpd'

export interface Reading {
  value: number
  /** true si no lo publica la estación y se ha calculado con sus otras dos. */
  derived: boolean
}

/**
 * Qué vale una variable EN la estación.
 *
 * Temperatura, humedad y rocío no son tres medidas independientes: dadas dos,
 * la tercera está determinada (Magnus-Tetens, ver `psychro.ts`). Así que una
 * estación que publica T y RH sí dice cuál es su punto de rocío, aunque no
 * traiga la columna — son 19 de las 36 vivas, contra 10 que lo publican. Con
 * la regla anterior («un pin es una medida») esas 19 salían con un punto en
 * vez de una cifra, encima de una malla que sí estaba pintada y que se calcula
 * exactamente así: la incoherencia que la regla quería evitar.
 *
 * Lo que se calcula aquí se marca como calculado y la interfaz lo distingue;
 * lo que no sale ni con las dos columnas (6 estaciones, sin humedad ni rocío)
 * devuelve null y se queda sin número, que eso sí es no saberlo.
 */
/**
 * Un valor calculado pasa por el MISMO filtro de plausibilidad que uno medido.
 *
 * No hacerlo dejaba salir disparates con aspecto de dato: CABLPA BELLIDO
 * publica 1 % de humedad a 852 m —un sensor muerto, no un desierto—, y de ahí
 * salía un punto de rocío de −38,4 °C, pintado en el pin como si fuera una
 * cifra. `bounded()` ya vigila la columna publicada; la derivada se colaba
 * porque nacía después del filtro. Ese mismo 1 % daría 4,1 kPa de VPD, que el
 * límite de `BOUNDS.vpd` tumba por la misma razón.
 */
function deriveBounded(variable: MeasuredVariable, value: number): Reading | null {
  const b = BOUNDS[variable]
  if (!Number.isFinite(value)) return null
  if (b && (value < b[0] || value > b[1])) return null
  return { value, derived: true }
}

export function stationReading(s: Station, variable: MeasuredVariable): Reading | null {
  // El VPD no lo publica NINGUNA estación de la red: siempre se calcula, nunca
  // se lee. Por eso sale antes del `s[variable]`, que para esta clave no
  // existe en `Station`.
  if (variable === 'vpd') {
    if (s.temperature === null) return null
    const rh =
      s.relativehumidity ??
      (s.dewpoint !== null
        ? clampHumidity(relativeHumidityFrom(s.temperature, s.dewpoint))
        : null)
    if (rh === null) return null
    // La verosimilitud del VPD se juzga por el rocío que implica, no por el
    // propio VPD: su rango físico es tan ancho que un sensor de humedad
    // averiado cabe dentro. El 1 % de CABLPA BELLIDO a 852 m daría 2,3 kPa,
    // que parece una cifra buena, y −38,4 °C de rocío, que no lo parece.
    if (deriveBounded('dewpoint', dewpointFrom(s.temperature, rh)) === null) return null
    return deriveBounded('vpd', vapourPressureDeficit(s.temperature, rh))
  }

  const measured = s[variable]
  if (measured !== null) return { value: measured, derived: false }
  if (s.temperature === null) return null

  // Un valor calculado pasa por el MISMO filtro de plausibilidad que uno
  // medido. No hacerlo dejaba salir disparates con aspecto de dato: CABLPA
  // BELLIDO publica 1 % de humedad a 852 m —un sensor muerto, no un desierto—,
  // y de ahí salía un punto de rocío de −38,4 °C, pintado en el pin como si
  // fuera una cifra. `bounded()` ya vigila la columna publicada; la derivada se
  // colaba porque nacía después del filtro.
  const derive = (value: number): Reading | null => deriveBounded(variable, value)

  if (variable === 'dewpoint' && s.relativehumidity !== null) {
    return derive(dewpointFrom(s.temperature, s.relativehumidity))
  }
  if (variable === 'relativehumidity' && s.dewpoint !== null) {
    return derive(clampHumidity(relativeHumidityFrom(s.temperature, s.dewpoint)))
  }
  return null
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

export type DropReason = 'stale' | 'implausible' | 'offIsland' | 'noMetric'

/**
 * Una estación que existe en la API pero no llega al mapa.
 *
 * Se guarda con NOMBRE, no solo como número, porque un contador no se puede
 * comprobar. «17 estaciones fuera del mapa» obliga a creérselo; «LAGUNA DE
 * BARLOVENTO lleva 3480 h sin transmitir» se puede ir a mirar.
 */
export interface DroppedStation {
  entityId: string
  name: string
  reason: DropReason
  /** Horas desde la última lectura. null si el timestamp no era legible. */
  ageHours: number | null
}

export interface NetworkCensus {
  total: number
  usable: number
  droppedStale: number
  droppedImplausible: number
  droppedOffIsland: number
  droppedNoMetric: number
  /** Las descartadas, con nombre y motivo. */
  dropped: DroppedStation[]
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
    dropped: [],
  }
  const stations: Station[] = []

  for (const row of deduped) {
    const t = parseTimeinstant(row.timeinstant)
    const age = t === null ? null : (now - t) / 3_600_000
    const drop = (reason: DropReason) => {
      census.dropped.push({
        entityId: String(row.entityid ?? ''),
        name: String(row.name ?? 'Estación').replace(/_/g, ' '),
        reason,
        ageHours: age,
      })
    }

    if (t === null) {
      census.droppedStale++
      drop('stale')
      continue
    }
    const ageHours = age as number
    if (ageHours > maxAgeH || t - now > 30 * 60_000) {
      census.droppedStale++
      drop('stale')
      continue
    }
    const loc = parseLocation(row.location)
    if (!loc || !inIslandBbox(loc[0], loc[1])) {
      census.droppedOffIsland++
      drop('offIsland')
      continue
    }
    const temperature = num(row.temperature)
    if (temperature === null) {
      census.droppedNoMetric++
      drop('noMetric')
      continue
    }
    const [lo, hi] = BOUNDS.temperature
    if (temperature < lo || temperature > hi) {
      census.droppedImplausible++
      drop('implausible')
      continue
    }
    const elevation = elevationAt(loc[0], loc[1])
    if (elevation === null) {
      census.droppedOffIsland++
      drop('offIsland')
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
      // Se guarda cruda; la convención se decide abajo, cuando ya se sabe qué
      // marca la red a nivel del mar. Ver `seaLevelReference`.
      atmosphericpressure: bounded('atmosphericpressure'),
      pressureWasReduced: false,
      uv: bounded('uv'),
      solarradiation: num(row.solarradiation),
      dailyevapotranspiration: num(row.dailyevapotranspiration),
      feellikestemperature: bounded('feellikestemperature'),
      illuminance: bounded('illuminance'),
      visibility: typeof row.visibility === 'string' && row.visibility ? row.visibility : null,
      raw: row,
    })
    census.usable++
  }

  // SEGUNDA PASADA: la presión.
  //
  // No se puede decidir estación por estación, porque para saber si una cifra
  // ya viene reducida al nivel del mar hace falta saber qué marca hoy la isla
  // al nivel del mar — y eso solo lo dicen las estaciones de costa, donde las
  // dos convenciones coinciden. Por eso se guarda cruda arriba y se normaliza
  // aquí, cuando la referencia ya existe. Ver `looksLikeStationPressure`.
  const reference =
    seaLevelReference(
      stations
        .filter((s) => s.atmosphericpressure !== null)
        .map((s) => ({ pressureHpa: s.atmosphericpressure as number, elevationM: s.elevation })),
    ) ?? undefined

  for (const s of stations) {
    if (s.atmosphericpressure === null) continue
    const raw = s.atmosphericpressure
    const reduced = normalizePressure(raw, s.elevation, s.temperature ?? 15, reference)
    s.atmosphericpressure = reduced
    s.pressureWasReduced = Math.abs(reduced - raw) > 0.05
  }

  return { stations, census }
}
