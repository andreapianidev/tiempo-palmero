/**
 * Dónde está el sol sobre la isla en este instante.
 *
 * LA LUNA ESTABA AQUÍ Y SE FUE A `moon.ts`. La razón, con la cifra, está escrita
 * en el hueco que dejó, más abajo.
 *
 * ESTE FICHERO VIVÍA EN `ocean/`, y salió de allí por una razón que conviene
 * dejar escrita porque casi se repite el error: cuando la escena 3D necesitó
 * saber desde dónde llega la luz para iluminar las nubes, se extrajo la
 * posición solar de `vapor/breath.ts` a un `lib/sun.ts` nuevo… sin mirar que
 * esto ya existía, con el mismo algoritmo de la NOAA y además con la luna.
 * Durante unos commits hubo dos astronomías en el repositorio. Comprobado antes
 * de fundirlas, sobre un año entero cada tres días y cada dos horas: coincidían
 * en elevación y acimut hasta el cuarto decimal, o sea que eran el mismo
 * cálculo escrito dos veces. Queda una.
 *
 * QUIÉN LA USA. Tres cosas que tienen que estar de acuerdo sobre dónde está el
 * sol, porque salen en la misma pantalla a la vez:
 *
 *   - **El mar**, para el reflejo (`ocean/light.ts`).
 *   - **Las nubes**, para saber por qué cara se encienden (`sky/`).
 *   - **El relieve**, para que la isla se ilumine desde donde toca.
 *   - Y **el reloj de la brisa de ladera**, que solo necesita la elevación.
 *
 * POR QUÉ LO NECESITA EL MAR. Un océano se ve como se ve por dónde le da la
 * luz: el reflejo del sol es una columna que apunta al observador, cambia de
 * color al caer la tarde y desaparece de noche, cuando lo único que queda es
 * la luna —si la hay, y según cuánta—. Un mar iluminado siempre igual a
 * mediodía sobre un mapa que enseña la temperatura de las siete de la mañana
 * sería una contradicción en la misma pantalla.
 *
 * DE DÓNDE SALE. El algoritmo es el de la NOAA (*Solar Position Calculator*, el
 * mismo de la hoja de cálculo pública del ESRL), que da la declinación con un
 * error por debajo de 0,01° en este siglo. Son 36 segundos de arco contra un
 * disco de 32 minutos: la centésima parte del sol que se dibuja.
 *
 * NO PIDE NADA A NADIE. Es geometría: entra un instante y unas coordenadas y
 * sale un ángulo. Un servicio de orto y ocaso habría sido una dependencia
 * externa más para calcular algo que se calcula.
 */

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
/** Días julianos desde J2000.0 (2000-01-01 12:00 TT). */
const J2000 = 2451545

export interface SkyPosition {
  /** Altura sobre el horizonte, grados. Negativa de noche. */
  elevationDeg: number
  /** Acimut desde el norte hacia el este, grados. */
  azimuthDeg: number
}

/**
 * La misma posición, como vector unitario en la base local: este, norte, arriba.
 *
 * Vive aquí porque ya la necesitaban tres sitios —la luz del agua, la
 * iluminación de las nubes y su autosombra— y tres copias de la misma conversión
 * son tres sitios donde equivocarse de signo en el acimut. Es la misma razón por
 * la que `dayFactor` no está dentro de la capa de nubes.
 */
export function skyVector(p: SkyPosition): [number, number, number] {
  const e = p.elevationDeg * RAD
  const a = p.azimuthDeg * RAD
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
}

function julianDay(at: number): number {
  return at / 86400000 + 2440587.5
}

function julianCentury(at: number): number {
  return (julianDay(at) - J2000) / 36525
}

/**
 * Declinación del sol y ecuación del tiempo.
 *
 * La ecuación del tiempo es la diferencia entre el sol de reloj y el sol real,
 * y llega a 16 minutos: sin ella el mediodía solar se calcularía con un cuarto
 * de hora de error y el reflejo del sol saldría desplazado sobre el agua justo
 * en los días de otoño, que es cuando más se nota porque el sol está bajo.
 */
export function solarGeometry(at: number): {
  declinationDeg: number
  equationOfTimeMin: number
  /**
   * Ascensión recta, grados. La usa la luna para saber cuánto se ha separado
   * del sol, que es lo que fija la fase. Sale de la longitud eclíptica y no de
   * deshacer la ecuación del tiempo: son dos caminos al mismo sitio, pero este
   * no arrastra el error del otro.
   */
  rightAscensionDeg: number
} {
  const t = julianCentury(at)
  const meanLong = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const eccent = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const center =
    Math.sin(meanAnom * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnom * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnom * RAD) * 0.000289
  const trueLong = meanLong + center
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * RAD)
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliq = meanObliq + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD)
  const declination = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG

  const vary = Math.tan((obliq / 2) * RAD) ** 2
  const eqTime =
    4 *
    DEG *
    (vary * Math.sin(2 * meanLong * RAD) -
      2 * eccent * Math.sin(meanAnom * RAD) +
      4 * eccent * vary * Math.sin(meanAnom * RAD) * Math.cos(2 * meanLong * RAD) -
      0.5 * vary * vary * Math.sin(4 * meanLong * RAD) -
      1.25 * eccent * eccent * Math.sin(2 * meanAnom * RAD))

  const rightAscension =
    Math.atan2(Math.cos(obliq * RAD) * Math.sin(appLong * RAD), Math.cos(appLong * RAD)) * DEG

  return {
    declinationDeg: declination,
    equationOfTimeMin: eqTime,
    rightAscensionDeg: (rightAscension + 360) % 360,
  }
}

/** Ángulo horario en grados: 0 al mediodía solar, +15 por hora hacia la tarde. */
export function hourAngle(at: number, lonDeg: number): number {
  const { equationOfTimeMin } = solarGeometry(at)
  const minutes = ((at % 86400000) + 86400000) % 86400000 / 60000
  const trueSolar = (minutes + equationOfTimeMin + 4 * lonDeg + 1440) % 1440
  return trueSolar / 4 - 180
}

export function sunPosition(at: number, lonDeg: number, latDeg: number): SkyPosition {
  const { declinationDeg } = solarGeometry(at)
  return horizon(hourAngle(at, lonDeg), declinationDeg, latDeg)
}

/** De ángulo horario y declinación a altura y acimut sobre el horizonte. */
function horizon(haDeg: number, decDeg: number, latDeg: number): SkyPosition {
  const ha = haDeg * RAD
  const dec = decDeg * RAD
  const lat = latDeg * RAD
  const sinEl =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinEl)))
  // Acimut desde el norte. El signo del ángulo horario decide el lado: por la
  // mañana (ha < 0) el astro está al este.
  const azimuth = Math.atan2(
    -Math.sin(ha) * Math.cos(dec),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha),
  )
  return {
    elevationDeg: elevation * DEG,
    azimuthDeg: (azimuth * DEG + 360) % 360,
  }
}

/**
 * Duración del día en horas, del orto al ocaso geométricos.
 *
 * cos(H) = −tan(φ)·tan(δ). No se usa para dibujar —el mar solo necesita saber
 * dónde está el sol AHORA— sino para poder escribir en el panel cuánta luz
 * queda, que es lo que de verdad le importa a quien mira el mar a las ocho de
 * la tarde. Devuelve 24 o 0 en los casos polares, donde el coseno se sale.
 */
export function dayLengthHours(at: number, latDeg: number): number {
  const { declinationDeg } = solarGeometry(at)
  const c = -Math.tan(latDeg * RAD) * Math.tan(declinationDeg * RAD)
  if (c <= -1) return 24
  if (c >= 1) return 0
  return (2 * Math.acos(c) * DEG) / 15
}

// ---------------------------------------------------------------------------
// Luna
// ---------------------------------------------------------------------------
//
// AQUÍ YA NO HAY LUNA, y merece la pena decir por qué en el sitio donde estuvo.
//
// Vivió aquí una serie truncada de Meeus —un término de longitud, uno de
// latitud, geocéntrica— que servía perfectamente para lo único que se le pedía:
// mover el reflejo sobre el agua y saber cuánta luz echa. Cuando hubo que
// DIBUJAR el disco al lado de las estrellas se midió, y se equivocaba en 70
// minutos de arco de mediana: más de dos diámetros lunares.
//
// La luna se fue entera a `moon.ts`, con las tablas 47.A y 47.B completas, con
// paralaje topocéntrica y con el reloj en Tiempo Terrestre. `moonState` sigue
// existiendo allí con la misma firma, así que quien solo quiera altura, acimut
// y fase cambia el import y ya está.
//
// NO SE HA DEJADO UNA COPIA AQUÍ a propósito. Este fichero empieza contando que
// durante unos commits hubo dos astronomías en el repositorio y que quedó una;
// dejar la luna vieja de respaldo habría sido volver a tener dos.


/**
 * Elevación del sol en grados, para quien solo necesita eso.
 *
 * `vapor/breath.ts` la reexporta con este nombre: el reloj de la brisa de
 * ladera no sabe de acimutes, solo de si el sol lleva tres horas calentando una
 * ladera o tres horas sin hacerlo.
 *
 * En La Palma el máximo anual es 84,8°, en el solsticio de verano: la isla está
 * a 28,66° N y la declinación llega a 23,44°, así que el sol se queda a 5,2° de
 * la vertical.
 */
export function solarElevation(at: Date, lonDeg: number, latDeg: number): number {
  return sunPosition(at.getTime(), lonDeg, latDeg).elevationDeg
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
 * Vive aquí y no en la capa de nubes porque hay varias capas que se tienen que
 * apagar exactamente a la vez. Con una copia en cada una, bastaba con tocar un
 * número en un sitio para que empezara a llover de un cielo ya de noche.
 */
export function dayFactor(elevationDeg: number): number {
  return Math.min(1, Math.max(0, (elevationDeg + 6) / 9))
}
