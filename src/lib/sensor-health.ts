/**
 * Diagnóstico temporal de un sensor.
 *
 * POR QUÉ HACE FALTA. `quality.ts` juzga una lectura suelta: mira si el número
 * cae dentro de `BOUNDS` y si la fila es fresca. Eso atrapa al sensor que
 * publica 70 °C, pero no al que publica 24,83 °C —una cifra impecable— diez
 * horas después de haber pasado la noche a 3 °C a 1560 m en agosto. Un valor
 * plausible dentro de una serie imposible sigue siendo un dato falso, y la
 * única forma de verlo es mirar la serie.
 *
 * QUÉ NO HACE. No decide el tiempo que hace. La madrugada del 13 de agosto de
 * 2026 entró aire sahariano en La Palma y la estación 0401 saltó de 19,6 °C y
 * 82 % a 25,5 °C y 34 % en quince minutos: eso es un escalón real, corroborado
 * a la misma hora por El Paso, LasTricias y WSAQPM_5, con hardware distinto.
 * Un diagnóstico que marcase eso como avería borraría del mapa justo el
 * episodio que la gente abre la aplicación para mirar. Los umbrales de aquí
 * están puestos para dejarlo pasar, y el test lo fija.
 *
 * CÓMO SE HAN ELEGIDO LOS UMBRALES. Midiendo, no a ojo, sobre las 37
 * estaciones del 11 al 13 de agosto de 2026 (`__fixtures__/
 * sensor-health-window.json`). Cada constante lleva abajo la cifra que la
 * separa de la estación sana más extrema del archivo.
 */

import { ols, robustSigma, type SiteOffset } from './interpolate'
import { BOUNDS } from './quality'

export type { SiteOffset }

/**
 * Cuánto pasado se examina.
 *
 * SON 48 HORAS Y NO 24 POR UNA MEDIDA, no por prudencia. La avería de la 0408
 * es INTERMITENTE: sus últimas 24 h son lisas, y en esa ventana su salto
 * máximo es de 9,8 °C contra los 8,1 °C de la 0381, que está sana — no se
 * pueden distinguir. A 48 h la 0408 marca 16,2 °C de salto y 4,77 °C de
 * dispersión, contra 8,1 y 3,18 de las peores sanas: ahí sí separa.
 *
 * Con 36 h tampoco llega (9,8 contra 8,1). Bajar esta ventana es volver a no
 * ver la avería.
 */
export const WINDOW_H = 48

/**
 * Separación máxima entre dos muestras para poder compararlas.
 *
 * La red mezcla cadencias: la familia MTD publica cada 15 min, las CABLPA cada
 * hora y las WSAQPM cada 5. Con 66 min una estación horaria sigue comparando
 * muestras consecutivas, y un hueco de dos horas no se lee como un salto.
 */
export const MAX_GAP_MS = 66 * 60_000

/**
 * Salto imposible entre dos muestras consecutivas, en °C.
 *
 * Medido sobre las 37 estaciones del archivo: la 0408 (averiada) da 16,2 °C;
 * la sana más extrema es la 0381 con 8,1 °C, midiendo el borde del frente
 * sahariano, y la siguiente es la 0401 con 6,2 °C. El umbral va en 12 °C: deja
 * 1,5× de margen sobre la peor lectura sana real y sigue cazando la avería.
 */
export const JUMP_C = 12

/**
 * Cuántas lecturas idénticas seguidas delatan un sensor congelado.
 *
 * «Ecofinca Nogales» lleva 203 de 203 lecturas clavadas en 70 °C. Entre las
 * sanas la corsa más larga es de 10 (WSAQPM_3, que publica cada 5 min y
 * redondea). 24 lecturas son seis horas a cadencia de 15 min.
 */
export const STUCK_RUN = 24

/**
 * Dispersión máxima del desvío de una estación respecto al ajuste de la isla.
 *
 * LA IDEA. El desvío de una estación respecto al gradiente insular es una
 * característica DEL SITIO y tiene que ser estable: LasTricias marca +5,7 °C
 * hora tras hora porque es un sitio abrigado y caliente, y eso no es una
 * avería. Lo que no puede pasar es que ese desvío se mueva: una estación cuyo
 * desvío oscila no está midiendo su sitio, está inventando.
 *
 * Por eso NO se mide la mediana del desvío —que premiaría a los sitios raros—
 * sino su dispersión robusta. La 0408 da 4,77 °C; la peor sana es
 * CABLPA-CUMBRENUEVA con 3,18, y es de verdad un sitio turbulento: está en el
 * filo de la cumbre, donde el alisio desborda. El margen aquí es estrecho —
 * 1,26× — y por eso esta regla NO condena sola: pide además `MIN_HOURS`.
 */
export const DISPERSION_C = 4
/** Horas con desvío medido que exige la regla de dispersión. */
export const MIN_HOURS = 24

export interface Track {
  entityId: string
  name: string
  elevation: number
  /** `[epoch ms UTC, °C]`, ordenado por tiempo. */
  samples: readonly (readonly [number, number])[]
}

export type FaultKind = 'jump' | 'stuck' | 'incoherent' | 'impossible'

export interface Fault {
  kind: FaultKind
  /** La cifra medida que sostiene el diagnóstico. Se enseña, no se afirma. */
  measured: number
  /** El umbral que ha superado. */
  threshold: number
  /** Cuándo se ve (epoch ms UTC). */
  at: number
}

export interface Diagnosis {
  entityId: string
  faults: readonly Fault[]
  faulty: boolean
  /** Muestras examinadas en la ventana. */
  examined: number
}

/** Salto imposible: la mayor diferencia entre dos muestras comparables. */
export function jumpFault(track: Track): Fault | null {
  let worst: Fault | null = null
  for (let i = 1; i < track.samples.length; i++) {
    const [t0, a] = track.samples[i - 1]
    const [t1, b] = track.samples[i]
    const gap = t1 - t0
    if (gap <= 0 || gap > MAX_GAP_MS) continue
    const step = Math.abs(b - a)
    if (step > JUMP_C && (!worst || step > worst.measured)) {
      worst = { kind: 'jump', measured: step, threshold: JUMP_C, at: t1 }
    }
  }
  return worst
}

/** Sensor congelado: la corsa más larga de lecturas idénticas. */
export function stuckFault(track: Track): Fault | null {
  let run = 1
  let best = { run: 1, at: track.samples[0]?.[0] ?? 0 }
  for (let i = 1; i < track.samples.length; i++) {
    run = track.samples[i][1] === track.samples[i - 1][1] ? run + 1 : 1
    if (run > best.run) best = { run, at: track.samples[i][0] }
  }
  if (best.run < STUCK_RUN) return null
  return { kind: 'stuck', measured: best.run, threshold: STUCK_RUN, at: best.at }
}

/** Lectura fuera de la envolvente física, en cualquier momento de la ventana. */
export function impossibleFault(track: Track): Fault | null {
  const [lo, hi] = BOUNDS.temperature
  for (const [at, v] of track.samples) {
    if (!Number.isFinite(v) || v < lo || v > hi) {
      return { kind: 'impossible', measured: v, threshold: v < lo ? lo : hi, at }
    }
  }
  return null
}

/**
 * Desvío de cada estación respecto al ajuste altimétrico de la isla, hora a
 * hora.
 *
 * El ajuste se rehace en cada hora con las estaciones que publicaron en ella:
 * un gradiente fijo no valdría, porque el de la isla se mueve con la inversión
 * a lo largo del día. Se descartan las horas con menos de `MIN_FIT` estaciones,
 * donde la recta la decide cualquiera.
 */
const MIN_FIT = 8
const HOUR_MS = 3_600_000

export function hourlyResiduals(tracks: readonly Track[]): Map<string, number[]> {
  const [lo, hi] = BOUNDS.temperature
  // Una estación puede publicar varias veces dentro de la misma hora; se queda
  // la última, que es la que el resto de la aplicación considera vigente.
  const byHour = new Map<number, Map<string, number>>()
  const elevation = new Map<string, number>()
  for (const track of tracks) {
    elevation.set(track.entityId, track.elevation)
    for (const [at, v] of track.samples) {
      if (!Number.isFinite(v) || v < lo || v > hi) continue
      const hour = Math.floor(at / HOUR_MS)
      let bucket = byHour.get(hour)
      if (!bucket) byHour.set(hour, (bucket = new Map()))
      bucket.set(track.entityId, v)
    }
  }

  const out = new Map<string, number[]>()
  for (const [hour, bucket] of byHour) {
    if (bucket.size < MIN_FIT) continue
    const samples = [...bucket].map(([entityId, value]) => ({
      entityId,
      name: entityId,
      lon: 0,
      lat: 0,
      elevation: elevation.get(entityId) ?? 0,
      value,
      observedAt: hour * HOUR_MS,
      source: 'cabildo' as const,
    }))
    const fit = ols(samples)
    if (!Number.isFinite(fit.a) || !Number.isFinite(fit.b)) continue
    for (const s of samples) {
      const residual = s.value - (fit.a + fit.b * s.elevation)
      const list = out.get(s.entityId)
      if (list) list.push(residual)
      else out.set(s.entityId, [residual])
    }
  }
  return out
}

/**
 * Diagnostica toda la red de una vez.
 *
 * Es de red y no de estación porque la regla de coherencia necesita a las
 * demás: el desvío de una estación solo existe respecto al ajuste que hacen
 * las otras.
 */
/**
 * El desvío HABITUAL de cada estación respecto al ajuste insular.
 *
 * Es el mismo cálculo que ya alimentaba la regla de coherencia, pero devuelto
 * en vez de consumido y tirado. Lo pide el motor: una estación que lleva 48 h
 * marcando +5,7 °C sobre la recta de la isla no es una anomalía de hoy, es un
 * sitio abrigado, y el rechazo de outliers tenía que poder enterarse. Ver
 * `bySiteOffset` en `interpolate.ts`.
 */
export function siteOffsets(tracks: readonly Track[]): Map<string, SiteOffset> {
  const out = new Map<string, SiteOffset>()
  for (const [entityId, rs] of hourlyResiduals(tracks)) {
    if (!rs.length) continue
    out.set(entityId, {
      median: medianOf(rs),
      spread: robustSigma(rs),
      hours: rs.length,
    })
  }
  return out
}

function medianOf(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function diagnoseNetwork(tracks: readonly Track[]): Map<string, Diagnosis> {
  const residuals = hourlyResiduals(tracks)
  const out = new Map<string, Diagnosis>()

  for (const track of tracks) {
    const faults: Fault[] = []
    if (track.samples.length > 0) {
      const jump = jumpFault(track)
      if (jump) faults.push(jump)
      const stuck = stuckFault(track)
      if (stuck) faults.push(stuck)
      const impossible = impossibleFault(track)
      if (impossible) faults.push(impossible)
    }

    const rs = residuals.get(track.entityId)
    if (rs && rs.length >= MIN_HOURS) {
      const spread = robustSigma(rs)
      if (spread > DISPERSION_C) {
        faults.push({
          kind: 'incoherent',
          measured: spread,
          threshold: DISPERSION_C,
          at: track.samples[track.samples.length - 1]?.[0] ?? 0,
        })
      }
    }

    out.set(track.entityId, {
      entityId: track.entityId,
      faults,
      faulty: faults.length > 0,
      examined: track.samples.length,
    })
  }
  return out
}
