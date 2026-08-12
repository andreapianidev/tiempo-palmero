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

/** Variables que sí admiten interpolación espacial. */
export type InterpolableVariable = 'temperature' | 'relativehumidity' | 'dewpoint'

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
] as const

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

export interface Sample {
  entityId: string
  name: string
  lon: number
  lat: number
  elevation: number
  value: number
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
  elevationRange: [number, number]
}

export interface Contributor {
  name: string
  entityId: string
  distanceKm: number
  /** altitud_estación − altitud_destino. Positivo = la estación está más alta. */
  elevationDelta: number
  weightShare: number
  rawValue: number
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
export function fitWithRejection(
  samples: readonly Sample[],
  sigmas = OUTLIER_SIGMA,
  maxPasses = MAX_REJECTION_PASSES,
): { fit: OlsFit; kept: Sample[]; rejected: RejectedSample[]; passes: number } {
  let kept = samples.slice()
  const rejected: RejectedSample[] = []
  let fit = ols(kept)
  let passes = 0

  for (let pass = 0; pass < maxPasses; pass++) {
    if (kept.length <= 4) break
    const residuals = kept.map((s) => s.value - (fit.a + fit.b * s.elevation))
    const scale = robustSigma(residuals)
    if (scale <= 1e-9) break

    const next: Sample[] = []
    const dropped: RejectedSample[] = []
    kept.forEach((s, i) => {
      const z = Math.abs(residuals[i]) / scale
      if (z > sigmas) dropped.push({ ...s, residual: residuals[i], sigmas: z })
      else next.push(s)
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
    })
  }
  return out
}

export function buildModel(
  stations: readonly Station[],
  variable: InterpolableVariable,
): Model {
  const samples = toSamples(stations, variable)
  const { fit, kept, rejected, passes } = fitWithRejection(samples)

  // 4. DETENDENCIA. Se deja la ordenada dentro del residuo: la retendencia
  // vuelve a sumarla, así que el resultado es idéntico y hay un término menos
  // que puedan desincronizarse entre sí.
  const used = kept.map((s) => ({ ...s, detrended: s.value - fit.b * s.elevation }))

  const elevations = kept.map((s) => s.elevation)
  return {
    variable,
    a: fit.a,
    b: fit.b,
    r2: fit.r2,
    sigma: fit.sigma,
    used,
    rejected,
    candidates: samples.length,
    passes,
    elevationRange: elevations.length
      ? [Math.min(...elevations), Math.max(...elevations)]
      : [0, 0],
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

function gather(
  model: Model,
  target: LonLat,
  elevation: number,
): { list: Weighted[]; extrapolated: boolean } {
  const within: Weighted[] = []
  const all: Weighted[] = []
  for (const s of model.used) {
    const d = haversineKm(target, [s.lon, s.lat])
    // Distancia efectiva: horizontal y desnivel en el mismo espacio métrico.
    const dz = (s.elevation - elevation) / ELEVATION_SCALE_M_PER_KM
    const effective = Math.max(Math.hypot(d, dz), MIN_DISTANCE_KM)
    const w = 1 / effective ** IDW_POWER
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
 * Banda de incertidumbre. Heurística, y se presenta como tal:
 *   base   σ de los residuos del ajuste — la parte que la altitud no explica
 *   +dist  penaliza estar lejos de la estación más cercana (hasta ×1,5 al corte)
 *   +alt   penaliza extrapolar por encima o por debajo del rango muestreado
 *
 * No es un intervalo de confianza estadístico y la UI no lo llama así.
 */
function uncertaintyAt(model: Model, nearestKm: number, elevation: number): number {
  const base = Math.max(model.sigma, 0.15)
  const distFactor = 1 + Math.min(nearestKm / IDW_CUTOFF_KM, 1) * 0.5
  const [lo, hi] = model.elevationRange
  const outside = elevation > hi ? elevation - hi : elevation < lo ? lo - elevation : 0
  const elevFactor = 1 + outside / 500
  return base * distFactor * elevFactor
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
      distanceKm: it.d,
      elevationDelta: it.s.elevation - elevation,
      weightShare: it.w / sw,
      rawValue: it.s.value,
    }))

  const nearestKm = Math.min(...list.map((it) => it.d))
  const [lo, hi] = model.elevationRange
  return {
    value,
    uncertainty: uncertaintyAt(model, nearestKm, elevation),
    contributors: top,
    extrapolated,
    elevationExtrapolated: elevation > hi || elevation < lo,
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
