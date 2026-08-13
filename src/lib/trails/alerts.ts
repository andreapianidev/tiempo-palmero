/**
 * Avisos por sendero: qué se va a encontrar quien lo camine hoy.
 *
 * LO QUE ESTE FICHERO NO ES. No es una predicción ni un boletín oficial. Es
 * el campo que la aplicación ya publica —el mismo que se ve en el mapa, con
 * su validación de MAE 1,20 °C y RMSE 1,58 °C sobre 32 estaciones— leído a lo
 * largo de un trazado y comparado con unos umbrales. El estado real de un
 * sendero (derrumbes, cierres) lo publica el Cabildo en
 * senderosdelapalma.es/senderos/estado-de-los-senderos, y eso no está aquí.
 * La interfaz lo dice y enlaza allí: un aviso meteorológico no sustituye a un
 * cierre.
 *
 * LAS TRES HONESTIDADES QUE ESTE MÓDULO SOSTIENE:
 *
 * 1. **No hay aviso de lluvia.** Las 37 estaciones frescas publican
 *    `dailyprecipitation` y las 37 publican CERO —comprobado el 12 ago 2026
 *    contra la API—, así que la red no está midiendo lluvia de forma útil. Y
 *    la precipitación es de las variables que esta aplicación no interpola
 *    nunca, porque la vertiente NE recibe múltiplos de la SW a la misma
 *    altitud. Inventar un aviso de lluvia aquí sería la clase de cifra que
 *    este repositorio no publica.
 *
 * 2. **El viento se declara mestizo.** Sólo 24 de 37 estaciones lo publican y
 *    21 dan algo distinto de cero. El campo de `wind/field.ts` mezcla esas
 *    estaciones con el modelo y dice en cada punto cuánto pone cada uno;
 *    `windStationShare` viaja hasta el aviso para poder enseñarlo. En una
 *    cresta, donde el aviso más importa, casi siempre lo pone el modelo.
 *
 * 3. **La niebla no se adivina, se hereda.** El aviso de tramo dentro del mar
 *    de nubes sale de `clouds.ts`, que ya exige inversión Y nubosidad baja, y
 *    respeta su banda de incertidumbre: un sendero que sólo roza la banda no
 *    genera aviso.
 */

import { zoneAt, type CloudDeck } from '../clouds'
import type { TrailPoint, TrailProfile } from './sample'

export type AlertKind = 'wind' | 'cold' | 'heat' | 'fog'
export type Severity = 'notice' | 'warning'

export interface TrailAlert {
  kind: AlertKind
  severity: Severity
  /** Valor que dispara el aviso, en la unidad de su variable. */
  value: number
  /** Cota a la que ocurre lo peor. Sitúa el aviso dentro del recorrido. */
  atElevationM: number
  /** Fracción del recorrido afectada, 0–1. */
  share: number
  /** Sólo en el viento: cuánto de la cifra lo ponen estaciones, 0–1. */
  stationShare?: number
}

export interface TrailReport {
  profile: TrailProfile
  alerts: TrailAlert[]
  /** El peor de los avisos. `null` si no hay ninguno. */
  worst: Severity | null
}

/**
 * Umbrales. Están aquí, juntos y con su razón, en vez de repartidos por el
 * código: son los números que habrá que discutir con alguien que conozca la
 * montaña, y tienen que poder leerse de un vistazo.
 */
export const THRESHOLDS = {
  /**
   * Viento, m/s. 11 m/s (~40 km/h) molesta en una cresta; 17 m/s (~61 km/h)
   * es la fuerza 8 de Beaufort, «temporal», donde andar deja de ser cómodo y
   * pasa a ser una decisión. Son los cortes de la escala, no un criterio de
   * este proyecto.
   */
  windNoticeMs: 11,
  windWarningMs: 17,
  /**
   * Frío, °C. Lo que importa en la cumbre no es helar, es el rato largo por
   * debajo de 5 °C con ropa de costa: el Roque hiela de verdad y a esa altura
   * la gente sube en camiseta. 0 °C ya es aviso serio.
   */
  coldNoticeC: 5,
  coldWarningC: 0,
  /** Calor, °C. 30 y 35 al sol, sin sombra y con la mochila puesta. */
  heatNoticeC: 30,
  heatWarningC: 35,
  /**
   * Fracción mínima del recorrido afectada para que el aviso salga. Un solo
   * punto de 200 m con una racha no describe la ruta; el 10 % del trazado sí.
   * Sin este filtro, las 49 rutas tendrían aviso de algo casi siempre, y un
   * aviso que sale siempre no lo lee nadie.
   */
  minShare: 0.1,
  /**
   * Para la niebla se pide más: el 25 %. Cruzar la banda de nubes es normal en
   * cualquier ruta que suba de la costa a la cumbre, y avisarlo cada vez sería
   * describir la orografía, no el día.
   */
  minFogShare: 0.25,
} as const

/**
 * Genera los avisos de un sendero ya muestreado.
 *
 * Cada aviso mira TODO el recorrido y se queda con el peor punto, pero sólo
 * se emite si la condición cubre una fracción mínima. Así un aviso dice a la
 * vez «cuánto llega a apretar» y «en cuánto trecho», que son las dos cosas
 * que se necesitan para decidir.
 */
export function trailAlerts(profile: TrailProfile, deck: CloudDeck | null): TrailReport {
  const alerts: TrailAlert[] = []
  const n = profile.points.length

  /**
   * `worse` dice en qué DIRECCIÓN empeora cada variable, y no es un detalle.
   *
   * La primera versión se quedaba con el valor de mayor valor absoluto, y eso
   * elegía justo al revés en el aviso leve de frío: con un tramo a 4 °C y otro
   * a 1 °C, `|4| > |1|` señalaba los 4 °C —el punto más templado— como si fuera
   * lo peor de la ruta. Con el aviso grave no se veía, porque ahí todos los
   * puntos están bajo cero y el signo hacía coincidir las dos reglas.
   */
  const push = (
    kind: AlertKind,
    severity: Severity,
    hits: TrailPoint[],
    pick: (p: TrailPoint) => number,
    minShare: number,
    worse: (a: number, b: number) => boolean = (a, b) => a > b,
  ) => {
    const share = hits.length / n
    if (!hits.length || share < minShare) return
    const worst = hits.reduce((a, b) => (worse(pick(b), pick(a)) ? b : a))
    alerts.push({
      kind,
      severity,
      value: pick(worst),
      atElevationM: Math.round(worst.elevationM),
      share,
      ...(kind === 'wind' && worst.windStationShare !== null
        ? { stationShare: worst.windStationShare }
        : {}),
    })
  }

  // Viento. Se emite el aviso MÁS GRAVE que se cumpla, no los dos: decir
  // «temporal» y «viento fuerte» del mismo tramo es ruido.
  const gale = profile.points.filter(
    (p) => p.windMs !== null && p.windMs >= THRESHOLDS.windWarningMs,
  )
  const breeze = profile.points.filter(
    (p) => p.windMs !== null && p.windMs >= THRESHOLDS.windNoticeMs,
  )
  if (gale.length / n >= THRESHOLDS.minShare) {
    push('wind', 'warning', gale, (p) => p.windMs!, THRESHOLDS.minShare)
  } else {
    push('wind', 'notice', breeze, (p) => p.windMs!, THRESHOLDS.minShare)
  }

  // Frío.
  const freezing = profile.points.filter(
    (p) => p.temperature !== null && p.temperature <= THRESHOLDS.coldWarningC,
  )
  const chilly = profile.points.filter(
    (p) => p.temperature !== null && p.temperature <= THRESHOLDS.coldNoticeC,
  )
  const colder = (a: number, b: number) => a < b
  if (freezing.length / n >= THRESHOLDS.minShare) {
    push('cold', 'warning', freezing, (p) => p.temperature!, THRESHOLDS.minShare, colder)
  } else {
    push('cold', 'notice', chilly, (p) => p.temperature!, THRESHOLDS.minShare, colder)
  }

  // Calor.
  const scorching = profile.points.filter(
    (p) => p.temperature !== null && p.temperature >= THRESHOLDS.heatWarningC,
  )
  const hot = profile.points.filter(
    (p) => p.temperature !== null && p.temperature >= THRESHOLDS.heatNoticeC,
  )
  if (scorching.length / n >= THRESHOLDS.minShare) {
    push('heat', 'warning', scorching, (p) => p.temperature!, THRESHOLDS.minShare)
  } else {
    push('heat', 'notice', hot, (p) => p.temperature!, THRESHOLDS.minShare)
  }

  // Niebla. Sólo si `clouds.ts` afirma que hay manta de verdad; una inversión
  // seca no tapa nada. `zoneAt` respeta la banda de ±resolución, así que un
  // sendero que apenas la roza no cuenta.
  if (deck?.present) {
    const inside = profile.points.filter((p) => zoneAt(deck, p.elevationM) === 'within')
    push('fog', 'notice', inside, (p) => p.elevationM, THRESHOLDS.minFogShare)
  }

  const worst: Severity | null = alerts.some((a) => a.severity === 'warning')
    ? 'warning'
    : alerts.length
      ? 'notice'
      : null

  return { profile, alerts, worst }
}

/**
 * Ordena los informes para enseñarlos: primero lo grave, luego lo leve, y
 * dentro de cada grupo la ruta con más trecho afectado.
 *
 * Las rutas sin ningún aviso NO se tiran: se quedan al final. Que un sendero
 * esté tranquilo hoy es exactamente lo que alguien quiere saber antes de
 * elegirlo, y una lista que sólo enseña problemas obliga a deducirlo.
 */
export function rankReports(reports: readonly TrailReport[]): TrailReport[] {
  const rank = (r: TrailReport) => (r.worst === 'warning' ? 0 : r.worst === 'notice' ? 1 : 2)
  return [...reports].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    const shareA = Math.max(0, ...a.alerts.map((x) => x.share))
    const shareB = Math.max(0, ...b.alerts.map((x) => x.share))
    return shareB - shareA
  })
}
