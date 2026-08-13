/**
 * Qué hay elegido en el mapa, si es que hay algo.
 *
 * Una sola unión y no siete estados sueltos: elegir una parada tiene que
 * DESELEGIR la carretera que había debajo, y con siete `useState` eso se cumple
 * el día que se escribe y se rompe la primera vez que alguien añade el octavo.
 * Así el mapa solo puede tener una ficha abierta porque no hay forma de
 * expresar dos.
 */

import type { CounterSite } from '@core/lib/counters/model'
import type { GuaguaStopPoint } from '@core/lib/guagua/network'
import type { PlaceRecord } from '@core/lib/places'
import type { PoiRecord } from '@core/lib/poi'
import type { RoadRecord } from '@core/lib/roads'
import type { FireCamera } from '@core/hooks/useIslandData'

export type Selection =
  | { kind: 'stop'; stop: GuaguaStopPoint }
  | { kind: 'route'; routeId: string }
  | { kind: 'place'; place: PlaceRecord }
  | { kind: 'poi'; poi: PoiRecord }
  | { kind: 'road'; road: RoadRecord; lon: number; lat: number }
  | { kind: 'counter'; site: CounterSite }
  | { kind: 'fire'; camera: FireCamera }
