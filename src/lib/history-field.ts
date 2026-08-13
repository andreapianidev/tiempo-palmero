/**
 * El pasado en un punto CUALQUIERA, no solo donde hay una estación.
 *
 * LA IDEA. La aplicación ya sabe estimar el tiempo de ahora en cualquier punto
 * de la isla: ajusta el gradiente altitudinal con las estaciones vivas e
 * interpola los residuos (`interpolate.ts`). Nada de eso depende de que el
 * instante sea «ahora». Si se le dan las lecturas de las 03:00 de ayer, el
 * mismo motor devuelve la estimación de las 03:00 de ayer. Rehaciéndolo
 * instante a instante sale la curva de un punto donde no hay ni ha habido
 * nunca un sensor — que era la única forma de que la pregunta «¿y aquí, qué
 * tiempo hizo?» tuviese respuesta en un sitio sin estación.
 *
 * SE REHACE EL MODELO ENTERO EN CADA INSTANTE, y es lo que lo hace honesto: el
 * gradiente de La Palma no es una constante que se pueda aplicar a toda la
 * serie, se mueve con la inversión a lo largo del día y con el episodio a lo
 * largo de la semana. Reutilizar un solo ajuste sería más barato y estaría mal
 * justo en las horas interesantes.
 *
 * QUÉ NO ES. No es una medida y no puede pasar por una. Cada punto de la curva
 * lleva su banda de incertidumbre y su número de estaciones, y las horas en las
 * que la red no daba para ajustar nada salen como hueco, no como línea recta.
 */

import {
  buildModel,
  estimate,
  type InterpolableVariable,
  type Model,
} from './interpolate'
import type { DayPayload } from './history'
import type { Station } from './quality'
import { BOUNDS } from './quality'

/** Mínimo de estaciones para que un instante valga. Por debajo, hueco. */
export const MIN_STATIONS = 8

export interface FieldPoint {
  at: number
  value: number
  /** ±, en unidades de la variable. */
  uncertainty: number
  /** Cuántas estaciones sostienen este instante. */
  stations: number
  /** El punto queda por encima del rango de altitudes medido en ese instante. */
  elevationExtrapolated: boolean
}

/**
 * Estación mínima viable para el motor.
 *
 * `buildModel` pide `Station` completa, pero del archivo solo llegan cinco
 * columnas. El resto va a null: son campos que el ajuste no mira, y rellenarlos
 * con ceros fingiría un dato que no existe.
 */
function stationFrom(
  entityId: string,
  name: string,
  lon: number,
  lat: number,
  elevation: number,
  at: number,
  temperature: number,
  relativehumidity: number | null,
): Station {
  return {
    entityId,
    name,
    lon,
    lat,
    elevation,
    timeinstant: at,
    ageHours: 0,
    temperature,
    relativehumidity,
    dewpoint: null,
    windspeed: null,
    winddirection: null,
    precipitation: null,
    dailyprecipitation: null,
    atmosphericpressure: null,
    pressureWasReduced: false,
    uv: null,
    solarradiation: null,
    dailyevapotranspiration: null,
    feellikestemperature: null,
    illuminance: null,
    visibility: null,
    raw: {},
  }
}

/**
 * Agrupa el archivo en instantes redondeados a `stepMin`.
 *
 * La red no está sincronizada —las MTD publican a y 6, las CABLPA en punto, las
 * WSAQPM cada 5 minutos— así que sin redondear no habría dos estaciones en el
 * mismo instante y no se podría ajustar nada. Dentro de cada cubo se queda la
 * lectura más cercana al centro, no la última: la última puede estar a 14
 * minutos del instante que dice representar.
 */
export function bucketize(
  days: readonly DayPayload[],
  elevationAt: (lon: number, lat: number) => number | null,
  stepMin: number,
  excluded: ReadonlySet<string> = new Set(),
): Map<number, Station[]> {
  const stepMs = stepMin * 60_000
  const [lo, hi] = BOUNDS.temperature
  /** cubo → entityId → { estación, distancia al centro del cubo } */
  const buckets = new Map<number, Map<string, { station: Station; off: number }>>()

  for (const payload of days) {
    const dayStart = Date.parse(`${payload.day}T00:00:00Z`)
    if (!Number.isFinite(dayStart)) continue
    const iT = payload.columns.indexOf('temperature')
    const iH = payload.columns.indexOf('relativehumidity')
    if (iT < 0) continue

    for (const st of payload.stations) {
      // Una estación averiada no entra en el pasado por la misma razón por la
      // que no entra en el presente: contaminaría el ajuste de cada instante.
      if (excluded.has(st.entityId)) continue
      const elevation = elevationAt(st.lon, st.lat)
      if (elevation === null) continue

      for (const sample of st.samples) {
        const minutes = sample[0]
        const temperature = sample[iT + 1]
        if (typeof minutes !== 'number' || typeof temperature !== 'number') continue
        if (temperature < lo || temperature > hi) continue

        const at = dayStart + minutes * 60_000
        const centre = Math.round(at / stepMs) * stepMs
        const off = Math.abs(at - centre)

        let bucket = buckets.get(centre)
        if (!bucket) buckets.set(centre, (bucket = new Map()))
        const prev = bucket.get(st.entityId)
        if (prev && prev.off <= off) continue

        const rawH = iH >= 0 ? sample[iH + 1] : null
        bucket.set(st.entityId, {
          off,
          station: stationFrom(
            st.entityId,
            st.name,
            st.lon,
            st.lat,
            elevation,
            at,
            temperature,
            typeof rawH === 'number' ? rawH : null,
          ),
        })
      }
    }
  }

  const out = new Map<number, Station[]>()
  for (const [centre, bucket] of buckets) {
    out.set(centre, [...bucket.values()].map((b) => b.station))
  }
  return out
}

/**
 * La serie estimada en un punto.
 *
 * `variable` es solo interpolable: temperatura o humedad. El rocío no se
 * interpola en ningún sitio de la aplicación —se deriva de las otras dos para
 * que no puedan contradecirse— y aquí se mantiene esa regla en vez de abrir
 * una excepción que solo existiría en las gráficas.
 */
export function fieldSeries(
  buckets: Map<number, Station[]>,
  variable: InterpolableVariable,
  lon: number,
  lat: number,
  elevation: number,
): FieldPoint[] {
  const out: FieldPoint[] = []

  for (const [at, stations] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const withValue = stations.filter((s) => s[variable] !== null)
    if (withValue.length < MIN_STATIONS) continue

    let model: Model
    try {
      model = buildModel(withValue, variable)
    } catch {
      continue
    }
    const est = estimate(model, lon, lat, elevation)
    if (!est) continue

    out.push({
      at,
      value: est.value,
      uncertainty: est.uncertainty,
      stations: model.used.length,
      elevationExtrapolated: est.elevationExtrapolated,
    })
  }

  return out
}
