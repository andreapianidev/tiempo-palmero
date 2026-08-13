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

/** Grados a radianes y al revés, que aquí se usan a cada paso. */
const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/**
 * Elevación del sol sobre el horizonte, en grados.
 *
 * Algoritmo de posición solar de la NOAA en su forma reducida: da mejor de
 * 0,01° entre 1950 y 2050, que es una precisión ridículamente alta para lo que
 * se le pide —saber si el sol lleva tres horas calentando una ladera o tres
 * horas sin hacerlo—, pero es corto y no tiene casos raros.
 *
 * Negativo de noche. En el solsticio de verano en La Palma llega a ~78°.
 */
export function solarElevation(at: Date, lon: number, lat: number): number {
  // Día juliano y siglos julianos desde J2000.
  const jd = at.getTime() / 86_400_000 + 2_440_587.5
  const t = (jd - 2_451_545) / 36_525

  const meanLong = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360
  const meanAnom = 357.52911 + t * (35_999.05029 - 0.0001537 * t)
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)

  const center =
    Math.sin(meanAnom * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnom * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnom * RAD) * 0.000289
  const trueLong = meanLong + center

  const omega = 125.04 - 1934.136 * t
  const apparentLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD)

  const meanObliq =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD)

  const declination =
    Math.asin(Math.sin(obliq * RAD) * Math.sin(apparentLong * RAD)) * DEG

  // Ecuación del tiempo, en minutos.
  const y = Math.tan((obliq / 2) * RAD) ** 2
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * meanLong * RAD) -
      2 * eccent * Math.sin(meanAnom * RAD) +
      4 * eccent * y * Math.sin(meanAnom * RAD) * Math.cos(2 * meanLong * RAD) -
      0.5 * y * y * Math.sin(4 * meanLong * RAD) -
      1.25 * eccent * eccent * Math.sin(2 * meanAnom * RAD))

  // Hora solar verdadera. Se trabaja en UTC y se corrige con la longitud: la
  // zona horaria oficial no pinta nada aquí, el sol no la conoce.
  const minutesUtc =
    at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60
  const trueSolarMin = (minutesUtc + eqTime + 4 * lon + 1440) % 1440
  const hourAngle = trueSolarMin / 4 - 180

  const zenith = Math.acos(
    Math.sin(lat * RAD) * Math.sin(declination * RAD) +
      Math.cos(lat * RAD) * Math.cos(declination * RAD) * Math.cos(hourAngle * RAD),
  )
  return 90 - zenith * DEG
}

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
