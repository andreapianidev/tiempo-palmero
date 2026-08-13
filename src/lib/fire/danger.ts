/**
 * El peligro meteorológico del día, en el percentil que le corresponde.
 *
 * EL PROBLEMA QUE RESUELVE. El clasificador espacial dice dónde arde esta isla,
 * y eso no cambia de un día para otro. Lo que cambia es el tiempo. Pero los
 * cinco incendios con perímetro publicado son **cinco días**, y con cinco días
 * no se ajusta un modelo meteorológico: se ajusta un recuerdo. Cualquier
 * coeficiente que saliera de ahí estaría describiendo el 3 de agosto de 2016,
 * no el régimen de la isla.
 *
 * LO QUE SÍ SE PUEDE HACER CON CINCO DÍAS ES MEDIRLOS. En `scripts/ml/run.py`
 * se calcula el índice de Fosberg y los días sin llover de todos los días entre
 * 2001 y 2024 sobre La Palma, y de ahí sale la distribución empírica de los
 * dos. El peligro de hoy es entonces **su percentil dentro de esa
 * distribución**, no un umbral que alguien haya elegido: cuando la interfaz
 * dice 0,93 está diciendo «hoy es peor que el 93 % de los días de los últimos
 * veinticuatro años», que es una frase que se puede comprobar.
 *
 * POR QUÉ LOS DOS INGREDIENTES, Y POR QUÉ ASÍ. Fosberg es el instante: cuánta
 * agua tiene ahora mismo la hojarasca y cuánto viento hace. Los días sin llover
 * son la memoria: si el matorral entero está seco por dentro. Un día de calima
 * sobre suelo empapado y un día corriente al final de un verano sin lluvia son
 * peligrosos por motivos que no se sustituyen entre sí. Se combinan con la
 * **media geométrica**, que exige que los dos estén altos: la media aritmética
 * dejaría que un valor extremo tapara a otro tranquilo, y esa es justo la
 * situación —seco pero en calma, o ventoso sobre suelo mojado— en la que no
 * pasa nada.
 *
 * Y LO QUE SE HA COMPROBADO CON ELLO, que es poco y hay que decir cuánto: los
 * cinco arranques caen en la cola alta de esta escala. Es la única validación
 * posible con n = 5, y no es una validación estadística — es una comprobación
 * de que la escala no contradice lo que pasó. La cifra concreta la trae el
 * propio modelo en `danger.fireDays` y la interfaz la enseña.
 */

import type { FireModelSpec } from './model'

/** Cuántos días sin llover se consideran ya el tope de la escala de sequía. */
export interface DangerInputs {
  /** Índice de Fosberg del punto, de `moisture.ts`. */
  fosberg: number | null
  /** Días desde la última lluvia apreciable, de `drought.ts`. */
  daysSinceRain: number | null
}

export interface Danger {
  /** De 0 a 1: el percentil combinado. */
  value: number
  /** El percentil de Fosberg por separado, de 0 a 1. */
  fosbergPercentile: number
  /** El de la sequía, de 0 a 1. `null` si no se sabe cuándo llovió. */
  drynessPercentile: number | null
}

/**
 * El percentil de un valor dentro de una curva de 21 cuantiles.
 *
 * La curva viene del entrenamiento con los percentiles 0, 5, 10 … 100. Entre
 * dos puntos se interpola linealmente; por debajo del mínimo es 0 y por encima
 * del máximo es 1, sin extrapolar — un día peor que el peor de veinticuatro
 * años no es «percentil 104», es el tope de lo que este archivo puede decir.
 */
export function percentileIn(curve: readonly number[], value: number): number {
  if (curve.length < 2 || !Number.isFinite(value)) return 0
  if (value <= curve[0]) return 0
  if (value >= curve[curve.length - 1]) return 1

  const stepShare = 1 / (curve.length - 1)
  for (let i = 1; i < curve.length; i++) {
    if (value <= curve[i]) {
      const span = curve[i] - curve[i - 1]
      const within = span > 0 ? (value - curve[i - 1]) / span : 0
      return (i - 1 + within) * stepShare
    }
  }
  return 1
}

/**
 * El peligro del día en un punto.
 *
 * Devuelve `null` si no hay Fosberg — sin temperatura, humedad o viento no hay
 * nada que decir del día, y un peligro por defecto sería una invención con
 * aspecto de dato.
 *
 * Si falta la sequía pero hay Fosberg, se devuelve solo Fosberg y se marca la
 * ausencia. Es el caso real de que el archivo de lluvia no conteste: la mitad
 * de la escala sigue siendo cierta, y taparlo con un 0,5 imaginario sería peor.
 */
export function dangerOf(spec: FireModelSpec, inputs: DangerInputs): Danger | null {
  if (inputs.fosberg === null || !Number.isFinite(inputs.fosberg)) return null

  const fosbergPercentile = percentileIn(spec.danger.fosbergCurve, inputs.fosberg)
  if (inputs.daysSinceRain === null || !Number.isFinite(inputs.daysSinceRain)) {
    return { value: fosbergPercentile, fosbergPercentile, drynessPercentile: null }
  }

  const drynessPercentile = percentileIn(spec.danger.drynessCurve, inputs.daysSinceRain)
  return {
    value: Math.sqrt(fosbergPercentile * drynessPercentile),
    fosbergPercentile,
    drynessPercentile,
  }
}

/**
 * El número que se pinta: susceptibilidad × peligro del día.
 *
 * **No es una probabilidad y la interfaz no la llama así.** Es un índice
 * relativo de 0 a 1 que combina dos cosas medidas de forma distinta: dónde se
 * ha quemado esta isla (un clasificador validado) y cómo de excepcional es el
 * tiempo de hoy (un percentil). Multiplicarlas ordena bien los sitios y los
 * días entre sí, que es para lo que sirve; leer el 0,4 como «un 40 % de
 * posibilidades» sería leerlo mal, y por eso el número se enseña como índice y
 * la ficha del punto separa siempre los dos factores.
 */
export function fireIndex(susceptibility: number | null, danger: Danger | null): number | null {
  if (susceptibility === null || danger === null) return null
  return susceptibility * danger.value
}
