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

export type LayerId = DisplayVariable | 'wind' | 'air' | 'co2' | 'sky'

export interface LayerChip {
  id: LayerId
  label: string
}

/** Etiquetas cortas: en 393 px de ancho no cabe «Calidad del aire» entero. */
export const LAYERS: LayerChip[] = [
  { id: 'temperature', label: t.variables.temperature },
  { id: 'relativehumidity', label: 'Humedad' },
  { id: 'dewpoint', label: 'Rocío' },
  { id: 'wind', label: t.variables.wind },
  { id: 'air', label: 'Aire' },
  { id: 'co2', label: 'CO₂' },
  { id: 'sky', label: 'Cielo' },
]

const VARIABLES: readonly LayerId[] = ['temperature', 'relativehumidity', 'dewpoint']

export function isVariable(layer: LayerId): layer is DisplayVariable {
  return VARIABLES.includes(layer)
}
