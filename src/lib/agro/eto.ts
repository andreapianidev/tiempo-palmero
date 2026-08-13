/**
 * Evapotranspiración de referencia: cuánta agua pide el día.
 *
 * POR QUÉ NO SALE DE LAS ESTACIONES DEL CABILDO. Porque no se sostiene.
 * Medido contra la API el 12 ago 2026 sobre las 37 estaciones frescas:
 * `dailyevapotranspiration` llega en 37, pero sólo **16 traen algo distinto de
 * cero**, y los valores rondan 0,09–0,20, que son pasos instantáneos y no
 * totales del día. Peor: `solarradiation` la publican **5 estaciones**, y sin
 * radiación no hay Penman-Monteith que reconstruir. Interpolar un campo de
 * ETo con eso sería inventarlo.
 *
 * DE DÓNDE SALE ENTONCES. De `et0_fao_evapotranspiration` de Open-Meteo, que
 * es FAO-56 Penman-Monteith resuelto por el modelo con su propia radiación,
 * pedida en los MISMOS 54 puntos que ya usa el campo de viento y con la cota
 * real del DEM en cada uno. Comprobado el 13 ago 2026: 6,99 mm a 50 m, 5,43 mm
 * a 870 m y 4,97 mm a 2114 m. El gradiente con la altitud es real y es
 * justamente lo que un dato de una sola estación no puede dar.
 *
 * QUÉ NO ES. No es una recomendación de riego. La ETo es la demanda de una
 * pradera de referencia; lo que una parcela concreta necesita depende de su
 * cultivo (`crops.ts`), de su suelo, de su sistema de riego y de lo que llovió
 * la semana pasada. `balance.ts` da el primer paso —ETc = ETo × Kc, menos la
 * lluvia— y la interfaz dice hasta dónde llega eso y dónde empieza el criterio
 * de quien conoce la finca.
 */

import { ISLAND_BBOX } from '../geo'
import { elevationAt, type Dem } from '../dem'
import { modelGridPoints, parseModelTime, type GridPoint } from '../wind/model'

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

export interface EtoSample {
  lon: number
  lat: number
  elevation: number
  /** ETo del día, mm. */
  etoMm: number
  /** Lluvia acumulada del día, mm, del MISMO modelo y la misma pasada. */
  rainMm: number
}

export interface EtoField {
  samples: EtoSample[]
  /** Día al que se refiere, `YYYY-MM-DD` en hora de Canarias. */
  day: string
  /** Instante de la pasada del modelo, epoch ms UTC. */
  observedAt: number
}

/**
 * Los mismos 54 puntos del campo de viento, y a propósito.
 *
 * Reutilizarlos no es pereza: significa que el mapa de ETo y el de viento
 * describen la misma rejilla del mismo modelo, así que cuando los dos digan
 * algo raro en el mismo sitio será por la misma razón y no por dos muestreos
 * distintos que no se pueden comparar.
 */
export { modelGridPoints }

export async function fetchEto(
  points: readonly GridPoint[],
  signal?: AbortSignal,
): Promise<EtoField | null> {
  if (!points.length) return null

  const url =
    `${OPEN_METEO_URL}?latitude=${points.map((p) => p.lat.toFixed(4)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(4)).join(',')}` +
    `&elevation=${points.map((p) => p.elevation).join(',')}` +
    `&daily=et0_fao_evapotranspiration,precipitation_sum` +
    `&forecast_days=1&timezone=Atlantic%2FCanary`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo ETo: HTTP ${res.status}`)
  const body = await res.json()
  const blocks: unknown[] = Array.isArray(body) ? body : [body]

  const samples: EtoSample[] = []
  let day = ''
  let observedAt = NaN

  blocks.forEach((raw, i) => {
    const b = raw as {
      daily?: {
        time?: string[]
        et0_fao_evapotranspiration?: (number | null)[]
        precipitation_sum?: (number | null)[]
      }
    }
    const d = b.daily
    const p = points[i]
    if (!d?.time?.length || !p) return

    const eto = d.et0_fao_evapotranspiration?.[0]
    const rain = d.precipitation_sum?.[0]
    // Sin ETo el punto no entra. La lluvia sí puede faltar y se cuenta como 0:
    // es lo que el modelo está diciendo cuando la columna llega vacía en un día
    // seco, y un hueco ahí desharía el balance de todo el punto.
    if (typeof eto !== 'number' || !Number.isFinite(eto)) return

    if (!day) day = d.time[0]
    if (!Number.isFinite(observedAt)) observedAt = parseModelTime(`${d.time[0]}T00:00`)

    samples.push({
      lon: p.lon,
      lat: p.lat,
      elevation: p.elevation,
      etoMm: eto,
      rainMm: typeof rain === 'number' && Number.isFinite(rain) ? rain : 0,
    })
  })

  if (!samples.length) return null
  return { samples, day, observedAt }
}

/**
 * Lee el campo en un punto cualquiera.
 *
 * Ponderación inversa a la distancia CORREGIDA POR ALTITUD, con el mismo
 * criterio que el resto de la aplicación usa para elegir estaciones: sobre una
 * isla de 2426 m, 100 m de desnivel pesan como un kilómetro de distancia. Sin
 * esa corrección, un punto de cumbre tomaría la ETo de la rejilla de la costa
 * que tiene justo debajo, que es un 40 % más alta.
 *
 * Tres vecinos, no todos: con 54 puntos a ~5 km, coger la rejilla entera
 * suaviza el gradiente de altitud que es justo lo que se quiere conservar.
 */
export function sampleEto(
  field: EtoField,
  lon: number,
  lat: number,
  elevationM: number,
): { etoMm: number; rainMm: number } | null {
  if (!field.samples.length) return null

  const scored = field.samples
    .map((s) => {
      const dLat = (s.lat - lat) * 111
      const dLon = (s.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180)
      const km = Math.hypot(dLat, dLon)
      return { s, cost: km + Math.abs(s.elevation - elevationM) / 100 }
    })
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 3)

  // Un punto que cae justo encima de una muestra se lleva su valor entero, sin
  // dividir por cero.
  if (scored[0].cost < 1e-6) {
    return { etoMm: scored[0].s.etoMm, rainMm: scored[0].s.rainMm }
  }

  let wSum = 0
  let eto = 0
  let rain = 0
  for (const { s, cost } of scored) {
    const w = 1 / (cost * cost)
    wSum += w
    eto += s.etoMm * w
    rain += s.rainMm * w
  }
  return { etoMm: eto / wSum, rainMm: rain / wSum }
}

/** Rectángulo de la isla, reexportado para quien dibuje el campo. */
export { ISLAND_BBOX, elevationAt }
export type { Dem, GridPoint }
