/**
 * Dónde está el sol —y la luna— sobre la isla en este instante.
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
 * DE DÓNDE SALE. El algoritmo solar es el de la NOAA (*Solar Position
 * Calculator*, el mismo de la hoja de cálculo pública del ESRL), que da la
 * declinación con un error por debajo de 0,01° en este siglo. El lunar es la
 * versión truncada de Meeus, *Astronomical Algorithms* cap. 47: unos pocos
 * minutos de arco de error, que para decidir de qué color es una cresta sobra.
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

export interface MoonState extends SkyPosition {
  /** Fracción iluminada del disco, de 0 (luna nueva) a 1 (llena). */
  illumination: number
}

/**
 * Posición y fase de la luna.
 *
 * Serie truncada de Meeus: los términos principales de longitud, latitud y
 * distancia. La fase NO sale de un mes sinódico contado desde una luna nueva de
 * referencia —eso arrastra horas de error y, peor, no sabe nada de dónde está
 * la luna—, sino de la elongación geométrica real entre el sol y la luna, que
 * es la definición de la fase.
 */
export function moonState(at: number, lonDeg: number, latDeg: number): MoonState {
  const d = julianDay(at) - J2000
  const eclipticLong = (218.316 + 13.176396 * d) * RAD
  const meanAnomaly = (134.963 + 13.064993 * d) * RAD
  const meanDistance = (93.272 + 13.22935 * d) * RAD

  const lambda = eclipticLong + 6.289 * RAD * Math.sin(meanAnomaly)
  const beta = 5.128 * RAD * Math.sin(meanDistance)
  const distanceKm = 385001 - 20905 * Math.cos(meanAnomaly)

  const obliq = 23.4397 * RAD
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(obliq) - Math.tan(beta) * Math.sin(obliq),
    Math.cos(lambda),
  )
  const dec = Math.asin(
    Math.sin(beta) * Math.cos(obliq) + Math.cos(beta) * Math.sin(obliq) * Math.sin(lambda),
  )

  // Ángulo horario de la luna: el del punto Aries (tiempo sidéreo) menos su
  // ascensión recta. La constante 280,16 + 360,9856235·d es el tiempo sidéreo
  // medio de Greenwich en grados.
  const siderealDeg = 280.16 + 360.9856235 * d + lonDeg
  const moonHourAngle = ((siderealDeg - ra * DEG + 540) % 360) - 180
  const position = horizon(moonHourAngle, dec * DEG, latDeg)

  // Fase por elongación. La distancia al sol entra porque la luna no está en el
  // centro de la órbita terrestre: sin ella, la luna llena saldría del 100 %
  // exacto en vez del 99,x % que de verdad se ve casi siempre.
  const { declinationDeg, rightAscensionDeg } = solarGeometry(at)
  const sunDec = declinationDeg * RAD
  const sunRa = rightAscensionDeg * RAD
  const elongation = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(sunDec) * Math.sin(dec) +
          Math.cos(sunDec) * Math.cos(dec) * Math.cos(sunRa - ra),
      ),
    ),
  )
  const sunDistanceKm = 149_598_000
  const phaseAngle = Math.atan2(
    sunDistanceKm * Math.sin(elongation),
    distanceKm - sunDistanceKm * Math.cos(elongation),
  )

  return { ...position, illumination: (1 + Math.cos(phaseAngle)) / 2 }
}

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
