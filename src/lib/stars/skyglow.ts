/**
 * Cuánto brilla el fondo del cielo: la cifra que decide cuántas estrellas hay.
 *
 * LA UNIDAD ES `mag/arcsec²` y va al revés de lo que sugiere la palabra
 * «brillo»: **más alto es más oscuro**. 21,5 es un cielo de reserva Starlight;
 * 18 es un pueblo; 16 es una farola cerca. Es la unidad que publican los
 * fotómetros del Cabildo, así que es la que se usa en todo el módulo para no
 * convertir dos veces.
 *
 * ESTE FICHERO ES EL PLAN B. Cuando hay un fotómetro de la red con una lectura
 * fresca, ese número gana y aquí no se llama a nadie: una medida del cielo de
 * esta noche vale más que cualquier modelo, y además **ya lleva la luna
 * dentro**, que es el error más fácil de cometer —sumarle a una medida un
 * modelo de algo que la medida ya contiene—. Lo que hay aquí es lo que se
 * enseña cuando no hay lectura utilizable: de día, con la red caída, o en un
 * punto de la isla lejos de cualquier fotómetro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA LEY DEL CREPÚSCULO ESTÁ MEDIDA EN ESTA ISLA, no copiada de un manual.
 *
 * Sobre el archivo de la red del Cabildo del 17-18 de agosto de 2026 —15 111
 * lecturas, seis estaciones, cadencia de 32 s en las cuatro TESS—, filtrando a
 * luna bajo el horizonte y ajustando el exceso de flujo contra la altura del
 * sol, sale que el flujo del cielo es el del cielo oscuro más un término que
 * decae exponencialmente con la depresión solar:
 *
 *     F(h) = F_oscuro + 10^(a + b·h)      h = altura del sol, grados, negativa
 *
 * y **b sale igual en todas las estaciones**, que es lo que convierte el ajuste
 * en una ley y no en una curva:
 *
 * | Estación | altitud | b | a | base (p90) |
 * |---|---|---|---|---|
 * | stars403 · AstroNorte | 1000 m | 0,4400 | −2,494 | 21,49 |
 * | stars411 · SkyPalma | 900 m | 0,4386 | −2,578 | 21,81 |
 * | stars394 · ORM-NOT | 2382 m | 0,4366 | −2,637 | 21,79 |
 * | LPL2_048 · Puntallana | 300 m | 0,4340 | −2,466 | 21,30 |
 * | LPL2_016 · El Jaral | 600 m | 0,4390 | −2,380 | 21,63 |
 *
 * En magnitudes, b = 0,438 por grado son **1,10 mag de cielo por cada grado que
 * el sol baja**, y el residuo del ajuste sobre las 832 lecturas de la estación
 * con más datos es de 0,13 mag de media y 0,55 en el peor caso. El intercepto a
 * sí cambia de sitio a sitio —es cuánta atmósfera iluminada ve cada uno— y por
 * eso entra como parámetro y no como constante.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA LUNA: Krisciunas y Schaefer 1991, sin tocar, y con su sesgo medido.
 *
 * El modelo (PASP 103, 1033) es el estándar: brillo de la luna por su ángulo de
 * fase, función de dispersión por la separación angular, y extinción por el
 * camino óptico de la luna y del trozo de cielo que se mira. Comparado contra
 * las 257 lecturas de esas dos noches con la luna a más de 10° de altura y un
 * 29-39 % iluminada, **predice un cielo 0,64 mag más oscuro del que la red
 * mide**, y la desviación es igual en las cuatro estaciones (0,50 · 0,55 · 0,63
 * · 0,68).
 *
 * Comprobado que no es el coeficiente de extinción: moviendo k de 0,10 a 0,45
 * —un factor 4,5, de noche limpia a calima gorda— el sesgo solo baja de 0,68 a
 * 0,58. O sea que no es un parámetro mal puesto, es el modelo. La explicación
 * más probable es la banda: un SQM mide mucho más ancho que la V fotométrica
 * para la que K&S está calibrado, y ve luz de luna dispersada que la V no ve.
 *
 * El sesgo **no se corrige**: se declara, se prueba y se explica en
 * `MOON_MODEL_BIAS`. El intento de corregirlo con un factor ajustado a esas dos
 * noches arreglaba el cuarto creciente y rompía la luna llena, que es peor que
 * el sesgo conocido. Por eso el panel dice «modelo» en cuanto esta rama se usa,
 * y por eso el fotómetro fresco siempre gana.
 */

import { moonIlluminance, opticalPath, phaseAngleFromIllumination } from '../moon-brightness'

/** Nanolamberts de un brillo en mag/arcsec². Krisciunas y Schaefer 1991, ec. 27. */
export function nanoLamberts(magArcsec2: number): number {
  return 34.08 * Math.exp(20.7233 - 0.92104 * magArcsec2)
}

/** El camino de vuelta. */
export function magArcsec2(nl: number): number {
  return (20.7233 - Math.log(Math.max(1e-12, nl) / 34.08)) / 0.92104
}

/**
 * El cielo oscuro de referencia de la isla, mag/arcsec².
 *
 * Mediana de las seis bases medidas de la tabla de la cabecera —21,30 a 21,81—,
 * tomando de cada estación el percentil 90 de sus lecturas con el sol por
 * debajo de −18° y la luna puesta. No es el récord: el récord de esas dos
 * noches son 22,43 en La Cumbrecita, y ponerlo aquí haría que el modelo
 * enseñara siempre el mejor cielo posible en vez del habitual.
 */
export const ISLAND_DARK_SKY = 21.6

/** Pendiente de la ley del crepúsculo, en log10 de flujo por grado. Medida. */
export const TWILIGHT_SLOPE = 0.438
/**
 * Intercepto medio de las cinco estaciones ajustadas, medido — **en unidades
 * de flujo `10^(−0,4·V)`**, que es donde se hizo el ajuste, no en
 * nanolamberts.
 *
 * La diferencia entre las dos unidades es un factor 3,41 × 10¹⁰, y confundirlas
 * es el fallo que este comentario existe para evitar: el crepúsculo saldría diez
 * órdenes de magnitud por debajo del cielo oscuro y la ley no haría nada. La
 * conversión está en `FLUX_TO_NL` y se aplica una sola vez.
 */
export const TWILIGHT_INTERCEPT = -2.51

/**
 * Nanolamberts por unidad de flujo `10^(−0,4·V)`: `34,08 · e^20,7233`.
 * Sale de igualar las dos formas de la ecuación 27 de Krisciunas y Schaefer.
 */
const FLUX_TO_NL = 34.08 * Math.exp(20.7233)

/**
 * Brillo que el crepúsculo añade al cielo, en nanolamberts. Cero de noche
 * cerrada, porque el término decae solo.
 *
 * Se corta por arriba en −0,5°: por encima de eso el sol está saliendo y la
 * fórmula, extrapolada, daría un cielo más brillante que el propio disco solar.
 * No es un caso que se dibuje nunca —la capa no se enciende de día— pero una
 * función que devuelve infinito fuera de su rango es una trampa esperando.
 */
export function twilightExcess(
  sunElevationDeg: number,
  intercept = TWILIGHT_INTERCEPT,
): number {
  const h = Math.min(-0.5, sunElevationDeg)
  return FLUX_TO_NL * Math.pow(10, intercept + TWILIGHT_SLOPE * h)
}

/**
 * CALIBRACIÓN LOCAL DEL TÉRMINO LUNAR: el flujo de la luna, por tres.
 *
 * ESTA CONSTANTE SUSTITUYE A UN `MOON_MODEL_BIAS = 0,64` QUE SE DECLARABA Y NO
 * SE CORREGÍA, y conviene dejar escrito por qué se corrige ahora, porque el
 * motivo de no hacerlo antes resultó estar equivocado.
 *
 * LO QUE SE CREÍA. Medido sobre dos noches con la luna al 29-39 %, Krisciunas y
 * Schaefer daba el cielo 0,64 mag más oscuro que la red. Un factor de 3,5 sobre
 * el flujo lunar lo arreglaba, pero se descartó con este argumento: llevado a
 * luna llena daría 16,3-17,4 mag/arcsec² «cuando lo que se publica para un
 * sitio oscuro con luna llena son 17,5-18,5», o sea que arreglaba la fase
 * medida y rompía la que no.
 *
 * LO QUE LA LUNACIÓN ENTERA DICE. Ese argumento comparaba el modelo con la
 * BIBLIOGRAFÍA teniendo la red delante. Medido ahora sobre 987 lecturas con la
 * luna llena por encima de 40° en los seis sitios oscuros de la isla, lo que
 * los fotómetros del Cabildo miden de verdad es **16,18 - 17,26, mediana
 * 16,62**. No 17,5-18,5. El cielo de La Palma con luna llena es más de una
 * magnitud más brillante que el sitio oscuro de manual, y la explicación más
 * probable es la de aquí: el polvo sahariano dispersa la luz de la luna mucho
 * mejor que la atmósfera para la que K&S se calibró.
 *
 * O sea que el factor no rompía la luna llena. La rompía la referencia.
 *
 * EL SESGO CRECE CON LA FASE, que es lo que decide la forma de la corrección.
 * Con dos noches de una sola fase no se puede distinguir un desplazamiento
 * constante de una curva de fase mal escalada; con treinta días sí. Medido
 * sobre 26 932 lecturas de noche cerrada con la luna a más de 10°
 * (`scripts/checks/luna-sesgo.ts`), tomando como cielo base la MEDIANA sin luna
 * de cada estación para que el control quede en cero:
 *
 * | Fase | Lecturas | Sesgo K&S | Con ×3 |
 * |---|---:|---:|---:|
 * | 0-15 % | 114 | −0,24 | −0,24 |
 * | 15-30 % | 1389 | 0,15 | −0,14 |
 * | 30-50 % | 2547 | 0,45 | — |
 * | 50-70 % | 3288 | 0,57 | −0,15 |
 * | 70-90 % | 7828 | 0,99 | — |
 * | 90-100 % | 11 766 | **1,12** | **0,05** |
 *
 * Un sesgo que va de 0,15 a 1,12 según la fase no es un desplazamiento: es la
 * amplitud del término lunar. Restar una constante lo demuestra —deja −1,09 en
 * la luna nueva y +0,27 en la llena—. Multiplicar el flujo por 3 lo aplana:
 * sesgo global −0,03 y error absoluto medio de 1,01 a **0,54 mag**, la mitad.
 *
 * POR QUÉ 3 Y NO 3,5. Barrido de 1 a 4 sobre la lunación: el error absoluto
 * medio toca fondo en 0,53-0,54 entre 3 y 3,5, pero el sesgo cambia de signo en
 * medio. Con 3 queda en −0,03 y con 3,5 en −0,17. Se coge el que no desplaza.
 *
 * ES UNA CALIBRACIÓN LOCAL Y SE LLAMA ASÍ. No es una corrección a Krisciunas y
 * Schaefer, que está publicado y validado donde se midió: es el mismo tipo de
 * ajuste que ya lleva `TWILIGHT_INTERCEPT`, medido en esta red y válido para
 * esta isla. Quien lleve esto a otro sitio tiene que volver a medirlo.
 */
export const MOON_SCATTER_FACTOR = 3

/**
 * Lo que queda del sesgo después de calibrar: −0,03 mag sobre la lunación
 * entera, contra los 0,64 de antes. La prueba lo vigila para que no vuelva a
 * crecer sin que nadie se entere.
 */
export const MOON_MODEL_BIAS = 0.03

export interface MoonGlow {
  /** Fracción iluminada del disco, 0 a 1. */
  illumination: number
  /** Altura de la luna sobre el horizonte, grados. */
  elevationDeg: number
}

/**
 * Brillo que la luna añade a un trozo de cielo, en nanolamberts.
 *
 * Devuelve cero con la luna bajo el horizonte, que es correcto y además evita
 * que el término de extinción de la luna se dispare cuando su camino óptico
 * tiende a infinito.
 */
export function moonGlowNl(
  moon: MoonGlow,
  skyElevationDeg: number,
  separationDeg: number,
  extinctionK: number,
): number {
  if (moon.elevationDeg <= 0) return 0
  // Iluminancia de la luna, ec. 20 del mismo trabajo. Vive en
  // `moon-brightness.ts` junto con el resto de la curva de fase, porque el mar
  // la necesita igual: dos copias de esta cuenta eran dos lunas de brillos
  // distintos en la misma pantalla.
  const illuminance = moonIlluminance(phaseAngleFromIllumination(moon.illumination))
  // Función de dispersión, ec. 21: Rayleigh —el coseno cuadrado— más Mie, que
  // es el halo cerrado alrededor del disco.
  const rho = (separationDeg * Math.PI) / 180
  const scatter =
    Math.pow(10, 5.36) * (1.06 + Math.cos(rho) * Math.cos(rho)) +
    Math.pow(10, 6.15 - separationDeg / 40)
  const xMoon = opticalPath(90 - moon.elevationDeg)
  const xSky = opticalPath(90 - Math.max(0, skyElevationDeg))
  return (
    MOON_SCATTER_FACTOR *
    scatter *
    illuminance *
    Math.pow(10, -0.4 * extinctionK * xMoon) *
    (1 - Math.pow(10, -0.4 * extinctionK * xSky))
  )
}

export interface SkyGlowInput {
  /** Altura del sol, grados. Negativa de noche. */
  sunElevationDeg: number
  /** La luna, o `null` si no se sabe dónde está. */
  moon: MoonGlow | null
  /** Separación angular entre la luna y el punto del cielo que se evalúa. */
  moonSeparationDeg: number
  /** Altura del punto del cielo que se evalúa. 90 es el cenit. */
  skyElevationDeg: number
  /** Cielo oscuro de base del sitio, mag/arcsec². */
  darkSky?: number
  /** Coeficiente de extinción, mag por masa de aire. */
  extinctionK: number
  /** Intercepto local de la ley del crepúsculo. */
  twilightIntercept?: number
}

/**
 * El brillo del fondo del cielo modelado, mag/arcsec².
 *
 * Los tres términos se suman **en flujo y no en magnitudes**, que es la única
 * forma correcta: las magnitudes son logaritmos, y sumarlas multiplicaría los
 * brillos en vez de sumarlos. Es el error clásico de este cálculo y da cielos
 * absurdamente brillantes en cuanto hay dos fuentes.
 */
export function modelledSkyGlow(input: SkyGlowInput): number {
  const dark = input.darkSky ?? ISLAND_DARK_SKY
  let nl = nanoLamberts(dark)
  nl += twilightExcess(input.sunElevationDeg, input.twilightIntercept)
  if (input.moon) {
    nl += moonGlowNl(
      input.moon,
      input.skyElevationDeg,
      input.moonSeparationDeg,
      input.extinctionK,
    )
  }
  return magArcsec2(nl)
}
