/**
 * Leer la rejilla del cielo en cualquier punto, y resumirla para el panel.
 *
 * POR QUÉ SE SUAVIZA Y NO SE COGE EL PUNTO MÁS CERCANO. Medido el 15 de agosto
 * de 2026: dos puntos vecinos de la malla, separados 5 km, marcaban **0 % y
 * 72 %** de nubosidad baja. Con vecino más cercano, esa frontera se dibujaría
 * como una línea recta de 5 km partiendo la isla en dos —nube maciza a un lado,
 * cielo limpio al otro— y esa línea no existe en ningún sitio: es el borde de
 * la celda del modelo, no el borde de la nube.
 *
 * Se usa IDW con el MISMO núcleo que el campo de viento —`1 / (d² + 0,25)`—, y
 * es a propósito: las dos capas leen rejillas del mismo modelo, con el mismo
 * paso de 5 km, y que una suavice distinto que la otra haría que la nube y el
 * viento que la empuja discreparan sobre dónde está el borde de la masa.
 *
 * EL SUAVIZADO NO INVENTA COBERTURA. Es una media ponderada: el resultado nunca
 * sale del intervalo de las muestras que la sostienen, así que donde el modelo
 * dice 0 en todo el entorno esto devuelve 0 y no una neblina de cortesía. Lo
 * único que hace es repartir el paso entre los dos valores en vez de darlo de
 * golpe.
 *
 * NO GUARDA NINGÚN RÁSTER. Con 70 muestras, una consulta son 70 distancias, y
 * la escena consulta unas pocas decenas de veces por reconstrucción —no por
 * fotograma—. Un ráster intermedio añadiría una resolución más que elegir y
 * defender, para ahorrar un cómputo que no se nota.
 */

import { haversineKm } from '../geo'
import type { Etage } from './decks'
import type { LevelWind, SkyGrid, SkySample } from './model'

/** Lo que hay sobre un punto concreto de la isla. */
export interface SkyLocal {
  /** Nubosidad por estrato, %. */
  low: number
  mid: number
  high: number
  /** Precipitación de la última hora, mm. */
  precipMm: number
}

/**
 * Lluvia a partir de la cual se dibuja algo.
 *
 * 0,05 mm/h. El modelo devuelve dos decimales, así que esto es «cualquier cosa
 * que no sea un cero redondeado». Está tan abajo a propósito: la mediana de las
 * horas CON lluvia en esta isla es 0,20 mm/h (17 544 horas de archivo entre
 * agosto de 2024 y agosto de 2026, tres puntos), o sea que la lluvia normal de
 * La Palma es la lluvia fina, y un umbral cómodo de 0,5 se habría comido la
 * mitad de las veces que de verdad llueve.
 */
export const RAIN_MIN_MM = 0.05

/**
 * Lluvia a partir de la cual se dibuja «intensa».
 *
 * 3,5 mm/h, y NO los 7,6 mm/h del criterio clásico de lluvia fuerte. Esa cifra
 * es de climas continentales y aquí no describe nada: medido sobre dos años de
 * archivo horario (ago 2024 – ago 2026) en tres puntos de la isla —barlovento,
 * cumbre y sotavento—, el **percentil 99 de las horas con lluvia** está en 3,6,
 * 3,9 y 5,1 mm/h, y el máximo absoluto de los tres puntos en los dos años es
 * 14,2 mm/h. Con el umbral en 7,6 la escena habría enseñado lluvia intensa un
 * puñado de horas en dos años: un estado que no se ve nunca es un estado que no
 * está.
 *
 * Las dos orillas, que es lo que hay que medir: por debajo quedan el 99 % de
 * las horas de lluvia de la isla —incluida la lluvia fina del alisio, que es la
 * que más suena— y por encima queda ese 1 % que en La Palma es de verdad un
 * chaparrón. La proporción de horas con lluvia también sale del mismo archivo:
 * 23,3 % en barlovento, 17,9 % en la cumbre, 10,4 % en sotavento.
 */
export const RAIN_HEAVY_MM = 3.5

/**
 * Radio de suavizado, en km, como el del viento: `1 / (d² + SMOOTH_KM²)`.
 *
 * 0,5 km de suelo. Evita el infinito justo encima de una muestra y deja que a
 * 5 km —el paso de la malla— el vecino ya pese cien veces menos que el de
 * encima, así que un punto que caiga sobre una muestra devuelve prácticamente
 * su valor y no una media de la isla entera.
 */
const SMOOTH_KM2 = 0.25

/** Qué hay sobre un punto. IDW sobre las 70 muestras de la rejilla. */
export function skyAt(samples: readonly SkySample[], lon: number, lat: number): SkyLocal {
  let low = 0
  let mid = 0
  let high = 0
  let precip = 0
  let weight = 0

  for (const s of samples) {
    const d = haversineKm([lon, lat], [s.lon, s.lat])
    const w = 1 / (d * d + SMOOTH_KM2)
    low += s.low * w
    mid += s.mid * w
    high += s.high * w
    precip += s.precipMm * w
    weight += w
  }

  if (weight === 0) return { low: 0, mid: 0, high: 0, precipMm: 0 }
  return {
    low: low / weight,
    mid: mid / weight,
    high: high / weight,
    precipMm: precip / weight,
  }
}

/**
 * El viento que arrastra un estrato sobre un punto, en componentes.
 *
 * Se interpola en u/v y NUNCA en grados, que es la regla de toda la aplicación:
 * la media de 350° y 10° es 180°, o sea el viento exactamente contrario al
 * real. Aquí importa el doble, porque entre el nivel bajo y el medio ya hay
 * direcciones opuestas de por sí (ver `LEVEL_HPA` en `model.ts`) y confundir
 * además la interpolación dejaría la escena sin ninguna relación con el aire.
 */
export function windAt(
  samples: readonly SkySample[],
  etage: Etage,
  lon: number,
  lat: number,
): LevelWind {
  let u = 0
  let v = 0
  let weight = 0
  for (const s of samples) {
    const d = haversineKm([lon, lat], [s.lon, s.lat])
    const w = 1 / (d * d + SMOOTH_KM2)
    u += s.wind[etage].u * w
    v += s.wind[etage].v * w
    weight += w
  }
  if (weight === 0) return { u: 0, v: 0 }
  return { u: u / weight, v: v / weight }
}

/**
 * El resumen que enseña el panel: la media de las 70 muestras.
 *
 * Media y no mediana, al revés que en `clouds.ts`. Allí se resumen cuatro
 * columnas y una que se desvíe arrastra la media medio kilómetro; aquí son 70
 * muestras repartidas sobre el rectángulo, y lo que se quiere decir
 * es «cuánta nube hay sobre la isla», que es literalmente un promedio de área.
 * La mediana del 15 de agosto habría dicho 0 % con el norte al 72 %.
 */
export function skyAverage(grid: SkyGrid | null): SkyLocal | null {
  if (!grid || !grid.samples.length) return null
  const n = grid.samples.length
  let low = 0
  let mid = 0
  let high = 0
  let precip = 0
  for (const s of grid.samples) {
    low += s.low
    mid += s.mid
    high += s.high
    precip += s.precipMm
  }
  return { low: low / n, mid: mid / n, high: high / n, precipMm: precip / n }
}

/** Cuántas de las 70 muestras tienen lluvia ahora mismo. Para el panel. */
export function rainingCount(grid: SkyGrid | null): number {
  if (!grid) return 0
  return grid.samples.filter((s) => s.precipMm >= RAIN_MIN_MM).length
}
