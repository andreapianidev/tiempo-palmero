/**
 * Qué fotómetro habla por un punto de la isla — y cuándo ninguno.
 *
 * NO SE INTERPOLA, Y ES LA DECISIÓN DE ESTE FICHERO. El resto de la aplicación
 * interpola temperatura y humedad sobre toda la isla porque son campos
 * continuos que el relieve gobierna. El brillo del cielo no lo es: lo gobiernan
 * las farolas de abajo, y el 19 de agosto de 2026 la red medía 21,13 en el
 * Roque y 16,19 en un colegio de Los Llanos, a 12 km. Un campo interpolado
 * entre esos dos puntos pondría 18,7 en mitad de la Caldera de Taburiente, donde
 * no hay ni una luz y el cielo real es tan oscuro como el del Roque. La
 * discontinuidad ES el fenómeno.
 *
 * Así que se coge la estación más cercana, se dice cuál es y a qué distancia, y
 * si no hay ninguna cerca se dice que no la hay y se pasa al modelo. El panel
 * enseña siempre cuál de los dos casos está viendo, igual que hace la escena
 * atmosférica con la cota de la capa baja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL LÍMITE DE 12 km, MEDIDO — y por qué la justificación anterior era la
 * pregunta equivocada.
 *
 * Aquí ponía que 12 km cubren el 90 % del recuadro del mapa, con mediana de
 * 5,6 km y percentil 90 de 11,9 barriendo una rejilla de 60 × 60. Repetida hoy
 * con las 14 estaciones que publican de noche, esa cuenta da **7,2 de mediana,
 * 15,2 de percentil 90 y un 78,6 % de cobertura**. Pero el problema no es que
 * las cifras hayan envejecido: es que cubrir un recuadro no dice nada. El
 * recuadro es medio océano, y a nadie le importa el cielo sobre el agua.
 *
 * LA PREGUNTA BUENA es a partir de qué distancia un fotómetro deja de predecir
 * a otro, y eso se mide con parejas de lecturas SIMULTÁNEAS de noche cerrada y
 * sin luna. Sobre la lunación del 21 de julio al 19 de agosto de 2026, 14 016
 * parejas de 30 887 lecturas (`scripts/checks/sqm-archivo.ts`):
 *
 * | Distancia | Parejas | |Δ| mediana |
 * |---|---:|---:|
 * | 0–1 km | 516 | **0,60** ← dos aparatos en el mismo sitio |
 * | 2–4 km | 762 | 0,22 |
 * | 6–8 km | 1195 | 0,16 |
 * | 8–10 km | 1520 | 0,71 |
 * | 10–12 km | 185 | 0,26 |
 * | **12–15 km** | 2105 | **1,13** |
 * | 15–20 km | 2414 | 1,14 |
 * | 20–40 km | 3762 | 0,90 |
 *
 * Hay un escalón, y cae justo en 12. Por debajo, un fotómetro predice a otro
 * tan bien o mejor que dos aparatos plantados en el mismo sitio —que ya
 * discrepan 0,60 mag, que es el suelo de ruido de esta red—. A partir de 12 km
 * la discrepancia se dobla y ya no cambia con la distancia: eso es haber dejado
 * de predecir.
 *
 * QUÉ CUESTA. Sobre un cielo de 21,1, un error de 0,16 mag son un 10 % de
 * estrellas de menos; 0,71 mag, un 37 %; y 1,13 mag, un **54 %** —de 6076
 * estrellas a 2783—. Pasar de 12 km no es afinar un decimal: es borrar la mitad
 * del cielo y presentarlo como medido.
 */

import type { SqmNetwork, SqmStation } from './network'

/**
 * Ver la cabecera: es donde la discrepancia entre dos fotómetros simultáneos se
 * dobla, de 0,26-0,71 mag por debajo a 1,13 por encima.
 */
export const MAX_STATION_DISTANCE_KM = 12

/** Distancia en km sobre la esfera, aproximación plana. A esta escala sobra. */
export function distanceKm(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): number {
  const midLat = ((lat1 + lat2) / 2) * (Math.PI / 180)
  return Math.hypot(
    (lon1 - lon2) * Math.cos(midLat) * 111.32,
    (lat1 - lat2) * 110.57,
  )
}

export interface SqmPick {
  station: SqmStation
  distanceKm: number
}

/**
 * La estación utilizable más cercana a un punto, o `null` si la más cercana
 * está más lejos del límite.
 *
 * Devolver `null` no es un fallo: es la respuesta correcta cuando nadie está
 * midiendo el cielo de ese sitio, y quien llama tiene que caer al modelo y
 * decirlo.
 */
export function pickStation(
  network: SqmNetwork,
  lon: number,
  lat: number,
  maxKm = MAX_STATION_DISTANCE_KM,
): SqmPick | null {
  let best: SqmPick | null = null
  for (const station of network.usable) {
    const d = distanceKm(lon, lat, station.lon, station.lat)
    if (d <= maxKm && (best === null || d < best.distanceKm)) {
      best = { station, distanceKm: d }
    }
  }
  return best
}
