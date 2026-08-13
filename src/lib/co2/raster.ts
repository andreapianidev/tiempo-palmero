/**
 * La mancha de CO₂, en píxeles.
 *
 * El cómo está en `masked-field.ts`, compartido con la cobertura móvil: los
 * dos son campos que solo existen donde alguien midió y que no se pueden
 * promediar. Aquí quedan las dos cifras que son de ESTE campo y de ningún otro.
 *
 * NO usa el retículo del DEM como la malla higrotérmica, y no es un descuido.
 * La malla de la isla va a 200 m por celda, que sobre la zona vigilada
 * —1,5 km de punta a punta— daría siete celdas: una zonificación de colores
 * más gruesa que las propias calles de Puerto Naos. Aquí la celda es de 15 m,
 * la misma escala a la que está puesta la red.
 */

import { rasterizeMasked, type MaskedRaster } from '../masked-field'
import type { Co2Field } from './field'

export type Co2Raster = MaskedRaster

/** Celda por defecto, en metros. La separación mediana de la red es 15 m. */
export const CO2_CELL_M = 15

export function rasterizeCo2(
  field: Co2Field,
  opts: { opacity?: number } = {},
): Co2Raster {
  return rasterizeMasked(field.field, opts)
}
