/**
 * Estado del mar alrededor de la isla: mar de fondo, mar de viento, marea,
 * temperatura del agua y corriente.
 *
 * POR QUÉ OCHO PUNTOS Y NO UNO. En La Palma el mar no es el mismo por los
 * cuatro costados, y la diferencia no es un matiz: la isla mide 2426 m y hace
 * sombra al oleaje igual que la hace al viento. Leído del propio servicio el 13
 * de agosto de 2026 a las 17:00 UTC, con el mismo mar de fondo del noreste para
 * todos:
 *
 *   norte      mar de viento 0,96 m del 65°
 *   nordeste   mar de viento 0,22 m del 27°
 *   suroeste   mar de viento 0,02 m del 203°   ← el abrigo de la isla
 *   oeste      mar de viento 0,28 m del 41°
 *
 * Dos órdenes de magnitud entre el barlovento y el sotavento, en el mismo
 * instante y a 40 km de distancia. Un océano dibujado con un solo número sería
 * un océano que contradice al mapa de viento que tiene al lado.
 *
 * QUÉ ES CADA COSA. El servicio separa —y aquí se conserva la separación— el
 * *mar de fondo* (`swell`: olas largas nacidas en tormentas lejanas, que llegan
 * aunque aquí no sople nada) del *mar de viento* (`wind_wave`: la marejadilla
 * corta que levanta el viento local). Se superponen, no se suman: son dos
 * trenes de olas con período y dirección propios, y el mar se ve como se ve
 * justo por eso.
 *
 * ESTO ES UN MODELO, NO UNA MEDIDA. Open-Meteo Marine sirve la pasada de MFWAM
 * / ECMWF-WAM. No hay boya del Cabildo publicando oleaje en abierto alrededor
 * de La Palma, así que aquí no hay nada que medir contra qué contrastarlo, y la
 * interfaz lo dice donde se enseña la cifra. Es la misma regla que con el
 * viento: modelado se llama modelado.
 */

import { MAP_BBOX } from '../geo'

export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'

export interface MarinePoint {
  lon: number
  lat: number
}

/**
 * El anillo de muestreo: ocho puntos a 0,30° del centro de la isla.
 *
 * 0,30° en latitud son 33 km desde el centro, o sea unos 11 km de la costa por
 * el norte y el sur y 15 km por el este y el oeste: fuera de la isla por los
 * ocho rumbos —comprobado, el servicio devuelve `elevation: 0` en los ocho— y
 * dentro del recuadro que el mapa deja arrastrar. En longitud el radio va
 * dividido por el coseno de la latitud, para que el anillo sea redondo sobre el
 * terreno y no un óvalo aplastado.
 *
 * Ocho y no cuatro porque la rejilla del modelo tiene 0,083° (9 km): con cuatro
 * puntos, el sotavento del suroeste —que es el que hace que un día de alisio
 * fuerte Tazacorte esté en calma— caía justo entre dos muestras.
 */
export const MARINE_POINTS: MarinePoint[] = (() => {
  const lon0 = (MAP_BBOX.west + MAP_BBOX.east) / 2
  const lat0 = (MAP_BBOX.south + MAP_BBOX.north) / 2
  const radius = 0.3
  const k = 1 / Math.cos((lat0 * Math.PI) / 180)
  return Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return {
      lon: +(lon0 + radius * k * Math.sin(a)).toFixed(4),
      lat: +(lat0 + radius * Math.cos(a)).toFixed(4),
    }
  })
})()

/** Un tren de olas: cuánto levanta, de dónde viene y cada cuánto pasa. */
export interface WaveTrain {
  /** Altura significativa, m. */
  heightM: number
  /** De dónde VIENE, en grados, como el viento. */
  directionDeg: number
  /** Período, s. Es lo que fija la longitud de onda y la velocidad. */
  periodS: number
}

export interface MarineSample {
  lon: number
  lat: number
  /** Olas largas de origen lejano. */
  swell: WaveTrain
  /** La marejadilla del viento local. */
  windWave: WaveTrain
  /** Altura significativa combinada, m. La publica el modelo, no se suma aquí. */
  significantHeightM: number
  /** Temperatura superficial del agua, °C. `null` si el punto no la trae. */
  sstC: number | null
  /** Altura del mar sobre el nivel medio, m: la marea. */
  seaLevelM: number | null
  /** Corriente superficial: módulo en m/s y HACIA dónde va, en grados. */
  currentSpeedMs: number | null
  currentTowardDeg: number | null
}

export interface MarineState {
  samples: MarineSample[]
  /** Instante de la pasada, epoch ms UTC. `NaN` si ninguna muestra lo trae. */
  observedAt: number
}

const CURRENT_FIELDS = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'wind_wave_height',
  'wind_wave_direction',
  'wind_wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'sea_surface_temperature',
  'sea_level_height_msl',
  'ocean_current_velocity',
  'ocean_current_direction',
].join(',')

export function marineUrl(points: readonly MarinePoint[]): string {
  return (
    `${MARINE_URL}?latitude=${points.map((p) => p.lat.toFixed(4)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(4)).join(',')}` +
    `&current=${CURRENT_FIELDS}&timezone=UTC`
  )
}

/**
 * `2026-08-13T17:00` viene en UTC pero sin la Z. Sin ella el navegador lo lee
 * como hora local, y en Canarias en verano eso es una hora de desfase. Misma
 * cautela que en el modelo de viento.
 */
export function parseMarineTime(time: string | undefined): number {
  if (!time) return NaN
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(time)
  return m ? Date.parse(`${m[1]}${m[2] ?? ':00'}Z`) : NaN
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

interface CurrentBlock {
  time?: string
  wave_height?: number
  wave_direction?: number
  wave_period?: number
  wind_wave_height?: number
  wind_wave_direction?: number
  wind_wave_period?: number
  swell_wave_height?: number
  swell_wave_direction?: number
  swell_wave_period?: number
  sea_surface_temperature?: number
  sea_level_height_msl?: number
  ocean_current_velocity?: number
  ocean_current_direction?: number
}

/**
 * Traduce la respuesta del servicio a muestras utilizables.
 *
 * Un punto sin altura de ola NO entra: el resto del mar se apaña con los
 * vecinos, que es exactamente lo que hace la interpolación. Rellenarlo con
 * ceros pondría una calma chicha en mitad de un temporal.
 */
export function readMarine(
  body: unknown,
  points: readonly MarinePoint[],
): MarineState {
  const blocks: unknown[] = Array.isArray(body) ? body : [body]
  const samples: MarineSample[] = []
  let observedAt = NaN

  blocks.forEach((raw, i) => {
    const c = (raw as { current?: CurrentBlock } | null)?.current
    const p = points[i]
    if (!c || !p) return

    const height = num(c.wave_height)
    if (height === null) return

    // El período a cero no existe: el servicio lo devuelve cuando ese tren de
    // olas no está presente (0,02 m de mar de viento con período 0,85 s es su
    // manera de decir «aquí no hay mar de viento»). Un período nulo dividiría
    // por cero al calcular la longitud de onda.
    const train = (h: unknown, d: unknown, t: unknown): WaveTrain => ({
      heightM: Math.max(0, num(h) ?? 0),
      directionDeg: num(d) ?? 0,
      periodS: Math.max(1, num(t) ?? 1),
    })

    const at = parseMarineTime(c.time)
    if (Number.isFinite(at) && !Number.isFinite(observedAt)) observedAt = at

    const currentKmh = num(c.ocean_current_velocity)
    samples.push({
      lon: p.lon,
      lat: p.lat,
      swell: train(c.swell_wave_height, c.swell_wave_direction, c.swell_wave_period),
      windWave: train(c.wind_wave_height, c.wind_wave_direction, c.wind_wave_period),
      significantHeightM: height,
      sstC: num(c.sea_surface_temperature),
      seaLevelM: num(c.sea_level_height_msl),
      // El servicio da la corriente en km/h; el resto de la aplicación habla en
      // m/s, así que se convierte aquí y no en cada sitio que la lea.
      currentSpeedMs: currentKmh === null ? null : currentKmh / 3.6,
      currentTowardDeg: num(c.ocean_current_direction),
    })
  })

  return { samples, observedAt }
}

export async function fetchMarine(
  points: readonly MarinePoint[] = MARINE_POINTS,
  signal?: AbortSignal,
): Promise<MarineState> {
  if (!points.length) return { samples: [], observedAt: NaN }
  const res = await fetch(marineUrl(points), { signal })
  if (!res.ok) throw new Error(`Open-Meteo Marine: HTTP ${res.status}`)
  return readMarine(await res.json(), points)
}

/**
 * Media de la marea entre las muestras.
 *
 * Se promedia y no se interpola por sitio a propósito: la marea sube y baja a
 * la vez en toda la isla —los ocho puntos daban entre −0,51 y −0,55 m en la
 * misma lectura, o sea 4 cm de diferencia en 60 km— y hacer que el nivel del
 * mar variara por el mapa sería inventar una pendiente de agua que no existe.
 */
export function meanSeaLevel(samples: readonly MarineSample[]): number | null {
  const values = samples.map((s) => s.seaLevelM).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Media de la temperatura del agua, para el panel. */
export function meanSst(samples: readonly MarineSample[]): number | null {
  const values = samples.map((s) => s.sstC).filter((v): v is number => v !== null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}
