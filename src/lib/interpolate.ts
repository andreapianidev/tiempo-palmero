/**
 * Motor de interpolación.
 *
 * La Palma sube de 0 a 2426 m en 42 km. La altitud domina cualquier variable
 * atmosférica, así que interpolar los valores crudos en el plano es un error
 * de bulto: da ~2,5 °C de desviación. La receta correcta es separar la parte
 * explicada por la altitud de la parte local, interpolar solo esa segunda, y
 * devolver la primera en el punto destino.
 *
 * Orden, que importa:
 *   1. FILTRO         estaciones utilizables (ver quality.ts)
 *   2. AJUSTE         regresión OLS del valor sobre la altitud → gradiente medido
 *   3. RECHAZO        outliers a 2,5σ, iterando hasta estabilizar
 *   4. DETENDENCIA    residuo = valor − b · altitud
 *   5. IDW            sobre los residuos, 1/d², haversine, corte a 15 km
 *   6. RETENDENCIA    valor = residuo interpolado + b · altitud_destino
 *
 * El paso 3 no es cosmético. Un único sensor descalibrado (uno a 1560 m que
 * marca 3,1 °C en agosto) pasa el filtro de plausibilidad y duplica el error
 * en TODA la isla, porque arrastra la pendiente del ajuste.
 */

import { haversineKm, type LonLat } from './geo'
import type { Station } from './quality'
import { clampHumidity, dewpointFrom, vapourPressureDeficit } from './psychro'
import { MODEL_SOURCE_LABEL, type Anchor } from './openmeteo'
import { humidityAt, sampleProfile, type VerticalProfile } from './profile'
import {
  bandShape,
  calibrateModelBand,
  calibrateScale,
  nearestStationKm,
  type Calibration,
  type LooSample,
} from './uncertainty'

/**
 * Variables que el motor ajusta e interpola de verdad. Son las dos que la red
 * mide con cobertura suficiente: 36 estaciones dan temperatura y 30 humedad.
 */
export type InterpolableVariable = 'temperature' | 'relativehumidity'

/**
 * Lo que la interfaz puede pintar. El punto de rocío está aquí pero NO arriba:
 * solo 10 de las 52 estaciones lo publican, y un campo con diez muestras sobre
 * una isla de 2426 m se va a valores imposibles en cuanto uno se aleja de esas
 * diez. Se calcula a partir de las otras dos (ver `psychro.ts`), lo que además
 * garantiza que las tres nunca se contradigan entre sí.
 */
export type DisplayVariable = 'temperature' | 'relativehumidity' | 'dewpoint' | 'vpd'

/**
 * Variables que NO se interpolan nunca, y por qué:
 *  - viento: los barrancos lo encauzan; a 500 m de distancia cambia de sector.
 *  - precipitación: la vertiente NE recibe múltiplos de la SW a igual altitud.
 *  - calidad del aire y CO₂: son medidas puntuales de un contaminante, no un
 *    campo continuo. Interpolarlas inventa lecturas donde no hay sensor.
 */
export const NON_INTERPOLABLE = [
  'windspeed',
  'winddirection',
  'precipitation',
  'airquality',
  'co2',
  // La presión, por un motivo distinto y menos evidente: ver `medianPressure`.
  'atmosphericpressure',
] as const

/**
 * Presión al nivel del mar de la isla: la MEDIANA de la red, no un campo
 * interpolado.
 *
 * La presión reducida al nivel del mar es un campo tan liso que sobre 42 km de
 * isla apenas varía una décima de hPa. Y sin embargo la red, ya normalizada a
 * la misma convención, va de 989 a 1028 hPa. Ese rango de casi 40 hPa no es
 * meteorología: es deriva de barómetros baratos.
 *
 * Interpolarlo produciría un mapa precioso de errores de calibración. La
 * mediana, en cambio, es robusta a esos sensores descalibrados y es lo que de
 * verdad se puede afirmar: cuánto marca el barómetro en la isla.
 */
export function medianPressure(stations: readonly Station[]): number | null {
  const vals = stations
    .map((s) => s.atmosphericpressure)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)
  if (!vals.length) return null
  const m = vals.length >> 1
  return vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2
}

export const IDW_POWER = 2
export const IDW_CUTOFF_KM = 15
/** Por debajo de esto el punto es la estación: 1/d² explotaría. */
export const MIN_DISTANCE_KM = 0.01 // 10 m
export const OUTLIER_SIGMA = 2.5
export const MAX_REJECTION_PASSES = 5

/**
 * Cuántos metros de desnivel pesan lo mismo que 1 km de distancia horizontal
 * en el IDW.
 *
 * Después de quitar la tendencia altitudinal los residuos NO son ruido blanco:
 * conservan la estructura de la capa de inversión (~800–1500 m), que separa el
 * mar de nubes de la cumbre despejada. Dos estaciones a la misma cota se
 * parecen entre sí más que dos vecinas separadas por la inversión, así que la
 * distancia efectiva es hipot(d_horizontal, Δaltitud / α).
 *
 * α = 100 sale de la documentación del portal («100 m de error de altitud
 * pesan como 1 km de distancia»), no de optimizar contra este fixture. Bajarlo
 * mejora las métricas de este snapshot concreto hasta α≈30, y eso es
 * exactamente la señal de que ahí ya se estaría ajustando al set de validación.
 */
export const ELEVATION_SCALE_M_PER_KM = 100

/**
 * De dónde sale una muestra:
 *
 *  - `cabildo` — medida real de la red insular. Es la única que ajusta.
 *  - `openmeteo` — ancla de modelo por encima del techo de esa red (ver
 *    `openmeteo.ts`).
 *  - `roque` — medida real de la estación del TNG en la cumbre, 2387 m (ver
 *    `summit.ts`). Está por encima del techo, como un ancla, pero NO es un
 *    número de modelo: es un termómetro.
 *
 * La distinción viaja hasta la interfaz: no se enseña un número de modelo sin
 * decir que lo es, y no se degrada a «modelo» una medida que no lo es.
 */
export type SampleSource = 'cabildo' | 'openmeteo' | 'roque'

/** Las que son medidas reales, vengan de la red que vengan. */
export const MEASURED_SOURCES: readonly SampleSource[] = ['cabildo', 'roque']

/** true si esta muestra vive por encima del techo de la red y le toca la rampa. */
const isAboveCeiling = (source: SampleSource) => source === 'openmeteo' || source === 'roque'

export interface Sample {
  entityId: string
  name: string
  lon: number
  lat: number
  elevation: number
  value: number
  /** Instante de la MEDIDA (epoch ms, UTC), no de la descarga. */
  observedAt: number
  source: SampleSource
}

export interface RejectedSample extends Sample {
  residual: number
  sigmas: number
}

export interface Model {
  variable: InterpolableVariable
  /** Gradiente medido, en unidades por METRO. Para T sale negativo. */
  b: number
  /** Ordenada en el origen del ajuste (valor a nivel del mar). */
  a: number
  r2: number
  /** σ de los residuos tras el rechazo. Base de la banda de incertidumbre. */
  sigma: number
  used: (Sample & { detrended: number })[]
  rejected: RejectedSample[]
  candidates: number
  passes: number
  /** Rango de altitudes MEDIDO por el Cabildo. Las anclas no lo ensanchan. */
  elevationRange: [number, number]
  /** Anclas de modelo añadidas al campo de residuos, si las hay. */
  anchors: number
  /**
   * true si la medida real de la cumbre (TNG, 2387 m) sostiene el campo por
   * encima del techo. La interfaz lo dice: no es lo mismo que ahí arriba haya
   * un termómetro que un modelo, y quien mira el mapa tiene derecho a saberlo.
   */
  summit: boolean
  /**
   * Calibración empírica de la banda de incertidumbre. `null` mientras no haya
   * bastantes estaciones para medirla; entonces se cae en la σ del ajuste, que
   * es lo que había antes.
   */
  calibration: Calibration | null
}

export interface Contributor {
  name: string
  entityId: string
  /** `openmeteo` obliga a la interfaz a decir que ese aporte es de modelo. */
  source: SampleSource
  distanceKm: number
  /** altitud_estación − altitud_destino. Positivo = la estación está más alta. */
  elevationDelta: number
  weightShare: number
  rawValue: number
  /** Instante de esa medida concreta (epoch ms, UTC). */
  observedAt: number
}

export interface Estimate {
  value: number
  /** ±, en unidades de la variable. Heurística documentada en `uncertaintyAt`. */
  uncertainty: number
  contributors: Contributor[]
  /** El punto no tenía ninguna estación dentro del radio de corte. */
  extrapolated: boolean
  /** El punto cae fuera del rango de altitudes muestreado por la red. */
  elevationExtrapolated: boolean

  /**
   * Cuándo se MIDIÓ lo que sostiene esta cifra, ponderado por el mismo peso
   * que el propio valor. No es cuándo se descargó: una estimación puede venir
   * de una descarga de hace 10 segundos y de lecturas de hace hora y media, y
   * lo segundo es lo que importa para saber si el número sigue valiendo.
   */
  observedAt: number
  /** La más vieja de las lecturas que contribuyen. El peor caso, a la vista. */
  oldestObservedAt: number
}

// ---------------------------------------------------------------------------
// 2. Ajuste OLS
// ---------------------------------------------------------------------------

export interface OlsFit {
  a: number
  b: number
  r2: number
  /** Desviación típica de los residuos (n−2 grados de libertad). */
  sigma: number
  n: number
}

/** Regresión de `value` sobre `elevation`. Nada de asumir 6,5 °C/km. */
export function ols(samples: readonly Sample[]): OlsFit {
  const n = samples.length
  if (n < 2) {
    return { a: n === 1 ? samples[0].value : 0, b: 0, r2: 0, sigma: 0, n }
  }
  let sx = 0,
    sy = 0
  for (const s of samples) {
    sx += s.elevation
    sy += s.value
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0,
    sxy = 0,
    syy = 0
  for (const s of samples) {
    const dx = s.elevation - mx
    const dy = s.value - my
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  // Toda la red a la misma altitud: no hay gradiente que medir, solo la media.
  const b = sxx > 1e-9 ? sxy / sxx : 0
  const a = my - b * mx
  let ssr = 0
  for (const s of samples) {
    const e = s.value - (a + b * s.elevation)
    ssr += e * e
  }
  const r2 = syy > 1e-9 ? Math.max(0, 1 - ssr / syy) : 0
  const sigma = n > 2 ? Math.sqrt(ssr / (n - 2)) : 0
  return { a, b, r2, sigma, n }
}

// ---------------------------------------------------------------------------
// 3. Rechazo iterativo de outliers
// ---------------------------------------------------------------------------

function median(xs: readonly number[]): number {
  const s = xs.slice().sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Escala robusta de los residuos: 1,4826 · MAD, que para datos normales estima
 * lo mismo que la desviación típica pero no se deja arrastrar por los outliers.
 *
 * Esto es lo que hace que el rechazo funcione de verdad. Con la σ muestral, un
 * puñado de sensores rotos INFLA la propia σ que debería delatarlos, y acaban
 * tapándose unos a otros: sobre este snapshot la σ muestral cazaba 2 de 7
 * anomalías, y la MAD caza las 4 grandes en una sola pasada. Es el efecto de
 * enmascaramiento de manual, y aquí es la diferencia entre pasar los criterios
 * y no pasarlos.
 */
export function robustSigma(residuals: readonly number[]): number {
  if (residuals.length < 2) return 0
  const med = median(residuals)
  return 1.4826 * median(residuals.map((r) => Math.abs(r - med)))
}

/**
 * Ajusta, mide residuos, tira lo que pase de `sigmas` escalas robustas, y
 * vuelve a ajustar. Para cuando no cae nadie más o a las `maxPasses` vueltas.
 *
 * Nunca deja menos de 4 estaciones: por debajo de eso la escala deja de
 * significar nada y el rechazo se convierte en «tirar lo que no me gusta».
 */
/**
 * Testigo independiente que puede INDULTAR a una muestra marcada como anómala.
 *
 * Devuelve true cuando otra fuente, que no es esta recta, dice que ese valor a
 * esa altitud es creíble. Ver `corroboratedBy` en este mismo archivo.
 */
export type Corroborator = (sample: Sample, residual: number) => boolean

/** Vale con que UNO de los testigos respalde la muestra. */
export function anyOf(
  ...corroborators: (Corroborator | undefined)[]
): Corroborator | undefined {
  const live = corroborators.filter((c): c is Corroborator => !!c)
  if (!live.length) return undefined
  return (sample, residual) => live.some((c) => c(sample, residual))
}

/**
 * R² mínimo para que el rechazo altitudinal signifique algo.
 *
 * NO ES PRUDENCIA, ES ARITMÉTICA. El rechazo mide cuánto se separa una
 * estación de la recta `valor = a + b · altitud`. Cuando esa recta explica la
 * varianza, separarse de ella es sospechoso. Cuando NO la explica, el residuo
 * de cada estación es prácticamente `valor − media de la isla`, y entonces
 * «te desvías 3σ del ajuste altitudinal» solo quiere decir «eres la más
 * cálida». En un día de föhn o de calima la más cálida es justo la que está
 * midiendo bien el episodio: el filtro se lleva por delante la noticia.
 *
 * MEDIDO, no elegido a ojo:
 *
 * - Sobre el snapshot de `__fixtures__` —una mañana de agosto ordinaria— el
 *   ajuste de temperatura da **R² ≈ 0,65**, y ahí el rechazo mejora el RMSE un
 *   30 % largo. Por encima de este umbral con holgura: sigue funcionando igual.
 * - Sobre la red EN VIVO del 13 ago 2026, con aire sahariano encima, el mismo
 *   ajuste da **R² = 0,000 y un gradiente de +0,21 °C/km** —la temperatura
 *   subiendo con la altura— sobre 35 estaciones de 12 a 1561 m. Y no es una
 *   familia de sensores: partido por familias sale 0,000 en las CABLPA, 0,013
 *   en las MTD y 0,001 en el resto.
 *
 * QUÉ NO SE PIERDE al suspenderlo. El sensor roto lo caza igual `BOUNDS` si
 * publica un imposible, y `sensor-health.ts` si su SERIE es imposible —que es
 * el único juez que no depende de que la recta del día se sostenga—. Lo que se
 * suspende es solo el argumento «no encajas en la recta», el día que no hay
 * recta en la que encajar.
 *
 * CUÁNTO CAMBIA. Rehaciendo la decisión hora a hora sobre las 48 h anteriores
 * al 13 ago 2026 (`scripts/checks/qc-replay.ts`), ya con las averiadas fuera:
 * el ajuste de temperatura NO llegaba al umbral en **29 de 49 horas**, y en
 * ese archivo la regla vieja excluía **109 veces** en 31 horas distintas. Con
 * el umbral y el testigo de sitio puestos, **ninguna**. La más acusada era
 * LasTricias, 28 horas — la misma estación que `sensor-health.ts` pone de
 * ejemplo de sitio sano y abrigado. En humedad, de 148 exclusiones a 19.
 */
export const MIN_R2_FOR_REJECTION = 0.2

export function fitWithRejection(
  samples: readonly Sample[],
  sigmas = OUTLIER_SIGMA,
  maxPasses = MAX_REJECTION_PASSES,
  corroborate?: Corroborator,
): { fit: OlsFit; kept: Sample[]; rejected: RejectedSample[]; passes: number } {
  let kept = samples.slice()
  const rejected: RejectedSample[] = []
  let fit = ols(kept)
  let passes = 0

  // Sin recta que explique nada, el residuo no es evidencia sobre el sensor.
  if (!Number.isFinite(fit.r2) || fit.r2 < MIN_R2_FOR_REJECTION) {
    return { fit, kept, rejected, passes }
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    if (kept.length <= 4) break
    const residuals = kept.map((s) => s.value - (fit.a + fit.b * s.elevation))
    const scale = robustSigma(residuals)
    if (scale <= 1e-9) break

    const next: Sample[] = []
    const dropped: RejectedSample[] = []
    kept.forEach((s, i) => {
      const z = Math.abs(residuals[i]) / scale
      // Un residuo grande dice que la muestra no encaja en la RECTA, no que la
      // muestra esté mal. Sobre la inversión del alisio la recta es lo que está
      // mal, y ahí un testigo independiente puede indultarla.
      if (z > sigmas && !corroborate?.(s, residuals[i])) {
        dropped.push({ ...s, residual: residuals[i], sigmas: z })
      } else {
        next.push(s)
      }
    })
    if (!dropped.length) break
    // Si una pasada se llevara casi todo, el modelo lineal no describe estos
    // datos: mejor quedarse con el ajuste previo que amputar la red.
    if (next.length < 4) break

    kept = next
    rejected.push(...dropped)
    fit = ols(kept)
    passes = pass + 1
  }

  return { fit, kept, rejected, passes }
}

/**
 * Tolerancia del indulto, por variable. **Asimétrica, y el motivo es físico.**
 *
 * El perfil describe el aire LIBRE. La capa que toca el suelo de una ladera no
 * se le parece de cualquier manera: el transporte anabático y el sol sobre la
 * roca la dejan más CÁLIDA y más HÚMEDA que el aire libre a la misma cota,
 * nunca lo contrario. Así que una estación que se separa del perfil hacia
 * arriba está donde se espera que esté, y una que se separa hacia abajo —más
 * fría o más seca que la atmósfera libre— no tiene ninguna explicación física y
 * sí una explicación de sensor.
 *
 * Una tolerancia simétrica lo pasaba por alto, y hay un test que lo fija: con
 * ±35 puntos, un higrómetro muerto que marca **1 % de humedad** quedaba
 * indultado si estaba por encima de la inversión, porque el perfil daba 25 % y
 * la diferencia cabía. El indulto no es una amnistía.
 *
 * Los números salen de medidas, no del ojo:
 *
 * - `warmer` / `moister` — cuánto puede estar por encima. El perfil se equivoca
 *   contra una estación real a esa altura (TNG, Roque de los Muchachos, 2387 m,
 *   25 h seguidas el 12 ago 2026) con un sesgo de **−1,15 K y −17,5 puntos**:
 *   es decir, ya sabemos que lee más frío y más seco que la superficie. Se deja
 *   sitio a ese sesgo y un margen. En temperatura se comprobó además el caso
 *   concreto: la estación de 1560 m marcaba 26,0 °C contra los 20,4 del sondeo,
 *   **+5,6 K**, ladera oeste y sol de tarde.
 * - `colder` / `drier` — cuánto puede estar por debajo. Poco, porque eso ya no
 *   lo explica la física del sitio.
 */
export interface CorroborationTolerance {
  /** Cuánto puede superar al perfil (más cálido / más húmedo). */
  above: number
  /** Cuánto puede quedarse por debajo (más frío / más seco). */
  below: number
}

export const CORROBORATION_TOLERANCE: Record<
  InterpolableVariable,
  CorroborationTolerance
> = {
  temperature: { above: 6, below: 2.7 },
  relativehumidity: { above: 35, below: 10 },
}

/**
 * Construye el testigo que puede indultar a una muestra marcada como anómala.
 *
 * EL PROBLEMA QUE RESUELVE. El rechazo mide el residuo contra una RECTA
 * altitudinal, y sobre la inversión del alisio esa recta no describe la
 * atmósfera: entre ~800 y ~1500 m la temperatura deja de bajar y a menudo sube.
 * Ahí, la estación que está en lo cierto es la que más se separa de la recta, y
 * la MAD la caza precisamente por eso. Medido el 12 ago 2026: dejando fuera del
 * ajuste la estación de 1560 m, el motor predecía en su propio punto **75,1 %
 * de humedad cuando ella marcaba 36,4** — y el sondeo de Güímar de ese día daba
 * 19 % a 1558 m, o sea que la estación tenía razón y el modelo no. El filtro se
 * llevaba las CUATRO estaciones de humedad por encima de 1000 m, que son las
 * únicas que describen la capa seca. El motor se quitaba la vista él solo.
 *
 * LA REGLA, estrecha a propósito:
 *
 *  1. Solo indulta **por encima de la base de la inversión** diagnosticada en
 *     el perfil. Debajo, la recta sí describe bien la atmósfera y el rechazo
 *     tiene que seguir funcionando como hasta ahora: es el que mejora el RMSE
 *     un 43,7 %, y ese número no se toca.
 *  2. Solo indulta si el perfil **corrobora** el valor a esa altitud, dentro de
 *     la tolerancia de arriba. Una estación con el higrómetro muerto que marca
 *     el 1 % a 840 m sigue cayendo, porque el perfil no la respalda.
 *  3. Si no hay perfil, o no hay inversión diagnosticada, no indulta a nadie y
 *     todo se comporta exactamente como antes.
 *
 * El perfil NO entra en el ajuste ni aporta ninguna muestra: solo vota sobre si
 * se tira una medida del Cabildo. Las estaciones siguen mandando.
 */
export function corroboratedBy(
  profile: VerticalProfile | null,
  variable: InterpolableVariable,
): Corroborator | undefined {
  if (!profile?.inversion) return undefined
  const base = profile.inversion.base
  const tolerance = CORROBORATION_TOLERANCE[variable]

  return (sample: Sample) => {
    if (sample.elevation < base) return false
    const modelled =
      variable === 'temperature'
        ? sampleProfile(profile, sample.elevation, 'temperature')
        : humidityAt(profile, sample.elevation)
    if (modelled === null) return false
    const deviation = sample.value - modelled
    return deviation >= -tolerance.below && deviation <= tolerance.above
  }
}

// ---------------------------------------------------------------------------
// Testigo 2: lo que esa estación hace SIEMPRE
// ---------------------------------------------------------------------------

/**
 * El desvío habitual de una estación respecto al ajuste de la isla.
 *
 * Lo calcula `sensor-health.ts` sobre 48 h de archivo; el tipo vive aquí para
 * que las dependencias vayan en una sola dirección —salud del sensor depende
 * del motor, nunca al revés—.
 */
export interface SiteOffset {
  /** Desvío mediano respecto a la recta insular, en unidades de la variable. */
  median: number
  /** Dispersión robusta de ese desvío. Pequeña = sitio previsible. */
  spread: number
  /** Horas con desvío medido. Pocas horas, ningún veredicto. */
  hours: number
}

/** Horas de archivo mínimas para que el desvío de un sitio sea una costumbre. */
export const SITE_OFFSET_MIN_HOURS = 12
/** Cuántas dispersiones propias puede separarse de su costumbre. */
export const SITE_OFFSET_SIGMAS = 3
/**
 * Margen mínimo, en unidades de la variable.
 *
 * Un sitio muy regular tiene una dispersión diminuta, y sin suelo bastaría
 * una décima de más para retirarle el indulto. No es lo que se quiere medir:
 * lo que se quiere medir es «hoy no se parece a sí misma».
 */
export const SITE_OFFSET_FLOOR = 1.5

/**
 * Indulta a la estación que se está comportando COMO SIEMPRE.
 *
 * EL PROBLEMA QUE RESUELVE. `sensor-health.ts` ya sabe que hay sitios que
 * viven lejos de la recta insular y que eso no es una avería: lo dice con
 * todas las letras —«LasTricias marca +5,7 °C hora tras hora porque es un
 * sitio abrigado y caliente»— y por eso juzga la DISPERSIÓN del desvío y no su
 * tamaño. Pero ese conocimiento no salía de allí: el motor volvía a mirar el
 * mismo +5,7 °C, lo llamaba outlier a 3σ y echaba a LasTricias del ajuste. Dos
 * partes de la misma aplicación mirando el mismo número y diciendo cosas
 * contrarias sobre él; la que hablaba en pantalla era la que menos sabía.
 *
 * LA REGLA. Se indulta si el desvío de hoy cabe dentro de la costumbre de esa
 * estación, con la costumbre medida sobre su propia serie. No se indulta si no
 * hay bastantes horas de archivo, ni —y esto es lo que impide que sea una
 * amnistía— si la estación se está separando de SU PROPIO desvío habitual:
 * ahí ya no está midiendo su sitio, y ese es exactamente el caso que hay que
 * seguir tirando.
 *
 * Solo temperatura: es la única variable de la que `sensor-health` guarda
 * serie. Para la humedad no hay costumbre medida, así que no hay indulto.
 */
export function bySiteOffset(
  offsets: ReadonlyMap<string, SiteOffset> | null,
  variable: InterpolableVariable,
): Corroborator | undefined {
  if (!offsets?.size || variable !== 'temperature') return undefined

  return (sample, residual) => {
    const offset = offsets.get(sample.entityId)
    if (!offset || offset.hours < SITE_OFFSET_MIN_HOURS) return false
    const margin = Math.max(SITE_OFFSET_SIGMAS * offset.spread, SITE_OFFSET_FLOOR)
    return Math.abs(residual - offset.median) <= margin
  }
}

// ---------------------------------------------------------------------------
// Construcción del modelo
// ---------------------------------------------------------------------------

export function toSamples(
  stations: readonly Station[],
  variable: InterpolableVariable,
): Sample[] {
  const out: Sample[] = []
  for (const s of stations) {
    const v = s[variable]
    if (v === null || !Number.isFinite(v)) continue
    out.push({
      entityId: s.entityId,
      name: s.name,
      lon: s.lon,
      lat: s.lat,
      elevation: s.elevation,
      value: v,
      observedAt: s.timeinstant,
      source: 'cabildo',
    })
  }
  return out
}

/**
 * Anclas de modelo que quedan POR ENCIMA del techo de la red, convertidas en
 * muestras. Las que caen dentro del rango medido se descartan sin más: ahí hay
 * estaciones de verdad y las estaciones de verdad mandan siempre.
 */
function anchorSamples(
  anchors: readonly Anchor[],
  variable: InterpolableVariable,
  ceiling: number,
): Sample[] {
  const out: Sample[] = []
  anchors.forEach((a, i) => {
    const v = variable === 'temperature' ? a.temperature : a.relativehumidity
    if (v === null || !Number.isFinite(v)) return
    if (a.elevation <= ceiling) return
    out.push({
      entityId: `openmeteo:${i}`,
      name: MODEL_SOURCE_LABEL,
      lon: a.lon,
      lat: a.lat,
      elevation: a.elevation,
      value: v,
      observedAt: a.observedAt,
      source: 'openmeteo',
    })
  })
  return out
}

/**
 * @param anchors Anclas de modelo. NO participan en el ajuste ni en el rechazo
 *   —el gradiente, el R² y la σ siguen siendo los de la red del Cabildo— y solo
 *   se suman al campo de residuos por encima del techo medido.
 * @param calibration Banda de incertidumbre medida (ver `uncertainty.ts`). Es
 *   cara de calcular —un leave-one-out entero— así que se pasa hecha desde
 *   fuera y se memoriza allí, en vez de rehacerla en cada `buildModel`.
 * @param profile Perfil vertical, si lo hay. NO aporta ninguna muestra al
 *   ajuste: solo puede indultar a una estación del Cabildo marcada como anómala
 *   por encima de la inversión. Ver `corroboratedBy`.
 * @param summit Estación del TNG en el Roque, 2387 m, si está fresca. Es una
 *   MEDIDA, no un ancla, pero entra por el mismo sitio que las anclas y por la
 *   misma razón: vive por encima del techo de la red. No ajusta, no rechaza y
 *   no valida —eso sigue siendo cosa del Cabildo—; solo pone un termómetro real
 *   donde antes solo había modelo. Ver `summit.ts`. `null` y todo se comporta
 *   exactamente como antes.
 */
export function buildModel(
  stations: readonly Station[],
  variable: InterpolableVariable,
  anchors: readonly Anchor[] = [],
  calibration: Calibration | null = null,
  profile: VerticalProfile | null = null,
  offsets: ReadonlyMap<string, SiteOffset> | null = null,
  summit: Station | null = null,
): Model {
  const samples = toSamples(stations, variable)
  const { fit, kept, rejected, passes } = fitWithRejection(
    samples,
    OUTLIER_SIGMA,
    MAX_REJECTION_PASSES,
    // Dos testigos independientes, y basta con que hable uno: el perfil
    // vertical sabe de la inversión y la serie de la estación sabe de su sitio.
    anyOf(corroboratedBy(profile, variable), bySiteOffset(offsets, variable)),
  )

  // 4. DETENDENCIA. Se deja la ordenada dentro del residuo: la retendencia
  // vuelve a sumarla, así que el resultado es idéntico y hay un término menos
  // que puedan desincronizarse entre sí.
  const detrend = (s: Sample) => ({ ...s, detrended: s.value - fit.b * s.elevation })

  const elevations = kept.map((s) => s.elevation)
  const elevationRange: [number, number] = elevations.length
    ? [Math.min(...elevations), Math.max(...elevations)]
    : [0, 0]

  // El ancla se detendencia con la MISMA recta del Cabildo, así que su residuo
  // mide exactamente cuánto se equivoca esa recta allá arriba. Eso es lo que el
  // IDW propaga —y lo que se apaga solo al bajar hacia las estaciones reales.
  const anchored = kept.length ? anchorSamples(anchors, variable, elevationRange[1]) : []

  // La cumbre pasa por el mismo filtro de altura que las anclas, y por el mismo
  // motivo: si algún día el Cabildo pusiera una estación por encima de 2387 m,
  // la suya mandaría y ésta sobraría. Hoy no la hay —el techo estaba en 1561 m
  // el 13 ago 2026— así que en la práctica entra siempre que el TNG conteste.
  const summitSample =
    kept.length && summit && summit.elevation > elevationRange[1]
      ? toSamples([summit], variable).map((s) => ({ ...s, source: 'roque' as const }))
      : []

  return {
    variable,
    a: fit.a,
    b: fit.b,
    r2: fit.r2,
    sigma: fit.sigma,
    used: [...kept.map(detrend), ...anchored.map(detrend), ...summitSample.map(detrend)],
    rejected,
    candidates: samples.length,
    passes,
    elevationRange,
    anchors: anchored.length,
    /** true si la muestra real de la cumbre ha entrado en el campo. */
    summit: summitSample.length > 0,
    calibration,
  }
}

// ---------------------------------------------------------------------------
// 5 + 6. IDW sobre residuos y retendencia
// ---------------------------------------------------------------------------

interface Weighted {
  s: Sample & { detrended: number }
  /** Distancia horizontal real, en km. Es la que se le enseña al usuario. */
  d: number
  w: number
}

/**
 * Cuánto pesa una muestra de POR ENCIMA DEL TECHO según lo alto que esté el
 * punto de destino. Vale para las anclas de modelo y para la medida de la
 * cumbre, que comparten el problema aunque no compartan la procedencia.
 *
 * Vale 0 en el techo de la red y 1 a `ANCHOR_TAPER_M` por encima. Sin esta
 * rampa el ancla de la cumbre todavía se dejaba notar donde SÍ hay estaciones:
 * medido el 12 ago 2026, a 900 m movía la humedad del 85 % al 77 %, porque a
 * 1179 m de desnivel aún se llevaba un 15 % del peso. La regla es que las
 * estaciones del Cabildo mandan donde miden, así que allí el modelo tiene que
 * pesar cero, no poco.
 *
 * Que sea una rampa y no un corte seco es para que el campo no dé un salto
 * justo en la cota del techo, que además se mueve cada vez que una estación
 * alta entra o sale del ajuste.
 *
 * LA CUMBRE TAMBIÉN SE APAGA AQUÍ, aunque sea una medida real y no un modelo, y
 * la razón no es la procedencia sino la altura: a 2387 m está 826 m por encima
 * del techo, y el residuo de la cumbre no describe lo que pasa a 900 m —los
 * separa la inversión del alisio, que es justo la capa que rompe la vertical—.
 * Un termómetro no deja de estar lejos por ser un termómetro.
 */
export const ANCHOR_TAPER_M = 300

function anchorWeightFactor(model: Model, elevation: number): number {
  const ceiling = model.elevationRange[1]
  if (elevation <= ceiling) return 0
  return Math.min(1, (elevation - ceiling) / ANCHOR_TAPER_M)
}

function gather(
  model: Model,
  target: LonLat,
  elevation: number,
): { list: Weighted[]; extrapolated: boolean } {
  const within: Weighted[] = []
  const all: Weighted[] = []
  const anchorFactor = anchorWeightFactor(model, elevation)
  for (const s of model.used) {
    const d = haversineKm(target, [s.lon, s.lat])
    // Distancia efectiva: horizontal y desnivel en el mismo espacio métrico.
    const dz = (s.elevation - elevation) / ELEVATION_SCALE_M_PER_KM
    const effective = Math.max(Math.hypot(d, dz), MIN_DISTANCE_KM)
    let w = 1 / effective ** IDW_POWER
    if (isAboveCeiling(s.source)) {
      w *= anchorFactor
      if (w <= 0) continue // por debajo del techo, lo de arriba no existe
    }
    const item = { s, d, w }
    all.push(item)
    // El corte sigue siendo por distancia horizontal: es un radio geográfico,
    // no una tolerancia de altitud.
    if (d <= IDW_CUTOFF_KM) within.push(item)
  }
  if (within.length) return { list: within, extrapolated: false }
  // Fuera del radio de corte no se devuelve «sin datos»: se usan las tres más
  // cercanas y se marca como extrapolado, para que la UI lo pueda decir.
  all.sort((x, y) => x.d - y.d)
  return { list: all.slice(0, 3), extrapolated: all.length > 0 }
}

/**
 * Banda de incertidumbre, calibrada (ver `uncertainty.ts`).
 *
 * Dos regímenes, y el punto puede estar en medio de los dos:
 *   - donde manda la red, la banda es el error medido del interpolador por
 *     leave-one-out, escalado por el término de forma;
 *   - donde manda un ancla, es el error medido de Open-Meteo contra la red.
 *
 * Se mezclan por el peso que las anclas tienen de verdad en ESTE punto, así que
 * el relevo entre una y otra lo hace el mismo reparto que decide el valor.
 *
 * Sigue sin ser un intervalo de confianza estadístico, y la UI no lo llama así:
 * es un cuantil empírico sobre la red de hoy, que es bastante más de lo que
 * era, pero no es una gaussiana.
 */
function uncertaintyAt(
  model: Model,
  nearestKm: number,
  elevation: number,
  anchorShare: number,
): number {
  const shape = bandShape(nearestKm, elevation, model.elevationRange)
  // Sin calibración se vuelve a la heurística anterior: peor, pero no inventada.
  const scale = model.calibration?.scale ?? Math.max(model.sigma, 0.15)
  const interpolated = scale * shape

  const modelBand = model.calibration?.modelBand
  if (modelBand === null || modelBand === undefined || anchorShare <= 0) {
    return interpolated
  }
  return (1 - anchorShare) * interpolated + anchorShare * modelBand
}

export function estimate(
  model: Model,
  lon: number,
  lat: number,
  elevation: number,
): Estimate | null {
  if (!model.used.length) return null
  const { list, extrapolated } = gather(model, [lon, lat], elevation)
  if (!list.length) return null

  let sw = 0
  let sv = 0
  for (const it of list) {
    sw += it.w
    sv += it.w * it.s.detrended
  }
  const detrended = sv / sw
  const value = detrended + model.b * elevation

  const top = list
    .slice()
    .sort((a, b) => b.w - a.w)
    .slice(0, 3)
    .map<Contributor>((it) => ({
      name: it.s.name,
      entityId: it.s.entityId,
      source: it.s.source,
      distanceKm: it.d,
      elevationDelta: it.s.elevation - elevation,
      weightShare: it.w / sw,
      rawValue: it.s.value,
      observedAt: it.s.observedAt,
    }))

  // Antigüedad del dato, ponderada por el MISMO peso que el valor: si el 80 %
  // de la cifra viene de una estación, la frescura que se anuncia tiene que ser
  // la de esa estación, no el promedio simple de todas las que participan.
  let observedAt = 0
  let oldestObservedAt = Infinity
  for (const it of list) {
    observedAt += (it.w / sw) * it.s.observedAt
    if (it.s.observedAt < oldestObservedAt) oldestObservedAt = it.s.observedAt
  }

  // Distancia a la MEDIDA más cercana, no al ancla más cercana.
  //
  // El ancla de la cumbre está a 0 km del punto de la cumbre, así que meterla
  // en esta cuenta encogía la banda justo donde el valor deja de ser una
  // medida: a 2400 m pasaba de ±4,52 a ±3,88 °C por el mero hecho de haber
  // añadido un punto de modelo. La incertidumbre tiene que seguir contando lo
  // lejos que está la estación real; si no hay ninguna dentro del radio, se
  // toma el radio entero, que es el peor caso que esta heurística sabe medir.
  //
  // La estación del TNG SÍ cuenta, y es el mismo criterio, no una excepción: lo
  // que esta cuenta mide es a qué distancia está el termómetro más cercano, y
  // en la cumbre ahora hay uno de verdad. Encoger la banda ahí no es optimismo,
  // es dejar de fingir que no se está midiendo lo que se está midiendo.
  const measuredDistances = list
    .filter((it) => MEASURED_SOURCES.includes(it.s.source))
    .map((it) => it.d)
  const nearestKm = measuredDistances.length
    ? Math.min(...measuredDistances)
    : IDW_CUTOFF_KM

  // Cuánto de esta cifra la sostiene el MODELO en lugar de una medida. Es el
  // mismo reparto de pesos que ha decidido el valor, así que la banda cambia de
  // régimen exactamente al ritmo al que lo hace el número.
  //
  // La cumbre no suma aquí aunque esté por encima del techo: `modelBand` es el
  // error medido de Open-Meteo contra la red, y aplicárselo a un termómetro
  // sería cobrarle a una medida el error de un modelo.
  let anchorShare = 0
  for (const it of list) if (it.s.source === 'openmeteo') anchorShare += it.w / sw
  const [lo, hi] = model.elevationRange
  return {
    value,
    uncertainty: uncertaintyAt(model, nearestKm, elevation, anchorShare),
    contributors: top,
    extrapolated,
    elevationExtrapolated: elevation > hi || elevation < lo,
    observedAt,
    oldestObservedAt,
  }
}

// ---------------------------------------------------------------------------
// Variables que no se interpolan: estación más cercana, declarada como tal
// ---------------------------------------------------------------------------

export interface NearestReading {
  station: Station
  distanceKm: number
  elevationDelta: number
}

/**
 * Para viento y precipitación. Devuelve la estación, no un valor «del punto»:
 * la UI tiene que decir de qué estación viene y a qué distancia está.
 */
export function nearestWith(
  stations: readonly Station[],
  lon: number,
  lat: number,
  elevation: number,
  field: keyof Station,
): NearestReading | null {
  let best: NearestReading | null = null
  for (const s of stations) {
    const v = s[field]
    if (v === null || v === undefined) continue
    const d = haversineKm([lon, lat], [s.lon, s.lat])
    if (!best || d < best.distanceKm) {
      best = { station: s, distanceKm: d, elevationDelta: s.elevation - elevation }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Validación: leave-one-out
// ---------------------------------------------------------------------------

export interface LooResult {
  /** Estaciones puntuadas. */
  n: number
  /** Estaciones que el pipeline descartó y por tanto no pretende predecir. */
  excluded: number
  mae: number
  rmse: number
  bias: number
  maxError: number
  worst: { name: string; elevation: number; observed: number; predicted: number }[]
}

/**
 * Validación leave-one-out del pipeline COMPLETO.
 *
 * Dos decisiones de protocolo, ambas deliberadas:
 *
 * 1. En cada vuelta se reconstruye el modelo entero con las demás estaciones —
 *    ajuste y rechazo incluidos. Reutilizar el ajuste hecho con todas dejaría
 *    que la estación excluida siguiera influyendo en el gradiente, y el error
 *    saldría optimista.
 *
 * 2. Se puntúa contra el conjunto que el pipeline CONSERVA, no contra las 52
 *    filas crudas. Un sensor descalibrado no es un objetivo de validación
 *    válido: pedirle al interpolador que acierte los 25,9 °C que un sensor
 *    marca a 1194 m mide lo roto que está el sensor, no lo bueno que es el
 *    interpolador. El pipeline que rechaza outliers tampoco afirma poder
 *    predecirlos: los marca como no fiables, que es justamente su trabajo.
 *
 *    Por eso la comparación con `rejectOutliers: false` es honesta y no está
 *    amañada: enfrenta dos pipelines enteros. El que no rechaza se compromete
 *    con las 36 estaciones —incluidas las rotas— y además arrastra su gradiente
 *    contaminado; el que rechaza se compromete solo con las que considera
 *    fiables. La diferencia de RMSE es el valor real del paso de rechazo.
 *
 * `excluded` deja ese número a la vista para que nadie confunda ambos
 * denominadores.
 */
export function leaveOneOut(
  stations: readonly Station[],
  variable: InterpolableVariable,
  opts: { rejectOutliers?: boolean } = {},
): LooResult {
  const { rejectOutliers = true } = opts
  const all = toSamples(stations, variable)
  const targets = rejectOutliers ? fitWithRejection(all).kept : all
  const errors: { err: number; name: string; elevation: number; observed: number; predicted: number }[] =
    []

  for (const target of targets) {
    const rest = all.filter((s) => s.entityId !== target.entityId)
    if (rest.length < 4) continue

    const { fit, kept } = rejectOutliers
      ? fitWithRejection(rest)
      : { fit: ols(rest), kept: rest }
    if (!kept.length) continue

    const used = kept.map((s) => ({ ...s, detrended: s.value - fit.b * s.elevation }))
    const model: Model = {
      variable,
      a: fit.a,
      b: fit.b,
      r2: fit.r2,
      sigma: fit.sigma,
      used,
      rejected: [],
      candidates: rest.length,
      passes: 0,
      anchors: 0,
      // El leave-one-out mide la red del Cabildo contra sí misma. Ni anclas ni
      // cumbre entran aquí: el número que sale tiene que seguir contestando
      // «cuánto se equivoca el interpolador con las estaciones que hay».
      summit: false,
      calibration: null,
      elevationRange: [
        Math.min(...kept.map((s) => s.elevation)),
        Math.max(...kept.map((s) => s.elevation)),
      ],
    }

    const est = estimate(model, target.lon, target.lat, target.elevation)
    if (!est) continue
    errors.push({
      err: est.value - target.value,
      name: target.name,
      elevation: target.elevation,
      observed: target.value,
      predicted: est.value,
    })
  }

  const n = errors.length
  const excluded = all.length - targets.length
  if (!n) {
    return { n: 0, excluded, mae: NaN, rmse: NaN, bias: NaN, maxError: NaN, worst: [] }
  }
  const mae = errors.reduce((a, e) => a + Math.abs(e.err), 0) / n
  const rmse = Math.sqrt(errors.reduce((a, e) => a + e.err * e.err, 0) / n)
  const bias = errors.reduce((a, e) => a + e.err, 0) / n
  const sorted = errors.slice().sort((a, b) => Math.abs(b.err) - Math.abs(a.err))
  return {
    n,
    excluded,
    mae,
    rmse,
    bias,
    maxError: Math.abs(sorted[0].err),
    worst: sorted.slice(0, 5).map(({ name, elevation, observed, predicted }) => ({
      name,
      elevation,
      observed,
      predicted,
    })),
  }
}

/**
 * Calibra la banda con el mismo leave-one-out que valida el modelo.
 *
 * Es caro —reconstruye el modelo entero una vez por estación— así que se llama
 * donde ya se memoriza por conjunto de estaciones, no en cada `buildModel`.
 *
 * @param modelPairs Valor de Open-Meteo en el punto de cada estación, contra lo
 *   que esa estación mide. Sin esto la banda de arriba se queda sin medir y las
 *   anclas heredan la del interpolador, que se les queda corta.
 */
export function calibrate(
  stations: readonly Station[],
  variable: InterpolableVariable,
  modelPairs: readonly { model: number | null; observed: number | null }[] = [],
): Calibration | null {
  const all = toSamples(stations, variable)
  const targets = fitWithRejection(all).kept
  const samples: LooSample[] = []

  for (const target of targets) {
    const rest = all.filter((s) => s.entityId !== target.entityId)
    if (rest.length < 8) continue
    const { fit, kept } = fitWithRejection(rest)
    if (kept.length < 4) continue

    const elevations = kept.map((s) => s.elevation)
    const range: [number, number] = [Math.min(...elevations), Math.max(...elevations)]
    const used = kept.map((s) => ({ ...s, detrended: s.value - fit.b * s.elevation }))
    const probe: Model = {
      variable,
      a: fit.a,
      b: fit.b,
      r2: fit.r2,
      sigma: fit.sigma,
      used,
      rejected: [],
      candidates: rest.length,
      passes: 0,
      elevationRange: range,
      anchors: 0,
      // Igual que en el leave-one-out: la calibración de la banda se mide sobre
      // la red, sin nada de por encima del techo. Ver el comentario de allí.
      summit: false,
      calibration: null,
    }
    const est = estimate(probe, target.lon, target.lat, target.elevation)
    if (!est) continue

    // La MISMA forma que se usará al pedir la banda, evaluada aquí: si las dos
    // se desincronizan, la cobertura calibrada deja de valer.
    const nearestKm = nearestStationKm(kept, target.lon, target.lat)
    samples.push({
      absError: Math.abs(est.value - target.value),
      shape: bandShape(nearestKm, target.elevation, range),
    })
  }

  const scale = calibrateScale(samples)
  if (scale === null) return null
  const model = calibrateModelBand(modelPairs)
  return {
    scale,
    modelBand: model.band,
    n: samples.length,
    modelN: model.n,
    modelBias: model.bias,
  }
}

// ---------------------------------------------------------------------------
// Conjunto coherente de variables higrotérmicas
// ---------------------------------------------------------------------------

export interface Bundle {
  temperature: Estimate | null
  relativehumidity: Estimate | null
  dewpoint: Estimate | null
  /** Déficit de presión de vapor, kPa. Derivado como el rocío. */
  vpd: Estimate | null
}

/**
 * Deriva una variable de la temperatura y la humedad, propagando la banda.
 *
 * La incertidumbre se propaga NUMÉRICAMENTE: se recalcula la función en las
 * cuatro esquinas de las bandas de T y RH y se toma la mayor desviación. Es
 * grosero, pero es honesto y respeta la no linealidad —Magnus es exponencial,
 * y el VPD lo es todavía más—, cosa que sumar las bandas en cuadratura no
 * haría. Con una banda de ±1,3 K a 25 °C la asimetría del VPD entre los dos
 * extremos ronda el 8 %: quedarse con el peor lado es la lectura prudente.
 */
function derive2(
  temperature: Estimate,
  relativehumidity: Estimate,
  fn: (tempC: number, rh: number) => number,
): Estimate {
  const value = fn(temperature.value, relativehumidity.value)
  let spread = 0
  for (const dt of [-temperature.uncertainty, temperature.uncertainty]) {
    for (const dh of [-relativehumidity.uncertainty, relativehumidity.uncertainty]) {
      const alt = fn(temperature.value + dt, clampHumidity(relativehumidity.value + dh))
      spread = Math.max(spread, Math.abs(alt - value))
    }
  }
  return {
    value,
    uncertainty: spread,
    contributors: temperature.contributors,
    extrapolated: temperature.extrapolated || relativehumidity.extrapolated,
    elevationExtrapolated:
      temperature.elevationExtrapolated || relativehumidity.elevationExtrapolated,
    // Un valor derivado no es más fresco que el más viejo de sus ingredientes.
    observedAt: Math.min(temperature.observedAt, relativehumidity.observedAt),
    oldestObservedAt: Math.min(
      temperature.oldestObservedAt,
      relativehumidity.oldestObservedAt,
    ),
  }
}

/**
 * Estima temperatura, humedad y rocío de forma MUTUAMENTE COHERENTE.
 *
 * Interpolar las tres por separado permite que se contradigan: se llegó a ver
 * 99 % de humedad junto a un punto de rocío de −7,9 °C a la misma altitud, que
 * no es un valor impreciso sino uno imposible. Aquí se interpolan las dos que
 * la red mide bien y el rocío sale de ellas, así que la contradicción no puede
 * darse por construcción.
 *
 * La humedad se recorta a [0, 100] al salir: el ajuste es lineal en la altitud
 * y por encima del rango muestreado se sale del intervalo físico.
 */
export function estimateBundle(
  models: Record<InterpolableVariable, Model | null>,
  lon: number,
  lat: number,
  elevation: number,
): Bundle {
  const temperature = models.temperature
    ? estimate(models.temperature, lon, lat, elevation)
    : null
  const rawHumidity = models.relativehumidity
    ? estimate(models.relativehumidity, lon, lat, elevation)
    : null

  const relativehumidity: Estimate | null = rawHumidity
    ? { ...rawHumidity, value: clampHumidity(rawHumidity.value) }
    : null

  const pair = temperature && relativehumidity ? { temperature, relativehumidity } : null

  return {
    temperature,
    relativehumidity,
    dewpoint: pair ? derive2(pair.temperature, pair.relativehumidity, dewpointFrom) : null,
    vpd: pair
      ? derive2(pair.temperature, pair.relativehumidity, vapourPressureDeficit)
      : null,
  }
}
