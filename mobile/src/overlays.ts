/**
 * Las capas que se superponen al mapa, y que NO son la variable que se está
 * mirando.
 *
 * La diferencia con `layers.ts` es la que hay entre elegir y encender. Los
 * chips de arriba son excluyentes —o se mira la temperatura, o el viento, o el
 * CO₂—, porque son formas distintas de mirar lo mismo. Esto de aquí son cosas
 * que están o no están sobre el mapa, y varias a la vez: la red de guaguas
 * encima de los senderos encima de las carreteras. Por eso son interruptores y
 * viven en su propia hoja, no un chip más en la fila.
 *
 * Es el mismo reparto que la barra lateral de la web, y las etiquetas son
 * literalmente las suyas: `@core/i18n`.
 */

import { t } from '@core/i18n'
import type { PlaceKind } from '@core/lib/places'

export type OverlayId = 'trails' | 'guagua' | 'roads' | 'counters' | 'fire'

export type OverlayVisibility = Record<OverlayId, boolean>

export interface OverlaySwitch {
  id: OverlayId
  label: string
}

/**
 * En el orden de la barra lateral: primero lo que se recorre a pie, luego el
 * transporte, luego la vía, y al final lo que mide la propia isla.
 */
export const OVERLAYS: OverlaySwitch[] = [
  { id: 'trails', label: t.layers.trails },
  { id: 'guagua', label: t.layers.guagua },
  { id: 'roads', label: t.layers.roads },
  { id: 'counters', label: t.layers.counters },
  { id: 'fire', label: t.layers.fire },
]

/**
 * Al arrancar, ninguna: en un teléfono el mapa entra ya con la malla de color y
 * los pins de las estaciones encima, y añadirle de salida senderos, guaguas y
 * carreteras lo convierte en un plano. Las cámaras de incendios son la
 * excepción de la web —van encendidas— y aquí no, porque allí caben en un
 * margen y aquí se comerían la isla.
 */
export const NO_OVERLAYS: OverlayVisibility = {
  trails: false,
  guagua: false,
  roads: false,
  counters: false,
  fire: false,
}

export interface PlaceSwitch {
  kind: PlaceKind
  label: string
}

/** Los seis catálogos de sitios, con el nombre que les da el Cabildo. */
export const PLACE_SWITCHES: PlaceSwitch[] = (
  ['tourism', 'viewpoint', 'culture', 'history', 'recreation', 'water', 'charging'] as const
).map((kind) => ({ kind, label: t.places.kinds[kind] ?? kind }))
