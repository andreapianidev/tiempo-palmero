/**
 * La respiración de la isla: la brisa de ladera y su reloj.
 *
 * QUÉ ES ESTO Y POR QUÉ NO ES UN ADORNO. Una isla montañosa **respira**, y no
 * es una metáfora: durante el día el sol calienta las laderas, el aire pegado a
 * ellas se vuelve más ligero que el aire libre a su misma altura y sube por la
 * pendiente —brisa anabática—; de noche las laderas irradian, el aire se enfría
 * contra el suelo, se hace más denso y baja por los barrancos hasta el mar
 * —brisa catabática—. Inspira de día, espira de noche, todos los días. En La
 * Palma es lo que empuja al mar de nubes a trepar por la vertiente noreste
 * durante la tarde y lo que lo deshace de madrugada.
 *
 * ES FÍSICA DOCUMENTADA Y BIEN MEDIDA, no una animación inventada para que se
 * mueva algo. Lo que hace este fichero es poner el reloj de ese ciclo, y lo
 * pone con la **posición real del sol** —astronomía, no una senoide— para la
 * fecha, la hora y el punto de la isla que se esté mirando.
 *
 * LO QUE ESTE FICHERO NO HACE, Y HAY QUE DECIRLO. No es un modelo de brisa de
 * ladera: no resuelve ecuaciones de capa límite, no sabe de estabilidad ni de
 * la profundidad de la corriente. Da el SIGNO y la INTENSIDAD RELATIVA del
 * ciclo, que es lo que hace falta para que el vapor que se dibuja suba cuando
 * en la isla el aire sube y baje cuando baja, en lugar de moverse porque sí.
 * Cualquier cifra en m/s que salga de aquí es de la animación, no una medida, y
 * la interfaz lo dice donde se enciende.
 */

import { solarElevation } from '../sun'

/**
 * Elevación del sol sobre el horizonte, en grados. Negativo de noche.
 *
 * El cálculo vive en `lib/sun.ts`, que es el único sitio del repositorio donde
 * hay astronomía. Se reexporta desde aquí porque es donde la busca quien lee el
 * reloj de la brisa.
 */
export { solarElevation }

/**
 * Retraso del suelo respecto al sol, en horas.
 *
 * La ladera no está más caliente al mediodía sino a media tarde: la superficie
 * acumula calor mientras la entrada de radiación supera a la pérdida, y el
 * máximo de temperatura llega DESPUÉS del máximo de sol. Por eso la brisa de
 * ladera no invierte al amanecer y al atardecer sino un par de horas más tarde,
 * y por eso el mar de nubes trepa por la tarde y no a mediodía.
 *
 * Dos horas es el valor clásico para superficie terrestre despejada. No está
 * medido contra esta isla —haría falta una red de anemómetros de ladera que no
 * existe— y por eso es lo único de este fichero que se declara como lo que es:
 * un valor de manual. Mueve el momento del cambio, no si el cambio ocurre.
 */
export const GROUND_LAG_HOURS = 2

/**
 * Elevación solar a partir de la cual la ladera empieza a mandar hacia arriba.
 *
 * No es cero: con el sol rozando el horizonte la radiación que llega a una
 * ladera es una fracción de la del mediodía, y lo que domina todavía es el aire
 * frío de la noche bajando. 8° es la altura a la que la radiación directa sobre
 * una superficie horizontal ya es ~14 % de la máxima y el balance se da la
 * vuelta en terreno despejado.
 */
export const BREEZE_THRESHOLD_DEG = 8

export interface Breath {
  /**
   * De −1 a +1. Positivo = la isla inspira, el aire sube por las laderas.
   * Negativo = espira, el aire baja por los barrancos. Cero = el cambio.
   */
  flow: number
  /** Elevación del sol EN ESTE INSTANTE, en grados. Para poder enseñarla. */
  sunDeg: number
  /** Elevación del sol hace `GROUND_LAG_HOURS`, que es la que manda. */
  groundDeg: number
  /** `'inspira' | 'espira'`, con el nombre que sale en la interfaz. */
  phase: 'up' | 'down'
}

/**
 * En qué punto de su respiración está la isla.
 *
 * Se calcula con el sol **retrasado**, no con el de ahora: ver
 * `GROUND_LAG_HOURS`. La transición es suave y no un escalón, porque la brisa
 * tampoco cambia de sentido de golpe: la tangente hiperbólica da la vuelta en
 * poco más de una hora alrededor del umbral, que es el orden de lo que tarda.
 */
export function breathAt(at: Date, lon: number, lat: number): Breath {
  const sunDeg = solarElevation(at, lon, lat)
  const lagged = new Date(at.getTime() - GROUND_LAG_HOURS * 3_600_000)
  const groundDeg = solarElevation(lagged, lon, lat)
  // El divisor fija la anchura del cambio: 10° de sol son ~50 min en Canarias
  // alrededor del umbral, así que la vuelta completa dura poco más de una hora.
  const flow = Math.tanh((groundDeg - BREEZE_THRESHOLD_DEG) / 10)
  return { flow, sunDeg, groundDeg, phase: flow >= 0 ? 'up' : 'down' }
}
