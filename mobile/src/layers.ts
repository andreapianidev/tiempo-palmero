/**
 * Las capas de la fila de chips, en el orden del prototipo.
 *
 * Tres de ellas son variables interpolables y las otras cuatro son redes de
 * sensores puntuales. La diferencia importa y no es cosmética: las primeras
 * pintan además la malla del mapa, las segundas no se interpolan nunca.
 *
 * Las etiquetas salen de `@core/i18n`, las mismas que la web.
 */

import { t } from '@core/i18n'
import type { DisplayVariable } from '@core/lib/interpolate'
import { VARIABLES, VARIABLE_ORDER, isDisplayVariable } from '@core/lib/variables'

export type LayerId = DisplayVariable | 'wind' | 'air' | 'co2' | 'sky'

export interface LayerChip {
  id: LayerId
  label: string
}

/**
 * Las variables salen del catálogo compartido con su etiqueta corta, así que
 * añadir una en `lib/variables.ts` la hace aparecer aquí sin tocar nada. Las
 * redes puntuales van detrás y sí se listan a mano: no son variables.
 */
export const LAYERS: LayerChip[] = [
  ...VARIABLE_ORDER.map((id) => ({ id: id as LayerId, label: VARIABLES[id].short })),
  { id: 'wind', label: t.variables.wind },
  { id: 'air', label: 'Aire' },
  { id: 'co2', label: 'CO₂' },
  { id: 'sky', label: 'Cielo' },
]

export function isVariable(layer: LayerId): layer is DisplayVariable {
  return isDisplayVariable(layer)
}
