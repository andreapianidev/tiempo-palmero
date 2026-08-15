/**
 * Rejilla de nubosidad y lluvia: qué hay en el aire, y dónde.
 *
 * QUÉ AÑADE ESTE FICHERO Y QUÉ NO. El mar de nubes ya lo diagnostica
 * `clouds.ts`, y lo hace bien: coge los sondeos verticales, encuentra la
 * inversión del alisio y dice entre qué dos cotas está la manta. Pero da UNA
 * banda para toda la isla, porque un sondeo describe una columna y solo se
 * piden cuatro. Para dibujar la escena hace falta la otra mitad de la
 * pregunta —**en qué sitios** hay nube y en cuáles no—, y esa no la contesta un
 * perfil vertical por muy bueno que sea.
 *
 * Así que esto no sustituye a `clouds.ts`: lo complementa. `clouds.ts` pone la
 * ALTURA de la manta, medida contra el sondeo; esta rejilla pone su REPARTO
 * horizontal. Las dos cosas juntas son lo que hace falta para colocar una nube
 * en un sitio y a una cota, y ninguna de las dos sola basta.
 *
 * POR QUÉ 54 PUNTOS Y NO UNO. Medido contra la API el 15 de agosto de 2026 a
 * las 08:30 UTC, sobre esta misma malla: la nubosidad baja iba de **0 a 72 %**
 * dentro de la isla, con media del 11,5 %. Un solo punto —el centro— habría
 * contestado 0 % y la escena habría salido despejada mientras el norte estaba
 * tapado. Ese día no es raro: es el alisio haciendo lo de siempre, apilar nube
 * contra la vertiente noreste y dejar el oeste limpio.
 *
 * Y el salto entre dos puntos vecinos, a 5 km uno de otro, llegó a **72 puntos
 * de porcentaje** esa misma mañana. Es el borde de la manta, y es real; pero
 * significa que quien lea esta rejilla NO puede coger el punto más cercano y
 * ya está, porque dibujaría la frontera de la nube como una línea recta de 5 km
 * entre dos celdas. De suavizarlo se encarga `field.ts`.
 *
 * NO SE MANDA `elevation=`. Es la misma trampa que documenta `profile.ts`: con
 * la cota forzada la API cambia de celda y contesta otra cosa. Aquí además no
 * tendría sentido —la nubosidad de un estrato es una propiedad de la columna,
 * no del suelo que hay debajo—, así que se pregunta por el punto y ya.
 */

import { dataUrl } from '../endpoints'
import { ISLAND_BBOX, MAP_BBOX } from '../geo'
import { toComponents } from '../wind/field'
import type { Etage } from './decks'

/** Por el proxy cacheado, no directo. El porqué está en `api/openmeteo.ts`. */
export const OPEN_METEO_URL = () => dataUrl('/api/openmeteo?kind=sky')

/**
 * La misma malla que el viento: 6 × 9 sobre el rectángulo insular, uno cada
 * ~5 km. No es casualidad ni pereza —es que la limita lo mismo—: `icon_seamless`
 * es un modelo global y no resuelve por debajo de esa escala, así que pedir más
 * puntos devolvería la misma celda repetida con otra etiqueta.
 */
const GRID_COLS = 6
const GRID_ROWS = 9

/** El modelo, el mismo que el sondeo, para que las dos mitades sean del mismo. */
export const SKY_MODEL = 'icon_seamless'

/**
 * A qué nivel de presión se le pide el viento a cada estrato.
 *
 * NO SE ESCALA EL VIENTO DE SUPERFICIE, y hay que insistir en esto porque era
 * la solución fácil: coger los 10 m que la aplicación ya descarga, multiplicar
 * por un factor a ojo y empujar las nubes con eso. Medido en el centro de la
 * isla el 15 de agosto de 2026 a las 08:30 UTC, en la misma petición:
 *
 *   - 10 m .......... 3,3 m/s del **51°**  (alisio del noreste)
 *   - 900 hPa ....... 5,3 m/s del **44°**  (el mismo alisio, más arriba)
 *   - 700 hPa ....... 6,2 m/s del **275°** (del oeste — casi el contrario)
 *   - 300 hPa ....... 6,4 m/s del  21°
 *
 * Los 231° que separan el nivel bajo del medio son un cizallamiento normal, y
 * significan que cualquier factor aplicado al viento de superficie habría
 * arrastrado las nubes medias justo hacia el lado opuesto al que van. No es un
 * error de matiz en la velocidad: es la dirección al revés.
 *
 * Las cotas de cada nivel encajan con las bandas de `decks.ts`: 900 hPa cae
 * hacia los 1000 m —donde vive la manta del alisio—, 700 hPa hacia los 3000 y
 * 300 hPa hacia los 9200, que es donde se dibuja el cirro.
 */
const LEVEL_HPA: Record<Etage, number> = { low: 900, mid: 700, high: 300 }

/** Viento de un estrato, en componentes. Nunca en grados: ver `wind/field.ts`. */
export interface LevelWind {
  /** Componente este, m/s. */
  u: number
  /** Componente norte, m/s. */
  v: number
}

export interface SkySample {
  lon: number
  lat: number
  /** Nubosidad del estrato bajo, %. Es la del alisio. */
  low: number
  /** Nubosidad media, %. */
  mid: number
  /** Nubosidad alta, %. Cirros. */
  high: number
  /** Precipitación de la última hora, mm. */
  precipMm: number
  /** El viento que arrastra cada estrato. Ver `LEVEL_HPA`. */
  wind: Record<Etage, LevelWind>
}

export interface SkyGrid {
  samples: SkySample[]
  /** Instante de la pasada del modelo, epoch ms UTC. */
  observedAt: number
  /** El modelo dice si es de día en la isla. Decide la luz de la escena. */
  isDay: boolean
}

/**
 * Lado del anillo que se pide sobre el mar, en el rectángulo del mapa.
 *
 * POR QUÉ HAY UN ANILLO. La escena dibuja nube hasta el borde del mapa, no
 * hasta el borde de la isla: `MAP_BBOX` son 92,5 × 111 km, y desde una cámara
 * alejada la mitad larga de lo que se ve es océano. Con solo la malla insular,
 * todo eso se habría rellenado extrapolando los puntos de la costa —que es
 * inventar—, o se habría quedado sin nube, con las nubes cortadas en seco sobre
 * una línea recta invisible a 20 km de la orilla.
 *
 * Un 5 × 5 sobre `MAP_BBOX` del que se guarda solo el borde son 16 puntos, uno
 * cada ~23-28 km. Es una resolución basta, y basta es lo correcto: sobre mar
 * abierto no hay orografía que resolver, la nubosidad varía suave y lo único
 * que se le pide a esos puntos es que el mar del fondo tenga el tiempo que de
 * verdad tiene. Los 54 finos se quedan donde hace falta, que es la isla.
 *
 * Total 70 puntos, por debajo de los 128 que admite el proxy.
 */
const SEA_RING_SIDE = 5

/** Los puntos donde se le pregunta al modelo. Sin cota, ver la cabecera. */
export function skyGridPoints(): { lon: number; lat: number }[] {
  const points: { lon: number; lat: number }[] = []

  const { west, east, south, north } = ISLAND_BBOX
  for (let j = 0; j < GRID_ROWS; j++) {
    const lat = south + ((j + 0.5) / GRID_ROWS) * (north - south)
    for (let i = 0; i < GRID_COLS; i++) {
      points.push({ lon: west + ((i + 0.5) / GRID_COLS) * (east - west), lat })
    }
  }

  const m = MAP_BBOX
  for (let j = 0; j < SEA_RING_SIDE; j++) {
    for (let i = 0; i < SEA_RING_SIDE; i++) {
      // Solo el borde: el interior ya lo cubre la malla insular, y mejor.
      if (i !== 0 && i !== SEA_RING_SIDE - 1 && j !== 0 && j !== SEA_RING_SIDE - 1) continue
      points.push({
        lon: m.west + (i / (SEA_RING_SIDE - 1)) * (m.east - m.west),
        lat: m.south + (j / (SEA_RING_SIDE - 1)) * (m.north - m.south),
      })
    }
  }

  return points
}

/**
 * `2026-08-15T08:30` llega en UTC pero SIN sufijo de zona. Sin la Z el
 * navegador lo leería como hora local, y en Canarias eso es una hora de
 * desfase en verano: la escena diría que es del mediodía cuando es de las once.
 * Mismo criterio que `wind/model.ts` y `profile.ts`.
 */
export function parseModelTime(time: string | undefined): number {
  if (!time) return NaN
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(time)
  if (!m) return NaN
  return Date.parse(`${m[1]}${m[2] ?? ':00'}Z`)
}

interface CurrentBlock {
  time?: string
  cloud_cover_low?: number
  cloud_cover_mid?: number
  cloud_cover_high?: number
  precipitation?: number
  is_day?: number
  [levelKey: string]: number | string | undefined
}

/**
 * El viento de un nivel, en componentes. Si falta cualquiera de las dos mitades
 * se devuelve calma: una velocidad sin dirección no dice hacia dónde empuja, y
 * suponerle el norte movería la nube hacia un sitio inventado. Con calma, la
 * nube se queda quieta, que es visiblemente «no lo sé» y no una afirmación.
 */
function levelWind(current: CurrentBlock, hPa: number): LevelWind {
  const speed = current[`wind_speed_${hPa}hPa`]
  const dir = current[`wind_direction_${hPa}hPa`]
  if (
    typeof speed !== 'number' ||
    typeof dir !== 'number' ||
    !Number.isFinite(speed) ||
    !Number.isFinite(dir)
  ) {
    return { u: 0, v: 0 }
  }
  return toComponents(speed, dir)
}

/** Un porcentaje del modelo, o `null` si no vino o vino roto. */
function pct(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

/**
 * Convierte un bloque `current` en una muestra.
 *
 * Los TRES estratos tienen que venir. Un punto al que le falte uno no es medio
 * dato: interpolado con los enteros de al lado abriría un agujero de nube justo
 * donde el modelo no ha dicho nada, y un agujero se lee como «aquí está
 * despejado», que es una afirmación. La lluvia sí puede faltar —se toma como
 * cero— porque su ausencia y su cero significan lo mismo para lo que se dibuja.
 */
export function decodeSkySample(
  current: CurrentBlock,
  lon: number,
  lat: number,
): SkySample | null {
  const low = pct(current.cloud_cover_low)
  const mid = pct(current.cloud_cover_mid)
  const high = pct(current.cloud_cover_high)
  if (low === null || mid === null || high === null) return null

  const p = current.precipitation
  return {
    lon,
    lat,
    low,
    mid,
    high,
    precipMm: typeof p === 'number' && Number.isFinite(p) ? Math.max(0, p) : 0,
    wind: {
      low: levelWind(current, LEVEL_HPA.low),
      mid: levelWind(current, LEVEL_HPA.mid),
      high: levelWind(current, LEVEL_HPA.high),
    },
  }
}

/**
 * Pide los 70 puntos en UNA petición. La API acepta listas separadas por comas
 * y devuelve un bloque por punto; 54 llamadas sueltas serían 54 veces la cuota.
 */
export async function fetchSkyGrid(
  points: readonly { lon: number; lat: number }[],
  signal?: AbortSignal,
): Promise<SkyGrid> {
  if (!points.length) return { samples: [], observedAt: NaN, isDay: true }

  const fields = [
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'precipitation',
    'is_day',
    ...Object.values(LEVEL_HPA).flatMap((hPa) => [
      `wind_speed_${hPa}hPa`,
      `wind_direction_${hPa}hPa`,
    ]),
  ]
  const url =
    `${OPEN_METEO_URL()}&latitude=${points.map((p) => p.lat.toFixed(4)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(4)).join(',')}` +
    `&current=${fields.join(',')}` +
    `&models=${SKY_MODEL}&wind_speed_unit=ms&timezone=UTC`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo cielo: HTTP ${res.status}`)
  const body = await res.json()
  // Con un solo punto la API devuelve un objeto; con varios, un array.
  const blocks: unknown[] = Array.isArray(body) ? body : [body]

  const samples: SkySample[] = []
  let observedAt = NaN
  let isDay = true
  blocks.forEach((raw, i) => {
    const current = (raw as { current?: CurrentBlock }).current
    const p = points[i]
    if (!current || !p) return
    const at = parseModelTime(current.time)
    // Sin hora fiable no entra: mejor un hueco que fechar mal una pasada.
    if (!Number.isFinite(at)) return
    const sample = decodeSkySample(current, p.lon, p.lat)
    if (!sample) return
    if (!Number.isFinite(observedAt)) {
      observedAt = at
      isDay = current.is_day !== 0
    }
    samples.push(sample)
  })

  return { samples, observedAt, isDay }
}
