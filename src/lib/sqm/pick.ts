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
 * EL LÍMITE DE 12 km ESTÁ MEDIDO sobre las 14 estaciones con lectura reciente
 * del 19 de agosto de 2026: barriendo el recuadro del mapa en una rejilla de
 * 60 × 60, la distancia al fotómetro más cercano tiene mediana de 5,6 km y
 * percentil 90 de 11,9. O sea que 12 km cubren el 90 % del recuadro —incluyendo
 * el mar, que ocupa buena parte— y dejan fuera lo que de verdad está lejos: el
 * peor punto está a 17,4 km, y es agua al suroeste de la isla.
 */

import type { SqmNetwork, SqmStation } from './network'

/** Ver la cabecera: percentil 90 de la distancia al fotómetro más cercano. */
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
