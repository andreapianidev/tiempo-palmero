/**
 * Catálogo único de las variables que la interfaz sabe pintar.
 *
 * POR QUÉ EXISTE. Hasta ahora la misma tabla estaba escrita cuatro veces: la
 * paleta en `App.tsx`, otra vez en `MapScreen.tsx` del móvil, las unidades en
 * `PointPanel.tsx`, las etiquetas cortas en `layers.ts`, y la lista de chips en
 * `VariablePicker.tsx`. Añadir una variable obligaba a acertar en las cinco, y
 * olvidarse de una no rompía la compilación: simplemente salía una unidad
 * equivocada en una plataforma y no en la otra.
 *
 * Aquí está una vez, y `Record<DisplayVariable, …>` hace que el compilador
 * exija completarla. Vive en `lib/` y no en `i18n/` porque lleva paletas y
 * decimales, que no son texto traducible.
 *
 * `short` no es un capricho del móvil: en 393 px de ancho «Humedad relativa»
 * no cabe en un chip, y partirlo con puntos suspensivos se lee peor que una
 * palabra elegida.
 */

import type { DisplayVariable } from './interpolate'
import {
  CO2_BANDS,
  COVERAGE_BANDS,
  DEWPOINT_STOPS,
  HUMIDITY_STOPS,
  TEMP_STOPS,
  VPD_STOPS,
  type Co2Band,
  type RgbStop,
} from './palette'
import { n, t } from '../i18n'

/**
 * Lo que el selector de variable ofrece.
 *
 * Es MÁS ancho que `DisplayVariable` a propósito. Aquélla es el paquete
 * higrotérmico que sale de un mismo ajuste y se puede estimar en cualquier
 * punto de la isla; el CO₂ no sale de ahí ni se parece: viene de otra red, se
 * pinta con otro método y solo existe donde hay sensores. Comparten sitio en
 * la interfaz —las dos son «lo que colorea el mapa»— y nada más, y por eso el
 * tipo se abre aquí en vez de ensanchar el del motor.
 */
export type MapVariable = DisplayVariable | 'co2' | 'coverage'

export interface VariableSpec {
  id: MapVariable
  label: string
  /** Etiqueta corta para chips estrechos. */
  short: string
  unit: string
  /**
   * Rampa continua. El CO₂ también la trae, pero solo para que el tipo sea
   * uno: quien pinta CO₂ usa `bands`, nunca esto (ver `co2/raster.ts`).
   */
  stops: RgbStop[]
  /**
   * Escala por TRAMOS en vez de degradado. Solo el CO₂. Un gradiente suave
   * entre 900 y 1100 ppm sugiere una transición gradual donde lo que hay es un
   * umbral de decisión, así que la leyenda se dibuja escalonada.
   */
  bands?: Co2Band[]
  /**
   * La variable NO cubre la isla: solo existe donde hay sensores propios. La
   * interfaz lo dice antes de que nadie busque su pueblo en el mapa y no
   * encuentre color.
   */
  local?: string
  /** Decimales con los que se enseña. El VPD necesita dos: su rango útil es 0–4. */
  decimals: number
  /**
   * La red NO mide esto: se calcula a partir de temperatura y humedad. La
   * interfaz lo marca con «ƒ» en todas las plataformas, y no es decorativo —
   * distingue lo medido de lo derivado.
   */
  derived?: boolean
  /** Explicación larga, para el `title` del chip. */
  hint?: string
}

export const VARIABLES: Record<MapVariable, VariableSpec> = {
  temperature: {
    id: 'temperature',
    label: t.variables.temperature,
    short: t.variables.temperature,
    unit: t.units.celsius,
    stops: TEMP_STOPS,
    decimals: 1,
  },
  relativehumidity: {
    id: 'relativehumidity',
    label: t.variables.relativehumidity,
    short: 'Humedad',
    unit: t.units.percent,
    stops: HUMIDITY_STOPS,
    decimals: 0,
  },
  dewpoint: {
    id: 'dewpoint',
    label: t.variables.dewpoint,
    short: 'Rocío',
    unit: t.units.celsius,
    stops: DEWPOINT_STOPS,
    decimals: 1,
    derived: true,
    hint: t.variables.derivedHint,
  },
  vpd: {
    id: 'vpd',
    label: t.variables.vpd,
    short: 'VPD',
    unit: t.units.kpa,
    stops: VPD_STOPS,
    decimals: 2,
    derived: true,
    hint: t.variables.vpdHint,
  },
  co2: {
    id: 'co2',
    label: t.variables.co2,
    short: 'CO₂',
    unit: t.units.ppm,
    // Presente por el tipo, no por el mapa: el raster de CO₂ colorea con
    // `co2Band`, que es escalonada. Si algo llegase a muestrear esta rampa
    // saldría un color intermedio entre dos tramos, que es justo lo que la
    // escala por bandas existe para no hacer.
    stops: CO2_BANDS.map((b) => [b.from, b.color] as RgbStop),
    bands: CO2_BANDS,
    decimals: 0,
    local: t.variables.co2Local,
    hint: t.variables.co2Hint,
  },
  coverage: {
    id: 'coverage',
    // El año va DENTRO del nombre, no en una nota al pie. Es un sondeo de hace
    // trece años y esa es la primera cosa que hay que saber de él: en una
    // pestaña plegada, en un chip de 12 px y en una captura de pantalla, la
    // fecha viaja pegada al dato.
    label: t.variables.coverage,
    short: 'Cobertura',
    unit: t.units.dbm,
    stops: COVERAGE_BANDS.map((b) => [b.from, b.color] as RgbStop),
    bands: COVERAGE_BANDS,
    decimals: 0,
    local: t.variables.coverageLocal,
    hint: t.variables.coverageHint,
  },
}

/**
 * En el orden en que se enseñan. Lo medido primero, lo derivado después.
 *
 * Son las cuatro del paquete higrotérmico y NADA más: esta lista es la que
 * decide qué puede pedirle la interfaz al motor de interpolación, y la app
 * nativa la usa para separar variables de capas. Meter aquí el CO₂ haría que
 * el móvil tratase su capa de sensores como una malla.
 */
export const VARIABLE_ORDER: readonly DisplayVariable[] = [
  'temperature',
  'relativehumidity',
  'dewpoint',
  'vpd',
]

/** Lo que enseña el selector: las cuatro de arriba y el CO₂ al final. */
export const MAP_VARIABLE_ORDER: readonly MapVariable[] = [
  ...VARIABLE_ORDER,
  'co2',
  'coverage',
]

/**
 * Comprueba pertenencia contra `VARIABLE_ORDER`, no contra `VARIABLES`.
 *
 * Antes era `id in VARIABLES`, y en cuanto el catálogo admitió el CO₂ esa
 * forma habría empezado a decir que sí para «co2» —que en el móvil es el
 * nombre de una CAPA de sensores, no de una malla— y a mandar esa capa por el
 * camino del interpolador.
 */
export function isDisplayVariable(id: string): id is DisplayVariable {
  return (VARIABLE_ORDER as readonly string[]).includes(id)
}

/** La variable elegida sale del paquete higrotérmico y no de una red aparte. */
export function isBundleVariable(v: MapVariable): v is DisplayVariable {
  return isDisplayVariable(v)
}

/**
 * La cifra que va DENTRO del pin de una estación, con su unidad pegada.
 *
 * Vive aquí porque estaba escrita dos veces —`MapView.tsx` en la web y
 * `IslandMap.tsx` en el móvil— con la misma forma: «si es humedad, el símbolo
 * de porcentaje; si no, un grado». Esa regla dejó de ser cierta al entrar el
 * VPD, que se mide en kilopascales: los pines pasaron a enseñar «0,9°» sobre
 * una malla en kPa, con la unidad equivocada y con un decimal en vez de dos.
 *
 * Se deja el grado a secas, sin la C, porque en un pin de 34 px no cabe y el
 * contexto lo da la propia escala de color que está al lado.
 */
export function pinLabel(variable: DisplayVariable, value: number): string {
  const spec = VARIABLES[variable]
  const cifra = n(value, spec.decimals)
  // El porcentaje y el grado van pegados a la cifra porque así se escriben; el
  // resto de unidades, separadas. Ni la unidad ni los decimales se deciden
  // aquí: los dos salen del catálogo, que es de lo que iba este arreglo.
  if (spec.unit === t.units.percent) return `${cifra}%`
  if (spec.unit === t.units.celsius) return `${cifra}°`
  return `${cifra} ${spec.unit}`
}

// ---------------------------------------------------------------------------
// Bandas de manejo del VPD
// ---------------------------------------------------------------------------

export type VpdBand = 'humid' | 'comfortable' | 'demanding' | 'stress'

/**
 * Traduce un VPD a la banda de manejo con la que trabaja el invernadero.
 *
 * CON QUÉ AUTORIDAD. Estos cortes son práctica de horticultura protegida, no
 * una medida hecha en La Palma ni un umbral publicado para la platanera de
 * esta isla, y la interfaz lo dice donde los usa. Sirven para ordenar el mapa
 * en cuatro tramos legibles, no para decidir un riego por sí solos.
 */
export function vpdBand(kpa: number): VpdBand {
  if (kpa < 0.4) return 'humid'
  if (kpa < 1.0) return 'comfortable'
  if (kpa < 1.6) return 'demanding'
  return 'stress'
}
