/**
 * El estado del mar, extendido a todo el recuadro del mapa y empaquetado en
 * texturas.
 *
 * POR QUÉ TEXTURAS Y NO UNIFORMS. El mar no es igual por los cuatro costados de
 * la isla (ver `marine.ts`), así que el sombreador necesita saber qué oleaje
 * toca en CADA punto. Se podrían pasar los ocho puntos como uniforms y hacer la
 * interpolación por vértice, pero eso son ocho distancias, ocho pesos y una
 * normalización en cada uno de los 37.000 vértices de la rejilla, sesenta veces
 * por segundo, para reconstruir un campo que solo cambia cada cinco minutos.
 * Interpolado UNA vez a una textura de 256 × 256, en la GPU es una lectura.
 *
 * TRES TEXTURAS, TRES COSAS DISTINTAS:
 *
 *   `swell`    el mar de fondo: dirección, altura y período
 *   `windSea`  el mar de viento: lo mismo, otro tren de olas
 *   `wind`     el viento a 10 m, que es lo que riza la superficie, arranca los
 *              borreguillos y dibuja las rachas
 *
 * EL VIENTO NO SALE DEL MODELO MARINO. Sale del campo que la aplicación ya
 * construye con las estaciones del Cabildo (`lib/wind/field.ts`), que en la
 * costa es muchísimo mejor que cualquier rejilla global: son medidas, y son las
 * que saben que a sotavento de la Cumbre puede haber calma con 10 m/s a cinco
 * kilómetros. Fuera del recuadro insular, donde ese campo no llega, se usa el
 * modelo del anillo de ocho puntos, y las dos cosas se cosen con una transición
 * suave para que no aparezca una costura recta en mitad del océano.
 */

import { MAP_BBOX, ISLAND_BBOX } from '../geo'
import { sampleField, speedOf, type WindField, type WindSample } from '../wind/field'
import { latFromMercatorY, lonFromMercatorX, mercatorBox, type MercatorBox } from './mercator'
import { travelVector } from './sea-state'
import type { MarineSample, WaveTrain } from './marine'

/**
 * Lado de las texturas de campo. 256 sobre el recuadro del mapa son 363 m por
 * texel en longitud y 434 m en latitud.
 *
 * El dato de origen es mucho más grueso que eso —la rejilla del modelo marino
 * tiene 9 km y el anillo son ocho puntos— así que 256 no añade información: lo
 * que hace es que la interpolación se vea continua en pantalla en vez de a
 * cuadros. Y el campo de viento propio SÍ tiene estructura a esta escala: sus
 * celdas miden 350 m.
 */
export const FIELD_SIZE = 256

/**
 * Techos de codificación. Cada canal es un byte y hay que decir cuánto vale el
 * 255 en cada uno.
 *
 *   8 m de altura  — los temporales del norte de Canarias llegan a 6-7 m de
 *                    altura significativa; 8 deja margen sin desperdiciar
 *                    escala (el escalón queda en 3 cm).
 *   20 s de período — el mar de fondo más largo que llega aquí, nacido en el
 *                    Atlántico norte, ronda los 16 s.
 *   35 m/s de viento — huracán en la escala Beaufort. En La Palma el récord
 *                    ronda los 40 m/s en la cumbre, pero esto es viento SOBRE
 *                    EL MAR, donde no hay aceleración orográfica.
 */
export const MAX_WAVE_HEIGHT_M = 8
export const MAX_WAVE_PERIOD_S = 20
export const MAX_WIND_MS = 35

export interface OceanField {
  size: number
  box: MercatorBox
  /** RGBA: dirección de avance (x, y), altura, período. */
  swell: Uint8Array
  windSea: Uint8Array
  /** RGBA: viento (u, v), parte sostenida por estaciones, sin usar. */
  wind: Uint8Array
}

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
const signedByte = (v: number) => byte(0.5 + 0.5 * v)

interface Weighted {
  dirX: number
  dirY: number
  heightM: number
  periodS: number
}

/**
 * Radio de suavizado de la interpolación, en grados.
 *
 * Shepard puro (peso 1/d²) clava el valor exacto en cada punto de muestreo y
 * deja un embudo alrededor: ocho ojos de buey en mitad del océano. Con el
 * término de suavizado 1/(d² + r²) el campo pasa cerca de cada muestra y entre
 * ellas va suave. 0,12° son 13 km: algo más que la separación de la rejilla del
 * modelo marino (9 km), que es la escala real del dato.
 */
const SMOOTH_DEG = 0.12

function interpolateTrain(
  samples: readonly MarineSample[],
  pick: (s: MarineSample) => WaveTrain,
  lon: number,
  lat: number,
): Weighted {
  let vx = 0
  let vy = 0
  let h = 0
  let t = 0
  let sum = 0
  for (const s of samples) {
    const dx = lon - s.lon
    const dy = lat - s.lat
    const w = 1 / (dx * dx + dy * dy + SMOOTH_DEG * SMOOTH_DEG)
    const train = pick(s)
    const dir = travelVector(train.directionDeg)
    // La dirección se promedia como vector UNITARIO y la altura como escalar.
    // Pesando la dirección por la altura, dos trenes opuestos se anularían y
    // saldría un mar plano en mitad del campo, que es lo contrario de lo que
    // pasa: donde se cruzan dos mares hay más movimiento, no menos.
    vx += dir.x * w
    vy += dir.y * w
    h += train.heightM * w
    t += train.periodS * w
    sum += w
  }
  if (!sum) return { dirX: 0, dirY: -1, heightM: 0, periodS: 8 }
  const len = Math.hypot(vx, vy)
  return {
    dirX: len > 1e-6 ? vx / len : 0,
    dirY: len > 1e-6 ? vy / len : -1,
    heightM: h / sum,
    periodS: t / sum,
  }
}

/** Viento del modelo, para el mar abierto que el campo propio no cubre. */
function interpolateWind(
  samples: readonly WindSample[],
  lon: number,
  lat: number,
): { u: number; v: number } {
  let u = 0
  let v = 0
  let sum = 0
  for (const s of samples) {
    const dx = lon - s.lon
    const dy = lat - s.lat
    const w = 1 / (dx * dx + dy * dy + SMOOTH_DEG * SMOOTH_DEG)
    u += s.u * w
    v += s.v * w
    sum += w
  }
  return sum ? { u: u / sum, v: v / sum } : { u: 0, v: 0 }
}

/**
 * Cuánto manda el campo propio en este punto, de 0 a 1.
 *
 * Vale 1 dentro del recuadro insular menos un margen, y baja a 0 en el borde.
 * El margen es de 0,05° (unos 5,5 km): sin él, el campo de viento de las
 * estaciones se cortaría en seco en una línea recta perfectamente visible sobre
 * el agua, porque justo en el borde del recuadro ese campo ya no tiene ninguna
 * estación cerca y vale casi cero.
 */
export function localWindShare(lon: number, lat: number): number {
  const margin = 0.05
  const edge = Math.min(
    lon - ISLAND_BBOX.west,
    ISLAND_BBOX.east - lon,
    lat - ISLAND_BBOX.south,
    ISLAND_BBOX.north - lat,
  )
  if (edge <= 0) return 0
  if (edge >= margin) return 1
  const t = edge / margin
  return t * t * (3 - 2 * t)
}

export function buildOceanField(
  marine: readonly MarineSample[],
  wind: WindField | null,
  offshoreWind: readonly WindSample[],
  size = FIELD_SIZE,
): OceanField {
  const box = mercatorBox(MAP_BBOX)
  const swell = new Uint8Array(size * size * 4)
  const windSea = new Uint8Array(size * size * 4)
  const windTex = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    const lat = latFromMercatorY(box.y0 + ((y + 0.5) / size) * box.height)
    for (let x = 0; x < size; x++) {
      const lon = lonFromMercatorX(box.x0 + ((x + 0.5) / size) * box.width)
      const i = (y * size + x) * 4

      const a = interpolateTrain(marine, (s) => s.swell, lon, lat)
      swell[i] = signedByte(a.dirX)
      swell[i + 1] = signedByte(a.dirY)
      swell[i + 2] = byte(a.heightM / MAX_WAVE_HEIGHT_M)
      swell[i + 3] = byte(a.periodS / MAX_WAVE_PERIOD_S)

      const b = interpolateTrain(marine, (s) => s.windWave, lon, lat)
      windSea[i] = signedByte(b.dirX)
      windSea[i + 1] = signedByte(b.dirY)
      windSea[i + 2] = byte(b.heightM / MAX_WAVE_HEIGHT_M)
      windSea[i + 3] = byte(b.periodS / MAX_WAVE_PERIOD_S)

      const far = interpolateWind(offshoreWind, lon, lat)
      const share = wind ? localWindShare(lon, lat) : 0
      const near = share > 0 ? sampleField(wind!, lon, lat) : null
      const u = near ? far.u + (near.u - far.u) * share : far.u
      const v = near ? far.v + (near.v - far.v) * share : far.v
      windTex[i] = signedByte(u / MAX_WIND_MS)
      windTex[i + 1] = signedByte(v / MAX_WIND_MS)
      windTex[i + 2] = byte(near ? near.station * share : 0)
      windTex[i + 3] = 255
    }
  }

  return { size, box, swell, windSea, wind: windTex }
}

/**
 * Qué mar hace en un punto, ya interpolado, para el panel.
 *
 * Lo calcula igual que la textura pero devolviendo números en vez de bytes: es
 * la garantía de que lo que dice el texto —«mar de fondo del nordeste, 1,3 m»—
 * es exactamente lo que la GPU está dibujando en ese mismo sitio, y no una
 * segunda cuenta parecida.
 */
export interface SeaStateAt {
  swell: Weighted
  windSea: Weighted
  windSpeedMs: number
  windDirX: number
  windDirY: number
}

export function seaStateAt(
  marine: readonly MarineSample[],
  wind: WindField | null,
  offshoreWind: readonly WindSample[],
  lon: number,
  lat: number,
): SeaStateAt {
  const far = interpolateWind(offshoreWind, lon, lat)
  const share = wind ? localWindShare(lon, lat) : 0
  const near = share > 0 ? sampleField(wind!, lon, lat) : null
  const u = near ? far.u + (near.u - far.u) * share : far.u
  const v = near ? far.v + (near.v - far.v) * share : far.v
  const speed = speedOf(u, v)
  return {
    swell: interpolateTrain(marine, (s) => s.swell, lon, lat),
    windSea: interpolateTrain(marine, (s) => s.windWave, lon, lat),
    windSpeedMs: speed,
    windDirX: speed > 0 ? u / speed : 0,
    windDirY: speed > 0 ? v / speed : 0,
  }
}
