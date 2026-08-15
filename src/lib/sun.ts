/**
 * Dónde está el sol: elevación y azimut.
 *
 * ESTE FICHERO SALIÓ DE `vapor/breath.ts`, y salió por una razón concreta. Allí
 * la posición solar era un detalle interno del reloj de la brisa de ladera: lo
 * único que se le pedía era la elevación, para saber si el sol lleva tres horas
 * calentando una ladera o tres horas sin hacerlo. Cuando la escena 3D necesitó
 * saber **desde dónde** llega la luz para iluminar las nubes, hacían falta las
 * dos coordenadas, y la alternativa era copiar cuarenta líneas de astronomía en
 * un segundo sitio. Dos copias del mismo algoritmo son dos sitios donde
 * corregirlo y uno donde olvidarse.
 *
 * `breath.ts` sigue exportando `solarElevation` —su cálculo no ha cambiado ni
 * un decimal, y sus pruebas siguen siendo las que responden de él—, pero ahora
 * la reexporta desde aquí en vez de tenerla dentro.
 *
 * EL ALGORITMO es el de posición solar de la NOAA en su forma reducida: mejor
 * de 0,01° entre 1950 y 2050. Es una precisión ridículamente alta para lo que
 * se le pide, pero es corto y no tiene casos raros.
 */

/** Grados a radianes y al revés, que aquí se usan a cada paso. */
const RAD = Math.PI / 180
const DEG = 180 / Math.PI

export interface SolarPosition {
  /**
   * Grados sobre el horizonte. Negativo de noche.
   *
   * En La Palma el máximo anual es **84,8°**, en el solsticio de verano: la
   * isla está a 28,66° N y la declinación llega a 23,44°, así que el sol se
   * queda a 5,2° de la vertical. El comentario que acompañaba a esta función
   * decía «~78°» desde que se escribió, y no es lo que calcula —la prueba de
   * `breath.test.ts` lleva desde el principio comprobando que da entre 83 y
   * 85,5, contra el calculador de la NOAA—. Era la descripción la que estaba
   * mal, no el código.
   */
  elevation: number
  /**
   * Azimut en grados desde el norte, hacia el este: 90° = este, 180° = sur,
   * 270° = oeste. Es la convención de los rumbos, la misma en la que llega la
   * dirección del viento del Cabildo, para que no haya dos nortes distintos
   * dentro de la aplicación.
   */
  azimuth: number
}

/**
 * Elevación y azimut del sol para un instante y un punto.
 *
 * Se devuelven juntos porque comparten TODO el cálculo caro —declinación,
 * ecuación del tiempo, ángulo horario— y pedirlos por separado sería hacer dos
 * veces el mismo trabajo para tirar la mitad cada vez.
 */
export function solarPosition(at: Date, lon: number, lat: number): SolarPosition {
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

  const zenithRad = Math.acos(
    Math.sin(lat * RAD) * Math.sin(declination * RAD) +
      Math.cos(lat * RAD) * Math.cos(declination * RAD) * Math.cos(hourAngle * RAD),
  )
  const elevation = 90 - zenithRad * DEG

  // Azimut, en la forma EXACTA de la hoja de cálculo de la NOAA. Se sigue al
  // pie de la letra —incluido el `180 −` y el cambio de signo por la tarde— y
  // no una versión reordenada a mano: la primera escritura de esto invirtió el
  // numerador y devolvía 143° a las 13:30 del solsticio, cuando el sol acababa
  // de pasar el meridiano y tenía que estar en 182°. Cuarenta grados de error
  // que no dan ningún fallo: sale un número perfectamente plausible, y las
  // nubes se iluminan por la cara que no es.
  //
  // El denominador se protege porque en el cenit exacto —que en La Palma no
  // llega a pasar, pero pasa entre trópicos— el azimut no está definido. Y el
  // recorte a [−1, 1] es por el redondeo, que se sale por 1e-16 y convierte el
  // `acos` en NaN.
  const azDenom = Math.cos(lat * RAD) * Math.sin(zenithRad)
  let azimuth: number
  if (Math.abs(azDenom) > 1e-6) {
    const cosAz =
      (Math.sin(lat * RAD) * Math.cos(zenithRad) - Math.sin(declination * RAD)) / azDenom
    let az = 180 - Math.acos(Math.min(1, Math.max(-1, cosAz))) * DEG
    // Por la tarde —ángulo horario positivo, el sol ya ha pasado el meridiano—
    // el ángulo se refleja. Sin esto el sol se pondría por donde ha salido.
    if (hourAngle > 0) az = -az
    azimuth = (az + 360) % 360
  } else {
    // Justo en el cenit: al norte del ecuador el sol culmina al sur.
    azimuth = lat > 0 ? 180 : 0
  }

  return { elevation, azimuth }
}

/**
 * De la elevación del sol a «cuánto es de día», de 0 a 1.
 *
 * El corte va de −6° a +3°, que es el crepúsculo civil: por debajo de −6° ya no
 * hay luz para leer sin lámpara, y por encima de +3° el sol lleva un rato
 * entero fuera. Una transición y no un interruptor, porque el amanecer no es un
 * interruptor: con un `if (elevación > 0)` la escena cambiaría de color de
 * golpe, en un fotograma, a mitad de un amanecer que dura media hora.
 *
 * Vive aquí y no en la capa de nubes porque hay DOS capas que se tienen que
 * apagar exactamente a la vez. Con una copia en cada una, bastaba con tocar un
 * número en un sitio para que empezara a llover de un cielo ya de noche.
 */
export function dayFactor(elevationDeg: number): number {
  return Math.min(1, Math.max(0, (elevationDeg + 6) / 9))
}
