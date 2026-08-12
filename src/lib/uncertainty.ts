/**
 * La banda de incertidumbre, calibrada contra los datos en vez de supuesta.
 *
 * QUÉ ESTABA MAL. La versión anterior usaba como base la σ de los residuos del
 * ajuste altitudinal, multiplicada por dos factores heurísticos. Pero esa σ
 * mide la dispersión alrededor de la RECTA, y la cifra que se enseña no sale de
 * la recta: sale de la recta MÁS el IDW de los residuos, que explica una parte
 * de esa dispersión. Usar la σ del ajuste para medir el error del pipeline
 * entero es medir otra cosa. Y se notaba en las dos direcciones: sobre el
 * fixture del 12 ago 2026 la banda cubría el 59 % de los casos en temperatura
 * —demasiado estrecha— y el 82 % en humedad —demasiado ancha—, cuando una banda
 * de 1σ debería cubrir el 68 %. Sobre los datos en vivo de esa misma tarde la
 * humedad se iba al otro lado, al 56 %. Es decir: no fallaba por un factor fijo
 * que se pudiera corregir a mano, fallaba de forma distinta según la variable y
 * según el día, que es la razón de calibrarla en caliente y no ajustar
 * constantes.
 *
 * Calibrada, sobre ese mismo fixture: 69 % en temperatura y 68 % en humedad.
 *
 * QUÉ SE HACE AHORA. Se calibra con lo único que mide el error de verdad, que
 * es el leave-one-out del pipeline completo — el mismo que ya alimenta el RMSE
 * del panel. Para cada estación excluida se calcula el error real y el valor
 * del término de forma, y la escala es el **cuantil 0,68 del cociente**. Por
 * construcción, la banda cubre entonces el 68 % de los casos: ya no es una
 * constante elegida a ojo, es una propiedad medida de la red de hoy.
 *
 * Y ARRIBA, DONDE NO HAY RED. Por encima del techo la cifra la sostienen las
 * anclas de Open-Meteo, así que su incertidumbre es la del modelo, no la del
 * interpolador. Se mide igual de directo: se le pregunta a Open-Meteo por el
 * punto de cada estación y se compara con lo que esa estación mide. Medido en
 * vivo el 12 ago 2026 sobre 35 estaciones, el modelo va +2,4 °C y −20,6 puntos
 * de humedad respecto a la red — de ahí que la banda en la cumbre salga ancha.
 * Es ancha porque de verdad no se sabe mejor.
 *
 * Ese contraste se hace donde HAY estaciones, o sea casi todo por debajo de la
 * inversión, que es justo donde peor lo hace un modelo global: no resuelve el
 * mar de nubes contra la ladera. Estratificado por altitud el sesgo de humedad
 * es −20,8 / −23,7 / −10,0 en 0-500, 500-1000 y >1000 m, así que arriba el
 * modelo acierta más y la banda que se usa allí queda del lado conservador.
 * Con 4 estaciones por encima de 1000 m no da para calibrar una banda propia de
 * esa franja, y fingir que sí sería volver al problema que este archivo arregla.
 */

import { haversineKm } from './geo'
import { IDW_CUTOFF_KM } from './interpolate'

/** Fracción de casos que la banda debe cubrir. Una banda de 1σ cubre esto. */
export const TARGET_COVERAGE = 0.68

export interface Calibration {
  /** Escala del término de forma, medida por leave-one-out. */
  scale: number
  /** |error| del modelo contra las estaciones. null si no se ha podido medir. */
  modelBand: number | null
  /** Estaciones que han entrado en la calibración del interpolador. */
  n: number
  /** Estaciones que han entrado en la comparación contra el modelo. */
  modelN: number
  /** Desvío medio del modelo respecto a la red. Positivo = el modelo va alto. */
  modelBias: number | null
}

/**
 * Cuantil por interpolación de orden, sin dependencias. Con pocas muestras el
 * cuantil empírico es preferible a suponer normalidad: la distribución de
 * errores de esta red tiene colas y no lo es.
 */
export function quantile(values: readonly number[], q: number): number {
  if (!values.length) return NaN
  const s = values.slice().sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))
  return s[i]
}

/**
 * Término de forma de la banda: cómo crece el error al alejarse de la estación
 * más cercana y al salirse del rango de altitudes muestreado.
 *
 * Solo describe la FORMA. La magnitud la pone la calibración, y por eso esta
 * función no tiene ninguna constante con unidades que ajustar a ojo.
 */
export function bandShape(
  nearestKm: number,
  elevation: number,
  elevationRange: readonly [number, number],
): number {
  const distFactor = 1 + Math.min(nearestKm / IDW_CUTOFF_KM, 1) * 0.5
  const [lo, hi] = elevationRange
  const outside = elevation > hi ? elevation - hi : elevation < lo ? lo - elevation : 0
  return distFactor * (1 + outside / 500)
}

/**
 * Distancia horizontal a la estación fiable más cercana, en km.
 *
 * Se cuenta solo sobre medidas del Cabildo, nunca sobre anclas: el ancla de la
 * cumbre está a 0 km del punto de la cumbre y contarla estrecharía la banda
 * justo donde el valor deja de ser una medida.
 */
export function nearestStationKm(
  stations: readonly { lon: number; lat: number }[],
  lon: number,
  lat: number,
): number {
  if (!stations.length) return IDW_CUTOFF_KM
  let best = Infinity
  for (const s of stations) {
    const d = haversineKm([lon, lat], [s.lon, s.lat])
    if (d < best) best = d
  }
  return Math.min(best, IDW_CUTOFF_KM)
}

export interface LooSample {
  /** |predicho − observado| en esa estación, con el modelo hecho sin ella. */
  absError: number
  /** Valor del término de forma en esa estación. */
  shape: number
}

/**
 * Escala tal que la banda cubra `TARGET_COVERAGE` de los errores observados.
 *
 * Se pide un mínimo de muestras porque un cuantil sobre cuatro números no es un
 * cuantil. Por debajo devuelve null y quien llama se queda con la heurística
 * anterior, que será peor pero no inventada.
 */
export function calibrateScale(samples: readonly LooSample[]): number | null {
  const ratios = samples
    .filter((s) => Number.isFinite(s.absError) && s.shape > 1e-9)
    .map((s) => s.absError / s.shape)
  if (ratios.length < 8) return null
  return quantile(ratios, TARGET_COVERAGE)
}

/**
 * Banda del modelo: el cuantil 0,68 de |modelo − estación| sobre los puntos en
 * los que se puede comparar. Es la incertidumbre honesta de un valor sostenido
 * por Open-Meteo en vez de por un sensor.
 */
export function calibrateModelBand(
  pairs: readonly { model: number | null; observed: number | null }[],
): { band: number | null; n: number; bias: number | null } {
  const diffs: number[] = []
  for (const p of pairs) {
    if (p.model === null || p.observed === null) continue
    if (!Number.isFinite(p.model) || !Number.isFinite(p.observed)) continue
    diffs.push(p.model - p.observed)
  }
  if (diffs.length < 5) return { band: null, n: diffs.length, bias: null }
  return {
    band: quantile(diffs.map(Math.abs), TARGET_COVERAGE),
    n: diffs.length,
    bias: diffs.reduce((a, b) => a + b, 0) / diffs.length,
  }
}
