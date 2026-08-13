/**
 * Balance hídrico de una parcela: lo que pide menos lo que cae.
 *
 * `ETc = ETo × Kc` y `déficit = ETc − lluvia`. Es la cuenta de FAO-56 en su
 * forma más corta, y aquí se para justo ahí a propósito. Lo que viene después
 * —la eficiencia del sistema de riego, el agua que el suelo tenía guardado, la
 * fracción de lavado de sales— depende de cosas que ningún dato publicado
 * sobre esta isla contiene, y ponerles un valor por defecto convertiría una
 * cuenta honesta en una recomendación inventada.
 *
 * LO QUE SÍ SE PUEDE AFIRMAR: cuánta agua evapora hoy una parcela de este
 * cultivo en este sitio, y cuánta de esa agua la pone el cielo. Eso ya es la
 * pregunta que un platanero se hace por la mañana, y es la que el mapa de ETo
 * y la ficha de parcela contestan.
 *
 * EL LITRO POR PLANTA no es un adorno: es la unidad en la que se riega de
 * verdad en La Palma —el propio `agriparcel` del Cabildo llama a sus puntos
 * `litros_planta_aireLibre`—, y un milímetro no le dice nada a nadie que esté
 * abriendo una llave. La conversión es geometría pura, `mm × m²/planta`, y el
 * marco de plantación se declara al pedirla porque es un dato de la finca, no
 * del cielo.
 */

import { cropByCode, type Crop } from './crops'

export interface WaterBalance {
  crop: Crop
  /** Demanda de la pradera de referencia, mm. */
  etoMm: number
  /** Demanda de ESTE cultivo, mm. `ETo × Kc`. */
  etcMm: number
  /** Lluvia del día según el mismo modelo, mm. */
  rainMm: number
  /**
   * Lo que falta por regar, mm. Nunca negativo: un día de lluvia de sobra no
   * genera «riego negativo», genera cero riego. El excedente se publica aparte
   * para quien quiera verlo.
   */
  deficitMm: number
  /** Lluvia por encima de la demanda, mm. Cero los días secos. */
  surplusMm: number
}

/**
 * Calcula el balance de una parcela.
 *
 * Devuelve `null` si el cultivo no tiene Kc —monte, erial, huerta abandonada,
 * urbano—: son el 90 % de la superficie catalogada y para ellos la pregunta no
 * tiene sentido. Un cero ahí se leería como «no necesita riego», que es una
 * afirmación distinta de «esto no es un cultivo».
 */
export function waterBalance(
  cropCode: string,
  etoMm: number,
  rainMm: number,
): WaterBalance | null {
  const crop = cropByCode(cropCode)
  if (!crop || crop.kcMid === null) return null
  if (!Number.isFinite(etoMm) || etoMm < 0) return null

  const etcMm = etoMm * crop.kcMid
  const rain = Number.isFinite(rainMm) && rainMm > 0 ? rainMm : 0
  const net = etcMm - rain

  return {
    crop,
    etoMm,
    etcMm,
    rainMm: rain,
    deficitMm: Math.max(0, net),
    surplusMm: Math.max(0, -net),
  }
}

/**
 * Marcos de plantación de referencia, en m² por planta.
 *
 * Son órdenes de magnitud de manejo habitual, NO un censo de las parcelas de
 * la isla: cada finca planta como quiere y ese dato no se publica en ninguna
 * parte. Existen para que la cifra en litros tenga un punto de partida
 * razonable, y la interfaz deja cambiar el marco porque quien riega sí lo
 * sabe. Cambiarlo cambia el litro proporcionalmente, que es toda la aritmética
 * que hay aquí.
 */
export const DEFAULT_SPACING_M2: Partial<Record<string, number>> = {
  platanera: 6,
  frutal: 25,
  viña: 4,
  huerta: 1,
  pasto: 1,
}

/**
 * Convierte milímetros en litros por planta.
 *
 * 1 mm sobre 1 m² es exactamente 1 litro, así que esto es una multiplicación y
 * no una estimación. Toda la incertidumbre está en el marco de plantación, que
 * entra por parámetro precisamente para que se vea.
 */
export function litresPerPlant(mm: number, spacingM2: number): number {
  return mm * spacingM2
}
