/**
 * Montaje de los dos sombreadores según el nivel de calidad.
 *
 * Las opciones van como `#define` y no como uniforms a propósito. Un `if`
 * dentro del sombreador de fragmentos LO PAGAN TODOS LOS PÍXELES aunque la
 * respuesta sea siempre que no: la GPU ejecuta las dos ramas y descarta una. Un
 * `#define` no está: el código de la refracción, con su copia de pantalla y sus
 * cáusticas, sencillamente no existe en el programa de calidad ligera.
 *
 * El precio es que cambiar de calidad recompila. Son unos milisegundos y pasa
 * cuando alguien toca un botón, no en cada fotograma.
 */

import { QUALITY, type OceanQuality } from '../../../lib/ocean/quality'
import { FRAGMENT_SHADER } from './fragment'
import { VERTEX_SHADER } from './vertex'

export interface ShaderPair {
  vertex: string
  fragment: string
  /** Identifica la variante: si no cambia, no hace falta recompilar. */
  key: string
}

export function shadersFor(quality: OceanQuality): ShaderPair {
  const q = QUALITY[quality]
  const defines = [
    `#define OCTAVES ${q.octaves}`,
    q.refraction ? '#define REFRACT' : '',
    q.spindrift ? '#define SPINDRIFT' : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    // Los `#define` van los primeros del todo: en GLSL, antes de la primera
    // declaración y antes de cualquier `precision`.
    vertex: `${defines}\n${VERTEX_SHADER}`,
    fragment: `${defines}\n${FRAGMENT_SHADER}`,
    key: `${q.octaves}-${q.refraction ? 'r' : ''}${q.spindrift ? 's' : ''}`,
  }
}
