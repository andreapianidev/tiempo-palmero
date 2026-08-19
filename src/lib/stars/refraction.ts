/**
 * Lo que el aire cambia entre el cielo geométrico y el cielo que se ve.
 *
 * Dos correcciones que van juntas porque contestan a la misma pregunta —«¿dónde
 * está de verdad el horizonte y qué hay por encima?»— y porque las dos dependen
 * de la altitud del observador, que en esta isla va de 0 a 2426 m:
 *
 *  1. **La refracción** levanta los astros. En el horizonte son 34 minutos de
 *     arco a nivel del mar: **más que el diámetro de la luna llena**, y más que
 *     los 22' de la precesión, que es el efecto grande del otro fichero. Un
 *     mapa de estrellas sin refracción tiene el orto de cada astro dos minutos
 *     tarde y la constelación pegada al horizonte visiblemente hundida.
 *  2. **La depresión del horizonte** lo baja. Desde el Roque de los Muchachos,
 *     a 2387 m, el horizonte del mar está **1,43° por debajo** de la
 *     horizontal, así que desde ahí arriba se ven estrellas que desde la costa
 *     están puestas. Es la misma razón por la que desde la cumbre se ve Canopus
 *     —declinación −52,7°, que a esta latitud culmina a 8,5°— y desde Santa Cruz
 *     apenas asoma.
 *
 * DE DÓNDE SALE LA FÓRMULA. Bennett 1982 con la corrección de Sæmundsson, tal
 * y como la publica Meeus, *Astronomical Algorithms*, cap. 16, ecuación 16.3:
 * entra la altura VERDADERA y sale cuánto hay que subirla. Error declarado por
 * debajo de 0,07' en todo el rango, que es una décima de píxel. La otra forma de
 * la misma pareja —16.4— va al revés, de aparente a verdadera, y confundirlas
 * mete un error de medio minuto de arco en el horizonte; aquí hace falta la 16.3
 * porque lo que se tiene es la posición calculada, no la observada.
 *
 * LA PRESIÓN Y LA TEMPERATURA NO SON CONSTANTES DE ADORNO. La refracción es
 * proporcional a la densidad del aire, y esta aplicación mide las dos cosas: en
 * la cumbre la presión ronda los 760 hPa contra los 1013 del nivel del mar, o
 * sea que **la refracción allí arriba es un 25 % menor**. Con la constante de
 * manual, un mapa hecho desde el Roque levantaría las estrellas del horizonte 8'
 * de más. El factor es el clásico (P/1010)·(283/(273+T)).
 *
 * ESTE FICHERO ESTÁ DUPLICADO EN GLSL, a propósito y con vigilancia. La capa
 * aplica la refracción por estrella en el sombreador, porque depende de la
 * altura de cada una; la copia vive en `components/stars/star-shaders.ts` y hay
 * una prueba que las compara término a término sobre una rejilla de alturas. Es
 * el mismo trato que ya tienen las otras capas: una fórmula en dos idiomas y una
 * prueba que no deja que se separen.
 */

const RAD = Math.PI / 180

/** Presión de referencia de la fórmula, hPa. No es 1013,25: Meeus usa 1010. */
export const REFERENCE_PRESSURE_HPA = 1010
/** Temperatura de referencia, °C. */
export const REFERENCE_TEMPERATURE_C = 10

/**
 * Cuánto sube el aire un astro que geométricamente está a `trueElevationDeg`.
 * Devuelve grados, siempre ≥ 0.
 *
 * POR DEBAJO DE −1° SE SATURA, y no devuelve cero. La primera versión devolvía
 * cero ahí abajo razonando que es cielo que está bajo el horizonte, y la prueba
 * la tumbó: **desde el Roque el horizonte está a −1,43°**, o sea que la zona
 * «debajo del horizonte» de un observador a nivel del mar es justo la que un
 * observador de cumbre sí ve, y devolver cero le quitaba los 39' de refracción
 * precisamente a las estrellas que se ven salir desde arriba.
 *
 * Se satura y no se extrapola porque la fórmula de Bennett deja de valer ahí:
 * tiene un polo en h = −5,11, y ya en −4 devuelve 11' —menos que en el
 * horizonte, que es físicamente imposible—. Saturar en el valor de −1° (38,8'
 * a presión de referencia) es quedarse en el último punto donde la fórmula
 * dice la verdad, y el error que eso deja es menor que la propia incertidumbre
 * de la refracción rasante, que depende de la inversión térmica y puede variar
 * varios minutos de arco de una noche a otra.
 */
export const BENNETT_FLOOR_DEG = -1

export function refractionDeg(
  trueElevationDeg: number,
  pressureHpa = REFERENCE_PRESSURE_HPA,
  temperatureC = REFERENCE_TEMPERATURE_C,
): number {
  const h = Math.max(BENNETT_FLOOR_DEG, trueElevationDeg)
  const arcmin = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD)
  const density =
    (pressureHpa / REFERENCE_PRESSURE_HPA) * (283 / (273 + temperatureC))
  return Math.max(0, (arcmin * density) / 60)
}

/**
 * Depresión del horizonte por altitud del observador, en grados.
 *
 * `1,753' · √h(m)`, la forma náutica clásica: es la depresión geométrica ya
 * corregida por la refracción terrestre con el coeficiente habitual k = 0,13.
 * La puramente geométrica —arccos(R/(R+h))— da 1,568° a 2387 m contra los 1,428°
 * de esta, y la diferencia de 8' es justo el aire que hay entre la cumbre y el
 * mar: usar la geométrica sería descontar dos veces la curvatura y no contar
 * nunca el aire.
 */
export function horizonDipDeg(elevationM: number): number {
  if (elevationM <= 0) return 0
  return (1.753 * Math.sqrt(elevationM)) / 60
}

/**
 * La altura mínima a la que hay que estar para verse desde aquí: la depresión
 * del horizonte, con signo negativo, menos lo que el aire levante ahí abajo.
 *
 * Sale negativa en cuanto el observador está por encima del mar, y es la cifra
 * que decide si una estrella entra en la escena o no.
 */
export function visibleFloorDeg(
  elevationM: number,
  pressureHpa = REFERENCE_PRESSURE_HPA,
  temperatureC = REFERENCE_TEMPERATURE_C,
): number {
  const dip = horizonDipDeg(elevationM)
  return -dip - refractionDeg(-dip, pressureHpa, temperatureC)
}
