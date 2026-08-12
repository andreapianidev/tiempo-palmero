/**
 * Perfil vertical de la atmósfera libre, leído de los niveles de presión de un
 * modelo numérico.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Hasta ahora, por encima del techo de la red se
 * pedía a Open-Meteo `temperature_2m` forzando `elevation=`. Eso NO es una
 * medida en altura: es el valor de superficie de la celda del modelo trasladado
 * con un gradiente CONSTANTE. Está en su código (`GenericReader.swift`):
 *
 *     data[i] += (modelElevation - targetElevation) * 0.0065
 *
 * Medido el 12 ago 2026 contra la estación real del Roque (TNG, 2387 m), sobre
 * 24 h horarias: ese ancla se equivocaba **8,20 K** de media. El mismo punto
 * sacado de los niveles de presión se equivoca **1,27 K**. Seis veces mejor.
 *
 * Y con la humedad no es un sesgo, es peor: ese `+= 0.0065` solo toca la
 * temperatura, y el punto de rocío se traslada en paralelo, así que la humedad
 * relativa sale IDÉNTICA a 10, 900, 1560 y 2426 m. Las anclas de humedad que
 * teníamos no llevaban ninguna información vertical. No eran imprecisas: eran
 * constantes.
 *
 * La razón física de que un gradiente fijo no sirva aquí es la **inversión del
 * alisio**: entre ~800 y ~1500 m la temperatura deja de bajar, y a menudo sube.
 * Aplicarle −0,65 K/100 m no es aproximar, es invertirle el signo. Medido en la
 * red del Cabildo el 12 ago 2026: de noche, sin sol sobre los sensores, la
 * estación de 1177 m está 2,6 °C MÁS CALIENTE que la costa. Y en la literatura
 * canaria la inversión aparece en el 92,4 % de los sondeos de Güímar
 * (2003–2021) y en el 95,05 % de los de verano.
 *
 * QUÉ HACE ESTE MÓDULO, Y QUÉ NO. Da el perfil de la atmósfera LIBRE: T y punto
 * de rocío contra altitud, sin imponer ninguna recta, tal y como el modelo los
 * resuelve. No sustituye a las estaciones —dentro de la red el motor actual es
 * mejor (MAE 1,32 K contra 1,57 K del modelo desnudo)— sino que sirve de fondo
 * allí donde no hay ninguna. Es el esquema de TopoSCALE (Fiddes y Gruber 2014,
 * doi:10.5194/gmd-7-387-2014): interpolar en altura geopotencial entre los dos
 * niveles que encierran el punto, sin gradiente impuesto.
 *
 * Se transporta el PUNTO DE ROCÍO, nunca la humedad relativa. La humedad
 * relativa depende de la temperatura, así que moverla en altura no significa
 * nada; el rocío es casi lineal y se comporta. Es lo que hacen MicroMet (Liston
 * y Elder 2006, §b.2, textual: «the relatively linear dewpoint temperature is
 * used for the elevation adjustments»), PRISM y meteoland. La humedad se
 * recompone abajo con Magnus-Tetens, igual que ya se hace en los pines.
 */

import { relativeHumidityFrom, clampHumidity } from './psychro'

/**
 * Niveles pedidos. Por debajo de 2426 m —la cumbre de la isla— caen siete:
 * ~165, 385, 608, 838, 1075, 1568 y 2089 m. El 700 hPa (~3223 m) entra solo
 * para que la cumbre nunca quede fuera del rango y haya que extrapolar.
 *
 * El salto de 900 a 850 hPa son ~490 m, y ese es el límite honesto de lo que
 * este perfil puede decir: detecta la inversión, pero no mide su espesor.
 */
export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700] as const

/**
 * Modelo EXPLÍCITO, nunca `best_match`.
 *
 * `best_match` mezcla modelos entre variables: medido el 12 ago 2026, servía la
 * temperatura de superficie de ECMWF, los niveles 925/900/850 de ICON y el 875
 * de GFS. Un perfil así cose dos atmósferas distintas y sus gradientes no
 * significan nada. ICON es además el único con buena cobertura de niveles y con
 * la orografía menos equivocada sobre La Palma (cree que el Roque está a 1055 m;
 * GFS y ECMWF 0,25° creen que está al nivel del mar).
 */
export const PROFILE_MODEL = 'icon_seamless'

export interface ProfileLevel {
  pressureHpa: number
  /** Altura geopotencial del nivel, en metros. */
  height: number
  temperature: number
  dewpoint: number
}

/** Variables que el perfil sabe dar a una altitud cualquiera. */
export type ProfileVariable = 'temperature' | 'dewpoint'

export interface Inversion {
  /** Altura del nivel donde empieza el tramo estable. */
  base: number
  top: number
  /** Salto térmico entre base y cima. Positivo = la temperatura sube. */
  deltaT: number
  /** Caída de humedad relativa entre base y cima, en puntos. Negativa. */
  deltaRh: number
  /**
   * Incertidumbre de `base` y `top`: la mitad del salto entre los dos niveles
   * que la encierran. NO es una medida del espesor —la rejilla de niveles es
   * más gruesa que la propia inversión, que en Güímar mide 210–393 m de mediana
   * (Carrillo 2017)— y por eso se publica junto a ellas.
   */
  resolutionM: number
}

export interface VerticalProfile {
  lon: number
  lat: number
  /** Ordenados por altura CRECIENTE, sin niveles bajo tierra. */
  levels: ProfileLevel[]
  /** Instante de la pasada del modelo (epoch ms, UTC). */
  observedAt: number
  inversion: Inversion | null
}

// ---------------------------------------------------------------------------
// Lectura del perfil a una altitud
// ---------------------------------------------------------------------------

/**
 * Interpola linealmente en altura geopotencial entre los dos niveles que
 * encierran `heightM`.
 *
 * NO extrapola: fuera del rango de niveles devuelve null. Extrapolar es
 * exactamente el error que este módulo viene a corregir, y no se va a repetir
 * aquí con otro nombre. Con el 700 hPa dentro, el rango llega a ~3200 m y la
 * cumbre de la isla (2426 m) nunca se sale.
 */
export function sampleProfile(
  profile: VerticalProfile,
  heightM: number,
  variable: ProfileVariable,
): number | null {
  const ls = profile.levels
  if (ls.length < 2) return null
  if (heightM < ls[0].height || heightM > ls[ls.length - 1].height) return null

  for (let i = 1; i < ls.length; i++) {
    const hi = ls[i]
    if (heightM > hi.height) continue
    const lo = ls[i - 1]
    const span = hi.height - lo.height
    if (span <= 0) return lo[variable]
    const f = (heightM - lo.height) / span
    return lo[variable] + f * (hi[variable] - lo[variable])
  }
  return null
}

/** Humedad relativa a esa altitud, recompuesta de T y rocío. Nunca transportada. */
export function humidityAt(profile: VerticalProfile, heightM: number): number | null {
  const t = sampleProfile(profile, heightM, 'temperature')
  const td = sampleProfile(profile, heightM, 'dewpoint')
  if (t === null || td === null) return null
  const rh = clampHumidity(relativeHumidityFrom(t, td))
  return Number.isFinite(rh) ? rh : null
}

// ---------------------------------------------------------------------------
// Diagnóstico de la inversión
// ---------------------------------------------------------------------------

/** Gradiente por encima del cual un tramo cuenta como estable, en K/100 m. */
const STABLE_GRADIENT_K_PER_100M = -0.2
/** Caída mínima de humedad relativa entre base y cima, en puntos. */
const MIN_HUMIDITY_DROP_PP = -20
/** Ventana de búsqueda. Fuera de ella no es la inversión del alisio. */
const SEARCH_WINDOW_M: [number, number] = [200, 2500]

/**
 * Localiza la inversión del alisio con el criterio de la literatura canaria:
 * tramo con gradiente ≥ −0,2 K/100 m Y caída de humedad relativa de más de 20
 * puntos entre base y cima (Torres, Cuevas, Guerra y Carreño 2002). La caída de
 * humedad es lo que separa la inversión de subsidencia de una radiativa, y no
 * es opcional: sin ella, cualquier capa isoterma nocturna daría un falso
 * positivo.
 *
 * Si aparece más de una, se queda la de mayor caída de humedad — la más baja de
 * las dos suele ser un fenómeno de temperatura superficial del mar, no el alisio
 * (Ramseyer y Miller 2021, doi:10.1002/joc.7151).
 *
 * Devuelve null cuando no la hay, que también es una respuesta: en Güímar falta
 * en el 5 % de los sondeos de verano y en el 10 % de los de invierno.
 */
export function detectInversion(levels: readonly ProfileLevel[]): Inversion | null {
  let best: Inversion | null = null

  for (let i = 1; i < levels.length; i++) {
    const lo = levels[i - 1]
    const hi = levels[i]
    if (lo.height < SEARCH_WINDOW_M[0] || lo.height > SEARCH_WINDOW_M[1]) continue

    const span = hi.height - lo.height
    if (span <= 0) continue
    const gradient = ((hi.temperature - lo.temperature) / span) * 100
    if (gradient < STABLE_GRADIENT_K_PER_100M) continue

    const rhLo = clampHumidity(relativeHumidityFrom(lo.temperature, lo.dewpoint))
    const rhHi = clampHumidity(relativeHumidityFrom(hi.temperature, hi.dewpoint))
    if (!Number.isFinite(rhLo) || !Number.isFinite(rhHi)) continue
    const deltaRh = rhHi - rhLo
    if (deltaRh > MIN_HUMIDITY_DROP_PP) continue

    if (!best || deltaRh < best.deltaRh) {
      best = {
        base: lo.height,
        top: hi.height,
        deltaT: hi.temperature - lo.temperature,
        deltaRh,
        resolutionM: span / 2,
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Descarga
// ---------------------------------------------------------------------------

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

interface CurrentBlock {
  time?: string
  [key: string]: unknown
}

/**
 * `current.time` viene en UTC pero SIN sufijo de zona (`2026-08-12T16:45`). Sin
 * la Z el navegador lo leería como hora local, que en Canarias en verano es una
 * hora de desfase. Duplica a propósito la lógica de `openmeteo.ts` en vez de
 * importarla: son dos respuestas distintas de la misma API y acoplarlas haría
 * que cambiar una rompiera la otra en silencio.
 */
export function parseModelTime(time: string | undefined): number {
  if (!time) return NaN
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(time)
  if (!m) return NaN
  return Date.parse(`${m[1]}${m[2] ?? ':00'}Z`)
}

/** Nombre de la variable de un nivel, tal y como lo pide y devuelve la API. */
const levelKey = (variable: string, hPa: number) => `${variable}_${hPa}hPa`

/**
 * Convierte un bloque `current` en un perfil, descartando lo que no se sostiene.
 *
 * Un nivel se cae si le falta cualquiera de los tres valores. Un nivel a medias
 * no es medio dato: mezclado con los buenos deforma el gradiente justo donde
 * más se nota. Un nivel inexistente —`temperature_12345hPa`— llega como `null`
 * con HTTP 200 y sin ningún error, así que este filtro es la única defensa.
 */
export function decodeProfile(
  current: CurrentBlock,
  lon: number,
  lat: number,
): VerticalProfile | null {
  const observedAt = parseModelTime(current.time)
  // Sin hora fiable no hay perfil. Caer en `Date.now()` presentaría una pasada
  // vieja como recién calculada, que es justo la mentira que la app no cuenta.
  if (!Number.isFinite(observedAt)) return null

  const levels: ProfileLevel[] = []
  for (const hPa of PRESSURE_LEVELS) {
    const height = current[levelKey('geopotential_height', hPa)]
    const temperature = current[levelKey('temperature', hPa)]
    const dewpoint = current[levelKey('dew_point', hPa)]
    if (
      typeof height !== 'number' ||
      typeof temperature !== 'number' ||
      typeof dewpoint !== 'number' ||
      !Number.isFinite(height) ||
      !Number.isFinite(temperature) ||
      !Number.isFinite(dewpoint)
    ) {
      continue
    }
    levels.push({ pressureHpa: hPa, height, temperature, dewpoint })
  }

  levels.sort((a, b) => a.height - b.height)
  if (levels.length < 2) return null

  return { lon, lat, levels, observedAt, inversion: detectInversion(levels) }
}

/**
 * Pide un perfil por punto, en UNA sola petición.
 *
 * Aquí NO se manda `elevation=`, y eso quita de encima un fallo desagradable ya
 * medido: con `elevation=2400` la API contesta 15,9 °C y con `elevation=2426`
 * contesta 13,0 °C, porque cambia de celda. Veintiséis metros, 2,9 K de salto, y
 * la serie forzada ni siquiera es monótona. Los niveles de presión no dependen
 * de ese parámetro.
 *
 * TAMPOCO se descartan los niveles «bajo tierra» que recomienda TopoSCALE. Ese
 * filtro se refiere a la orografía del MODELO —aquí ~1055 m, y solo se puede
 * leer con una consulta aparte (`elevation=nan`)—, nunca a la altitud del punto
 * que se pregunta. Aplicárselo al punto sería quitar justo los niveles que hay
 * que usar para encerrarlo: en la cumbre dejaría uno solo y no habría perfil.
 * Sobre una isla los niveles bajos describen el aire sobre el mar de al lado,
 * que es aire de verdad; y de todas formas solo se muestrea por encima del techo
 * de la red.
 */
export async function fetchProfiles(
  points: readonly { lon: number; lat: number }[],
  signal?: AbortSignal,
): Promise<VerticalProfile[]> {
  if (!points.length) return []

  const fields = PRESSURE_LEVELS.flatMap((hPa) => [
    levelKey('temperature', hPa),
    levelKey('dew_point', hPa),
    levelKey('geopotential_height', hPa),
  ])
  const url =
    `${OPEN_METEO_URL}?latitude=${points.map((p) => p.lat.toFixed(5)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(5)).join(',')}` +
    `&current=${fields.join(',')}` +
    `&models=${PROFILE_MODEL}&timezone=UTC`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo perfil: HTTP ${res.status}`)

  // NO se usa `res.json()`. Un modelo fuera de dominio contesta HTTP 200 con
  // `nan` SIN comillas en el cuerpo, que no es JSON válido: `JSON.parse` lanza
  // un `SyntaxError` que no dice nada de lo que ha pasado. Se lee el texto y se
  // reconoce el caso, para que el fallo se explique solo.
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    if (/:\s*nan\b/.test(text)) {
      throw new Error(`Open-Meteo perfil: el modelo ${PROFILE_MODEL} no cubre este punto`)
    }
    throw new Error('Open-Meteo perfil: respuesta ilegible')
  }

  // Con un solo punto la API devuelve un objeto; con varios, un array.
  const blocks: unknown[] = Array.isArray(body) ? body : [body]
  const out: VerticalProfile[] = []
  blocks.forEach((raw, i) => {
    const p = points[i]
    const current = (raw as { current?: CurrentBlock }).current
    if (!p || !current) return
    const profile = decodeProfile(current, p.lon, p.lat)
    if (profile) out.push(profile)
  })
  return out
}
