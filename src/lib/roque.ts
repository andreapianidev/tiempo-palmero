/**
 * La cumbre: estación del TNG en el Roque de los Muchachos, 2387 m.
 *
 * POR QUÉ ESTA ESTACIÓN Y NO OTRA. La red del Cabildo se acaba mucho antes de
 * la cumbre —el techo se mueve entre 1200 y 1700 m según qué estaciones estén
 * vivas—, y todo lo que la aplicación dice por encima de ahí lo pone el perfil
 * vertical de un modelo. Esta es la única medida REAL a 2387 m de la que se
 * dispone, y es además la referencia contra la que se validó ese perfil: 8,20 K
 * de error con el ancla de superficie que había antes, 1,34 K con los niveles
 * de presión (ver `profile.ts`).
 *
 * NO ENTRA EN EL MOTOR, y es a propósito. Es un dato de un tercero, sin
 * compromiso de disponibilidad ni de calibración publicada, y meterlo en la
 * interpolación ataría el mapa de toda la isla a que un observatorio siga
 * sirviendo un JSON. Se enseña aparte, como lo que es: el parte de la cumbre.
 *
 * LO QUE HACE ESPECIAL A ESTA FUENTE es que se autodeclara vieja. Cada campo
 * llega con su `timestamp`, su `outdated` y su `level`, así que se puede decir
 * «el seeing es del 8 de agosto» en vez de enseñarlo como si fuera de ahora.
 * Comprobado el 13 ago 2026: 17 campos frescos y el `seeing` con cuatro días.
 * Ese respeto por el flag es la razón de que esta sección pueda existir sin
 * mentir.
 */

import { dataUrl } from './endpoints'

/** Altitud de la estación del TNG, m. Del propio observatorio, no del DEM. */
export const ROQUE_ELEVATION_M = 2387
export const ROQUE_LON = -17.8892
export const ROQUE_LAT = 28.7542
export const ROQUE_SOURCE_LABEL = 'Telescopio Nazionale Galileo (INAF) · Roque de los Muchachos'

/** Un campo tal y como lo publica el origen. */
export interface RoqueField {
  value: number
  unit: string
  label: string
  /** Instante de ESA lectura (epoch ms, UTC). */
  observedAt: number
  /** El origen dice que este campo ya no está al día. Se respeta siempre. */
  outdated: boolean
}

export interface RoqueStatus {
  fetchedAt: number
  fields: Partial<Record<RoqueKey, RoqueField>>
  /** La más reciente de las lecturas NO obsoletas. `null` si no queda ninguna. */
  observedAt: number | null
}

/**
 * Los campos que la aplicación enseña, en el orden en que se leen.
 *
 * El origen publica 18 y aquí hay 9. Los que faltan son los cinco canales de
 * granulometría del contador de polvo (`dust_d0_3` … `dust_d10_0`): son
 * recuentos por tamaño de partícula, útiles para calibrar el propio sensor y
 * ruido para todos los demás. El microgramo por metro cúbico —`dust`— sí se
 * queda, porque es el que detecta la calima. `trend` tampoco entra: es la
 * deriva de temperatura del propio instrumento, no del aire.
 */
export const ROQUE_KEYS = [
  'temperature',
  'humidity',
  'dewpoint',
  'windspeed',
  'winddir',
  'pressure',
  'dust',
  'seeing',
  'solarimeter',
] as const

export type RoqueKey = (typeof ROQUE_KEYS)[number]

/**
 * Etiquetas propias, no las del origen.
 *
 * El TNG las manda en inglés y con su vocabulario de observatorio
 * («Solarimeter»). Aquí se dicen en castellano y con la unidad separada, que
 * es como las lee el resto de la aplicación.
 */
const LABELS: Record<RoqueKey, string> = {
  temperature: 'Temperatura',
  humidity: 'Humedad relativa',
  dewpoint: 'Punto de rocío',
  windspeed: 'Viento',
  winddir: 'Dirección',
  pressure: 'Presión de estación',
  dust: 'Polvo en suspensión',
  seeing: 'Seeing',
  solarimeter: 'Radiación solar',
}

/**
 * Unidades normalizadas. El origen escribe `ºC` con el masculino ordinal en
 * vez del signo de grado, y `º` a secas para los grados de acimut.
 */
const UNITS: Record<RoqueKey, string> = {
  temperature: '°C',
  humidity: '%',
  dewpoint: '°C',
  windspeed: 'm/s',
  winddir: '°',
  pressure: 'hPa',
  dust: 'µg/m³',
  seeing: 'arcsec',
  solarimeter: 'W/m²',
}

interface RawField {
  value?: unknown
  epoch?: unknown
  outdated?: unknown
}

/**
 * Decodifica la respuesta del proxy.
 *
 * Un campo se cae si no trae número o no trae hora. No se rellena con la hora
 * de la descarga: fechar una lectura con el momento en que se pidió es
 * exactamente la mentira que el flag `outdated` de esta fuente permite evitar.
 */
export function decodeRoque(body: unknown, fetchedAt: number): RoqueStatus | null {
  const raw = (body as { data?: Record<string, RawField> } | null)?.data
  if (!raw || typeof raw !== 'object') return null

  const fields: Partial<Record<RoqueKey, RoqueField>> = {}
  for (const key of ROQUE_KEYS) {
    const f = raw[key]
    if (!f || typeof f.value !== 'number' || !Number.isFinite(f.value)) continue
    const observedAt = typeof f.epoch === 'number' ? f.epoch : NaN
    if (!Number.isFinite(observedAt)) continue
    fields[key] = {
      value: f.value,
      unit: UNITS[key],
      label: LABELS[key],
      observedAt,
      outdated: f.outdated === true,
    }
  }

  if (!Object.keys(fields).length) return null

  const fresh = Object.values(fields)
    .filter((f) => !f.outdated)
    .map((f) => f.observedAt)

  return {
    fetchedAt,
    fields,
    observedAt: fresh.length ? Math.max(...fresh) : null,
  }
}

/**
 * Pide el parte de la cumbre. Devuelve `null` si no hay: esta sección es un
 * extra, y su ausencia no puede tumbar nada.
 */
export async function fetchRoque(signal?: AbortSignal): Promise<RoqueStatus | null> {
  try {
    const res = await fetch(dataUrl('/api/roque'), { signal })
    if (!res.ok) return null
    return decodeRoque(await res.json(), Date.now())
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Lecturas derivadas
// ---------------------------------------------------------------------------

export type SeeingQuality = 'excellent' | 'good' | 'average' | 'poor'

/**
 * Traduce el seeing a palabras.
 *
 * El seeing es el diámetro angular en que la turbulencia atmosférica desparrama
 * una estrella puntual: cuanto menor, más quieta se ve. El Roque es uno de los
 * mejores emplazamientos del hemisferio norte precisamente porque aquí ese
 * número es pequeño.
 *
 * Los cortes son los que se manejan en la propia montaña —por debajo de 0,8″ es
 * una noche buena y por encima de 1,5″ es mala— y así se dicen en la interfaz:
 * como referencia de uso, no como una norma publicada. Y sólo se enseñan si el
 * campo NO viene marcado como obsoleto, porque un seeing de hace cuatro días no
 * describe la noche de hoy.
 */
export function seeingQuality(arcsec: number): SeeingQuality {
  if (arcsec < 0.8) return 'excellent'
  if (arcsec < 1.2) return 'good'
  if (arcsec < 1.5) return 'average'
  return 'poor'
}

/**
 * ¿Hay calima en la cumbre?
 *
 * El polvo sahariano es lo que arruina una noche de observación y lo que tiñe
 * el cielo de la isla entera. El fondo limpio del Roque está muy por debajo de
 * 1 µg/m³ —la lectura del 13 ago 2026 era 0,16—, así que 5 µg/m³ ya es un
 * episodio y 20 es uno serio. Umbrales de referencia, medidos contra el fondo
 * de esta estación, no un estándar de calidad del aire: esto es un contador
 * óptico de un observatorio, no una cabina de la red de vigilancia.
 */
export function dustLevel(ugm3: number): 'clean' | 'hazy' | 'calima' {
  if (ugm3 < 5) return 'clean'
  if (ugm3 < 20) return 'hazy'
  return 'calima'
}
