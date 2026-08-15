/**
 * La carrera del sol: por dónde pasa hoy, del orto al ocaso.
 *
 * POR QUÉ HACÍA FALTA. El disco del sol se ve en una ventana estrechísima: con
 * la vista inclinada al tope el borde de arriba de la pantalla queda a 3,4°
 * sobre el horizonte —75° de inclinación menos los 90 del cenit, más medio
 * campo de visión de 18,4°—, así que el sol solo entra en cuadro cerca del orto
 * y del ocaso. El resto del día la casilla está encendida y no se dibuja nada,
 * que desde fuera no se distingue de un fallo. Este camino sí se ve: sale del
 * horizonte por donde salió el sol, se va por arriba de la pantalla y vuelve a
 * bajar por donde se va a poner.
 *
 * Y LOS DOS EXTREMOS SON LO QUE INTERESA. Por dónde sale y por dónde se pone
 * HOY, contra la Cumbre de verdad y no contra un horizonte de libro: en La
 * Palma el sol tarda una hora larga en asomar por encima del filo desde que
 * sale astronómicamente, y esa hora se ve dibujada —el trozo de camino que la
 * montaña tapa— sin calcular nada, porque la capa que lo pinta va al fondo de
 * la escena y el relieve la come. Lo mismo por el oeste al atardecer.
 *
 * ORTO Y OCASO SON LOS OFICIALES, a −0,833° de altura del centro del disco: 16'
 * de semidiámetro —el sol se cuenta salido cuando asoma el borde de arriba, no
 * el centro— más 34' de refracción atmosférica media, que es la que levanta el
 * disco por encima del horizonte cuando geométricamente todavía está debajo.
 * Es la definición estándar, la misma que usan los almanaques.
 *
 * COMPROBADO CONTRA UN TERCERO. Cuatro días de 2026 contra los que publica
 * Open-Meteo para 28,65 N 17,86 O (ver `sun-path.test.ts`): 14 de mayo, 21 de
 * junio, 15 y 30 de agosto. Máxima diferencia, 1 minuto, que es la resolución
 * con la que ellos lo publican. No es una comprobación de estilo: el orto y el
 * ocaso salen escritos en el panel con hora y rumbo, y una cifra escrita se
 * verifica.
 *
 * NO PIDE NADA A NADIE, como el resto de `sun.ts`: es geometría sobre la misma
 * astronomía de la NOAA que ya usan el mar, las nubes y el relieve. Un servicio
 * de efemérides habría sido una dependencia externa para calcular lo calculable.
 */

import { canaryOffsetMs } from '../cabildo'
import { hourAngle, solarGeometry, sunPosition, type SkyPosition } from '../sun'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const HOUR_MS = 3_600_000

/**
 * Altura del CENTRO del disco en el orto y el ocaso oficiales.
 *
 * −0,833° = −(16' de semidiámetro + 34' de refracción). Cambiarlo por 0° —el
 * horizonte geométrico— adelanta el ocaso unos tres minutos en esta latitud, y
 * los tres minutos se notan: es la diferencia entre la hora que da esta
 * aplicación y la que da cualquier otra.
 */
export const RISE_SET_ELEVATION_DEG = -0.833

/**
 * El mediodía solar más cercano a un instante: cuando el sol cruza el meridiano
 * del lugar y está en su punto más alto.
 *
 * Se resuelve con el propio ángulo horario, que ya vale 0 en el tránsito y
 * crece 15° por hora: restar el ángulo actual deja el reloj encima del tránsito.
 * La segunda vuelta recoge lo que se mueve la ecuación del tiempo en esas
 * horas —hasta unos segundos— y con eso ya no cambia nada.
 *
 * Como el ángulo horario vive en [−180°, 180°), la corrección nunca pasa de doce
 * horas: lo que sale es el tránsito MÁS CERCANO, el de hoy si es de día y el que
 * acaba de pasar o está por venir si es de noche.
 */
export function solarTransit(at: number, lonDeg: number): number {
  let t = at
  for (let i = 0; i < 2; i++) t -= (hourAngle(t, lonDeg) / 15) * HOUR_MS
  return t
}

/**
 * Ángulo horario, en grados, al que el sol cruza una altura dada.
 *
 * cos(H) = (sen h − sen φ · sen δ) / (cos φ · cos δ). Devuelve `null` cuando el
 * coseno se sale de [−1, 1], que es como se dice «ese día el sol no llega a esa
 * altura, o no baja de ella»: el día polar y la noche polar. Aquí no pasa nunca
 * —La Palma está a 28,7° N— pero la función no sabe dónde está y devolver un
 * `NaN` silencioso sería peor.
 */
function hourAngleAt(elevationDeg: number, decDeg: number, latDeg: number): number | null {
  const c =
    (Math.sin(elevationDeg * RAD) - Math.sin(latDeg * RAD) * Math.sin(decDeg * RAD)) /
    (Math.cos(latDeg * RAD) * Math.cos(decDeg * RAD))
  if (!(c >= -1 && c <= 1)) return null
  return Math.acos(c) * DEG
}

/**
 * Un orto o un ocaso: cuándo, y POR DÓNDE.
 *
 * El rumbo va con la hora y no aparte porque es la mitad de la respuesta: en La
 * Palma el sol sale 30° más al norte en junio que en diciembre, o sea por encima
 * de la Cumbre en verano y por detrás de otro sitio en invierno. Una hora sin
 * rumbo no dice si el sol le va a dar a una finca.
 */
export interface SunEvent {
  at: number
  azimuthDeg: number
}

export interface SunEvents {
  /** Mediodía solar: el sol en su punto más alto. */
  transitMs: number
  /** Orto y ocaso oficiales. `null` los días en que el sol no sale o no se pone. */
  sunrise: SunEvent | null
  sunset: SunEvent | null
  /** Altura del sol en el tránsito, grados. Lo alto que llega hoy. */
  maxElevationDeg: number
  /** Horas entre el orto y el ocaso. `null` si alguno de los dos no existe. */
  daylightHours: number | null
}

/**
 * A qué hora cruza el sol una altura dada, subiendo o bajando.
 *
 * ES LA MISMA CUENTA DEL ORTO CON OTRA ALTURA, y por eso está suelta: además del
 * orto y el ocaso —que son el cruce de −0,833°— el panel necesita saber cuándo
 * el sol baja del techo de la pantalla (3,4°, ver `sun-screen.ts`), que es el
 * momento a partir del cual el disco entra en cuadro. Escribir esa segunda
 * cuenta aparte habría sido tener dos.
 *
 * SE ITERA TRES VECES y no se resuelve de una: la declinación del sol cambia
 * hasta 0,4° al día, así que el ángulo horario calculado con la declinación del
 * mediodía se equivoca en segundos. Cada vuelta la recalcula en la hora
 * estimada, y la última la resuelve sobre la elevación misma.
 */
export function sunCrossing(
  at: number,
  lonDeg: number,
  latDeg: number,
  elevationDeg: number,
  /** −1 el cruce de la mañana, subiendo; +1 el de la tarde, bajando. */
  side: -1 | 1,
): number | null {
  const transitMs = solarTransit(at, lonDeg)
  // Seis horas del tránsito: el arranque está siempre del lado bueno, y a esa
  // distancia el tránsito más cercano sigue siendo el mismo.
  let t = transitMs + side * 6 * HOUR_MS
  for (let i = 0; i < 3; i++) {
    const h = hourAngleAt(elevationDeg, solarGeometry(t).declinationDeg, latDeg)
    if (h === null) return null
    t = solarTransit(t, lonDeg) + side * (h / 15) * HOUR_MS
  }

  // Y UNA ÚLTIMA VUELTA SOBRE LA ALTURA MISMA, que es lo que se quería
  // resolver. Las tres de arriba usan la declinación de la hora ESTIMADA para
  // sacar la hora buena, así que se muerden la cola y se paran a unos tres
  // segundos —0,012° de altura, medido—. Un paso de Newton sobre la elevación
  // real, con la pendiente sacada de medio minuto a cada lado, lo baja a menos
  // de una milésima de grado y no arrastra ninguna aproximación: `sunPosition`
  // es la función que después dibuja el sol.
  const antes = sunPosition(t - 30_000, lonDeg, latDeg).elevationDeg
  const despues = sunPosition(t + 30_000, lonDeg, latDeg).elevationDeg
  const pendiente = (despues - antes) / 60_000
  if (pendiente !== 0) {
    t -= (sunPosition(t, lonDeg, latDeg).elevationDeg - elevationDeg) / pendiente
  }

  // Al segundo. Lo que sobra son milésimas de una iteración numérica, no
  // precisión: la refracción de verdad varía con la presión y la temperatura
  // bastante más que eso.
  return Math.round(t / 1000) * 1000
}

/** El orto, el ocaso y el mediodía del día que contiene ese instante. */
export function sunEvents(at: number, lonDeg: number, latDeg: number): SunEvents {
  const transitMs = solarTransit(at, lonDeg)
  const maxElevationDeg = sunPosition(transitMs, lonDeg, latDeg).elevationDeg

  const event = (t: number | null): SunEvent | null =>
    t === null ? null : { at: t, azimuthDeg: sunPosition(t, lonDeg, latDeg).azimuthDeg }

  const sunrise = event(sunCrossing(at, lonDeg, latDeg, RISE_SET_ELEVATION_DEG, -1))
  const sunset = event(sunCrossing(at, lonDeg, latDeg, RISE_SET_ELEVATION_DEG, 1))
  return {
    transitMs,
    sunrise,
    sunset,
    maxElevationDeg,
    daylightHours: sunrise && sunset ? (sunset.at - sunrise.at) / HOUR_MS : null,
  }
}

/** Qué marca lleva un punto del camino. */
export type TrackMark = 'none' | 'hour' | 'now'

export interface TrackPoint extends SkyPosition {
  at: number
  mark: TrackMark
}

/**
 * Cada cuánto se muestrea el camino, en minutos.
 *
 * MEDIDO, no elegido. El dibujo es una polilínea, y lo que decide el paso es
 * cuánto se separa la cuerda del arco de verdad. Medido contra un muestreo de un
 * minuto el 21 de junio de 2026 en La Palma —el día más largo, el que más arco
 * tiene—, la separación máxima es:
 *
 *   10 min → 0,005°   20 min → 0,020°   30 min → 0,045°   60 min → 0,180°
 *
 * El listón es un píxel: el campo de visión de MapLibre son 36,87° repartidos
 * en unos 900 píxeles de alto, o sea 24 píxeles por grado. A 20 minutos la
 * separación es de 0,020°, medio píxel, que no se ve; a 30 son 1,1 px, ya en el
 * filo; a 60, 4,4 px, y el arco se lee hecho de trozos rectos. La otra orilla es
 * el coste, y no aprieta: 20 minutos son 43 puntos en el día más largo, que se
 * proyectan una vez por fotograma sin que se note.
 */
export const TRACK_STEP_MIN = 20

/** Dos muestras más juntas que esto se funden en una: evita segmentos nulos. */
const MIN_GAP_MS = 60_000

/**
 * El camino del sol de hoy, del orto al ocaso, listo para dibujar.
 *
 * LAS HORAS EN PUNTO VAN MARCADAS, y son horas del reloj de la isla, no UTC ni
 * solares: quien mira cuenta marcas hasta el horizonte para saber cuánta luz le
 * queda, y esa cuenta solo sirve si las marcas son las de su reloj. El desfase
 * de Canarias se pregunta una vez, en el orto: los dos días del año en que
 * cambia, el cambio es a la 1 de la madrugada, o sea con el sol debajo.
 *
 * LA POSICIÓN DE AHORA ENTRA COMO UN PUNTO MÁS, marcada aparte, y solo si el sol
 * está fuera. Así el dibujo tiene un cursor sobre el camino sin que la capa
 * tenga que calcular por su cuenta dónde cae —que es como se desincronizan las
 * cosas— y sin inventarse un segundo sol: el disco es el de `SunLayer`, medido
 * a 0,53°, y esto es una marca sobre una línea.
 */
export function sunTrack(at: number, lonDeg: number, latDeg: number): TrackPoint[] {
  const { sunrise, sunset } = sunEvents(at, lonDeg, latDeg)
  if (!sunrise || !sunset) return []
  const sunriseMs = sunrise.at
  const sunsetMs = sunset.at

  const marks = new Map<number, TrackMark>()
  /**
   * Manda la marca más fuerte: ahora sobre la hora en punto, y la hora en punto
   * sobre un punto de paso. Las tres cosas caen encima la una de la otra más de
   * lo que parece —el desfase de Canarias es una hora justa, así que las horas
   * locales en punto son horas UTC en punto, y a las 14:00 en punto coinciden
   * la marca de la hora y la de ahora—, y sin este orden la marca de ahora
   * desaparecía exactamente a en punto.
   */
  const RANK: Record<TrackMark, number> = { none: 0, hour: 1, now: 2 }
  const put = (t: number, mark: TrackMark) => {
    const previous = marks.get(t)
    if (previous === undefined || RANK[mark] > RANK[previous]) marks.set(t, mark)
  }

  const step = TRACK_STEP_MIN * 60_000
  for (let t = sunriseMs; t < sunsetMs; t += step) put(t, 'none')
  put(sunsetMs, 'none')

  const offset = canaryOffsetMs(sunriseMs)
  const firstHour = Math.ceil((sunriseMs + offset) / HOUR_MS) * HOUR_MS - offset
  for (let t = firstHour; t < sunsetMs; t += HOUR_MS) put(t, 'hour')

  if (at > sunriseMs && at < sunsetMs) put(at, 'now')

  const times = [...marks.entries()].sort((a, b) => a[0] - b[0])
  const points: TrackPoint[] = []
  for (const [t, mark] of times) {
    const last = points[points.length - 1]
    // Dos muestras pegadas —una hora en punto que cae encima de un punto de
    // paso, o el instante de ahora sobre cualquiera de los dos— se funden, y
    // gana la marca: un segmento de tres segundos de largo no se ve y sí
    // ensucia el cálculo de la normal con la que se le da grosor a la línea.
    if (last && t - last.at < MIN_GAP_MS) {
      if (RANK[mark] > RANK[last.mark]) last.mark = mark
      continue
    }
    points.push({ at: t, mark, ...sunPosition(t, lonDeg, latDeg) })
  }
  return points
}
