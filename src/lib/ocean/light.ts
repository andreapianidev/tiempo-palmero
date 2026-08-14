/**
 * De qué color es la luz que le está dando al mar ahora mismo.
 *
 * TRES COSAS DECIDEN CÓMO SE VE EL AGUA, y las tres se saben:
 *
 *  1. DÓNDE ESTÁ EL SOL. Lo dice la geometría (`sun.ts`). Alto y blanco a
 *     mediodía; bajo, rojo y con una columna de reflejo larguísima al atardecer;
 *     ausente de noche, cuando lo único que queda es la luna, y solo si la hay.
 *
 *  2. CUÁNTA LUZ LLEGA DE VERDAD. Esto NO es geometría: es un dato medido. Las
 *     estaciones del Cabildo publican radiación solar, y comparada con la que
 *     habría con el cielo raso sale el *índice de claridad*, que es la forma
 *     estándar en meteorología de decir cuánto tapan las nubes. Con el mar de
 *     nubes cubriendo el norte, esa cifra baja y el agua se apaga de verdad,
 *     no por decisión de nadie.
 *
 *  3. CUÁNTO POLVO HAY EN EL AIRE. La calima no oscurece: DIFUNDE. El cielo
 *     deja de ser azul y se vuelve lechoso y dorado, el reflejo del sol pasa de
 *     ser una mancha nítida a una alfombra ancha, y el mar deja de reflejar
 *     azul para reflejar ese gris. Se saca del PM10 que miden las estaciones de
 *     calidad del aire, que la aplicación ya descarga.
 *
 * Todo esto sale en números que el sombreador aplica sin interpretar nada: los
 * colores se calculan aquí, donde se pueden probar.
 */

import { moonState, sunPosition } from './sun'

export type Rgb = [number, number, number]

export interface OceanLight {
  /** Vector unitario hacia el sol: (este, norte, arriba). */
  sunDir: Rgb
  sunColor: Rgb
  /** 0 de noche, 1 con el sol alto y el cielo raso. */
  sunIntensity: number
  moonDir: Rgb
  /** Ya multiplicada por la fracción iluminada del disco. */
  moonIntensity: number
  zenith: Rgb
  horizon: Rgb
  /** Luz que llega de todas partes: la que ilumina el agua en sombra. */
  ambient: Rgb
  /**
   * Cuánto se difunde el reflejo del sol, de 0 (espejo) a 1 (mancha ancha).
   * Sube con la calima y con las nubes.
   */
  haze: number
  /** Índice de claridad medido, de 0 a 1. `null` si no hay radiación fresca. */
  clearness: number | null
}

/**
 * Irradiancia de cielo raso sobre superficie horizontal, W/m².
 *
 * Modelo de Meinel: G = 1367 · sen(h) · 0,7^(AM^0,678), con la masa de aire
 * AM = 1/sen(h). Es el clásico de manual, con un error de un 10 % frente a los
 * modelos de radiación completos; para sacar un índice de claridad —que se usa
 * como cociente— eso se cancela casi entero.
 *
 * Devuelve 0 con el sol bajo el horizonte, que es donde el modelo deja de tener
 * sentido y donde tampoco hay nada que iluminar.
 */
export function clearSkyIrradiance(sunElevationDeg: number): number {
  if (sunElevationDeg <= 2) return 0
  const h = (sunElevationDeg * Math.PI) / 180
  const airMass = 1 / Math.sin(h)
  return 1367 * Math.sin(h) * Math.pow(0.7, Math.pow(airMass, 0.678))
}

/**
 * Índice de claridad: cuánta de la luz posible está llegando.
 *
 * 1 es cielo raso —en la práctica se queda entre 0,7 y 0,8, porque el modelo de
 * arriba es optimista— y por debajo de 0,3 el sol no se ve. Se recorta a 1,2
 * porque con nubes rotas un piranómetro puede marcar POR ENCIMA del cielo raso
 * durante unos minutos: es real (la nube refleja luz extra sobre el sensor) y no
 * es motivo para pintar un mar más brillante que el de un día despejado.
 */
export function clearnessIndex(
  measuredWm2: number | null,
  sunElevationDeg: number,
): number | null {
  if (measuredWm2 === null || !Number.isFinite(measuredWm2)) return null
  const clear = clearSkyIrradiance(sunElevationDeg)
  if (clear < 40) return null // sol demasiado bajo: el cociente no dice nada
  return Math.max(0, Math.min(1.2, measuredWm2 / clear))
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k]

/**
 * Colores de referencia, medidos de fotografías de mar abierto y ajustados
 * después contra la propia aplicación. No pretenden ser radiometría: son el
 * punto de partida que la geometría y los datos modulan.
 */
const SUN_HIGH: Rgb = [1.0, 0.97, 0.92]
const SUN_LOW: Rgb = [1.0, 0.55, 0.24]
const ZENITH_DAY: Rgb = [0.16, 0.33, 0.62]
const HORIZON_DAY: Rgb = [0.55, 0.68, 0.82]
const ZENITH_NIGHT: Rgb = [0.015, 0.025, 0.05]
const HORIZON_NIGHT: Rgb = [0.05, 0.07, 0.12]
const CALIMA: Rgb = [0.72, 0.62, 0.45]

export interface LightInputs {
  /** PM10 en µg/m³, de las estaciones de calidad del aire. */
  pm10: number | null
  /** Radiación solar medida, W/m². */
  solarWm2: number | null
}

/**
 * Umbral de calima, µg/m³ de PM10.
 *
 * El valor límite diario europeo son 50 µg/m³, y en Canarias los episodios de
 * calima lo multiplican por diez sin dificultad. Aquí 40 es donde el cielo
 * EMPIEZA a verse lechoso y 300 donde ya no se ve el horizonte; entre esos dos
 * se reparte el efecto.
 */
export const CALIMA_ONSET = 40
export const CALIMA_FULL = 300

export function calimaFactor(pm10: number | null): number {
  if (pm10 === null || !Number.isFinite(pm10)) return 0
  return Math.max(0, Math.min(1, (pm10 - CALIMA_ONSET) / (CALIMA_FULL - CALIMA_ONSET)))
}

/**
 * Reflectancia de la espuma: cuánta luz devuelve, sin decir cuánta le llega.
 *
 * Es un ALBEDO y no un color de pantalla. La espuma es aire dentro de agua y
 * dispersa casi todo lo que le entra —de 0,8 a 0,9 en las medidas de campo de
 * Whitlock (1982) sobre borreguillos—, contra el 0,05 escaso del agua de al
 * lado. Esa diferencia, de más de diez veces, es lo único que hace que la
 * rompiente se vea: no es que la espuma sea blanca, es que devuelve la luz de
 * la hora que sea mucho mejor que el agua.
 */
export const FOAM_ALBEDO: Rgb = [0.86, 0.89, 0.92]

/**
 * Con cuánta fuerza cuentan el sol y la luna en la luz que baña la superficie.
 *
 * 0,65 el sol NO es un gusto: es lo que deja la espuma de mediodía donde ya
 * estaba antes de separar el albedo de la luz. Con el sol a 70°, cielo raso y
 * sin calima, la espuma marcaba 0,618 / 0,678 / 0,772 en RGB; con el albedo
 * fuera y este 0,65 marca 0,607 / 0,664 / 0,750, un 2 % por debajo. Con 0,55
 * —el número que había— se quedaba en 0,521 / 0,578 / 0,665, un 16 % más apagada.
 */
export const FOAM_SUN = 0.65
export const FOAM_MOON = 0.25

/**
 * La luz que baña la superficie del mar, y por tanto la que ilumina tanto la
 * espuma como el fondo que se ve a través del agua.
 *
 * Vive aquí, y no suelta dentro del sombreador, porque es la cuenta que decide
 * si la rompiente sale más clara o más oscura que el agua que la rodea, y esa
 * es una afirmación que se puede comprobar con números a cualquier hora del
 * día: lo hace `light.test.ts`.
 */
export function surfaceLight(light: OceanLight): Rgb {
  const sun = light.sunIntensity * FOAM_SUN
  const moon = FOAM_MOON * light.moonIntensity
  return [
    light.ambient[0] + light.sunColor[0] * sun + moon,
    light.ambient[1] + light.sunColor[1] * sun + moon,
    light.ambient[2] + light.sunColor[2] * sun + moon,
  ]
}

/**
 * El color del agua bajo esa luz.
 *
 * Los colores base son los del agua oceánica limpia —el azul de mar abierto y
 * el turquesa del bajío— y lo que hace esta función es apagarlos con la luz que
 * de verdad hay: de noche el mar no es azul oscuro, es casi negro con lo que
 * refleje del cielo, y bajo una calima fuerte el turquesa del bajío se vuelve
 * gris verdoso porque la luz que entra en el agua ya no es blanca.
 *
 * LA ESPUMA NO SE APAGA AQUÍ, y antes sí: salía de esta función ya multiplicada
 * por `lit`, y el sombreador volvía a multiplicarla por la luz del momento.
 * Apagada dos veces, de noche la rompiente acababa MÁS OSCURA que el agua sobre
 * la que flota —0,017 de luminancia contra 0,027— y se dibujaba como una mancha
 * negra pegada a la costa. Es lo que se veía en producción el 14 de agosto de
 * 2026. Ahora de aquí sale el albedo y la luz la pone el sombreador, una vez.
 *
 * Vive aquí y no en el sombreador porque es una decisión de color, y las
 * decisiones de color se prueban mirando números, no recompilando.
 */
export function waterColors(light: OceanLight): {
  deep: Rgb
  shallow: Rgb
  /** Albedo, sin luz puesta: ver `FOAM_ALBEDO`. */
  foam: Rgb
  /**
   * Cuánta luz hay sobre el agua respecto a un mediodía despejado, de 0,22 a 1.
   * La usan los colores de aquí y, en el sombreador, la ortofoto del fondo.
   */
  lit: number
} {
  const DEEP: Rgb = [0.004, 0.022, 0.052]
  const SHALLOW: Rgb = [0.03, 0.26, 0.28]
  // Cuánta luz entra en el agua: el sol directo más el cielo. El 0,22 del
  // fondo es la luz que queda en una noche cerrada, y no es cero porque un mar
  // absolutamente negro se ve como un agujero recortado, no como agua.
  const lit = 0.22 + 0.78 * Math.min(1, light.sunIntensity + 0.35 * light.moonIntensity)
  const tint = (c: Rgb): Rgb => [
    c[0] * lit + light.ambient[0] * 0.25,
    c[1] * lit + light.ambient[1] * 0.25,
    c[2] * lit + light.ambient[2] * 0.25,
  ]
  return {
    deep: tint(DEEP),
    shallow: tint(SHALLOW),
    // La espuma no tiene color propio: dispersa la luz que le llega, y con el
    // sol bajo esa luz es naranja. Eso ya lo trae `u_sunColor` en el sombreador.
    foam: FOAM_ALBEDO,
    lit,
  }
}

export function oceanLight(
  at: number,
  lonDeg: number,
  latDeg: number,
  inputs: LightInputs = { pm10: null, solarWm2: null },
): OceanLight {
  const sun = sunPosition(at, lonDeg, latDeg)
  const moon = moonState(at, lonDeg, latDeg)

  const toVector = (elevationDeg: number, azimuthDeg: number): Rgb => {
    const e = (elevationDeg * Math.PI) / 180
    const a = (azimuthDeg * Math.PI) / 180
    return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
  }

  /**
   * El día no se apaga en el horizonte: entre el ocaso y la noche cerrada hay
   * una hora larga de crepúsculo. Se modela con la altura del sol entre −6°
   * (crepúsculo civil, todavía se lee un periódico) y +6°.
   */
  const daylight = Math.max(0, Math.min(1, (sun.elevationDeg + 6) / 12))
  const clearness = clearnessIndex(inputs.solarWm2, sun.elevationDeg)
  const calima = calimaFactor(inputs.pm10)

  // Con nubes, menos sol directo y más luz difusa. Sin medida, se supone cielo
  // raso: es lo que había antes de tener el dato y no empeora nada.
  const cloudy = clearness === null ? 0 : Math.max(0, Math.min(1, (0.72 - clearness) / 0.5))

  // El sol se enrojece al bajar: es el mismo camino óptico más largo que hace
  // que la calima y el ocaso se parezcan.
  const redness = Math.pow(1 - Math.max(0, Math.min(1, sun.elevationDeg / 25)), 2)
  const sunColor = mix(SUN_HIGH, SUN_LOW, Math.max(redness, calima * 0.6))
  const sunIntensity = daylight * (1 - 0.75 * cloudy) * (1 - 0.45 * calima)

  const zenith = mix(
    mix(ZENITH_NIGHT, ZENITH_DAY, daylight),
    CALIMA,
    calima * 0.8 * daylight,
  )
  const horizon = mix(
    mix(HORIZON_NIGHT, mix(HORIZON_DAY, SUN_LOW, redness * 0.6), daylight),
    CALIMA,
    calima * 0.9 * daylight,
  )

  // De noche la luna manda, y manda poco: la luna llena da unos 0,25 lux contra
  // los 100.000 del sol. Aquí no se trata de reproducir esa proporción —el mar
  // se quedaría negro— sino de que se note si hay luna o no la hay.
  const moonUp = Math.max(0, Math.min(1, (moon.elevationDeg + 2) / 10))
  const moonIntensity = (1 - daylight) * moonUp * moon.illumination

  const ambient = mix(
    scale(zenith, 0.35 + 0.45 * cloudy),
    scale([0.06, 0.09, 0.16], 1),
    1 - daylight,
  )

  return {
    sunDir: toVector(sun.elevationDeg, sun.azimuthDeg),
    sunColor,
    sunIntensity,
    moonDir: toVector(moon.elevationDeg, moon.azimuthDeg),
    moonIntensity,
    zenith,
    horizon,
    ambient,
    // Nubes y calima difuminan el reflejo por el mismo motivo físico: la luz
    // deja de venir de un punto y viene de medio cielo.
    haze: Math.max(0, Math.min(1, 0.15 + 0.55 * calima + 0.5 * cloudy)),
    clearness,
  }
}
