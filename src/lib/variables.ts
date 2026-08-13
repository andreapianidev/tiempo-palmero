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
  DEWPOINT_STOPS,
  HUMIDITY_STOPS,
  TEMP_STOPS,
  VPD_STOPS,
  type RgbStop,
} from './palette'
import { n, t } from '../i18n'

export interface VariableSpec {
  id: DisplayVariable
  label: string
  /** Etiqueta corta para chips estrechos. */
  short: string
  unit: string
  stops: RgbStop[]
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

export const VARIABLES: Record<DisplayVariable, VariableSpec> = {
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
}

/** En el orden en que se enseñan. Lo medido primero, lo derivado después. */
export const VARIABLE_ORDER: readonly DisplayVariable[] = [
  'temperature',
  'relativehumidity',
  'dewpoint',
  'vpd',
]

export function isDisplayVariable(id: string): id is DisplayVariable {
  return id in VARIABLES
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
