/**
 * El mosaico de 3 × 3 teselas del modelo que necesita cada tesela de relieve.
 *
 * Se arma en un lienzo 2D y se sube a la GPU de una vez, en lugar de subir
 * nueve texturas: una lectura de textura por muestra es lo que hace que el
 * shader pueda leer 4 × 4 vecinos sin preguntarse en qué tesela cae cada uno.
 *
 * Lo que falta —el borde de la cobertura, donde la vecina no existe— se queda
 * con el color del mar. En terrarium el nivel del mar es exactamente
 * `rgb(128, 0, 0)`: 128 · 256 + 0 + 0/256 − 32768 = 0 m. Rellenar con negro
 * daría −32768 m y el shader dibujaría un acantilado imaginario en el borde de
 * la isla.
 */

import type { DemManifest } from '../dem'
import { hasTile } from './coverage'
import { demBitmap } from './tiles'

/** Cuántas teselas de margen. Una basta: el shader no mira más allá de 11 px. */
export const APRON = 1

/** El nivel del mar en terrarium, como color de relleno. */
export const SEA_FILL = 'rgb(128, 0, 0)'

type Canvas2D = OffscreenCanvas | HTMLCanvasElement

let canvas: Canvas2D | null = null

function surface(size: number): Canvas2D | null {
  if (!canvas) {
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(size, size)
    else if (typeof document !== 'undefined') canvas = document.createElement('canvas')
    else return null
  }
  canvas.width = size
  canvas.height = size
  return canvas
}

/**
 * El mosaico centrado en (z, x, y). `null` si la tesela central no existe —
 * ahí no hay relieve que dibujar y quien llama devuelve una tesela vacía.
 *
 * El lienzo se REUTILIZA entre llamadas, así que hay que usarlo antes de pedir
 * el siguiente. Es un solo consumidor —`protocol.ts`, que sube la textura acto
 * seguido— y a cambio no se asigna un búfer de 2,3 MB por tesela.
 */
export async function demMosaic(
  manifest: DemManifest,
  z: number,
  x: number,
  y: number,
): Promise<Canvas2D | null> {
  if (!hasTile(manifest, z, x, y)) return null

  const size = manifest.tileSize
  const span = 1 + 2 * APRON
  const board = surface(size * span)
  const ctx = board?.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
  if (!board || !ctx) return null

  ctx.fillStyle = SEA_FILL
  ctx.fillRect(0, 0, board.width, board.height)

  const wanted: { bitmap: Promise<ImageBitmap | null>; dx: number; dy: number }[] = []
  for (let j = -APRON; j <= APRON; j++) {
    for (let i = -APRON; i <= APRON; i++) {
      if (!hasTile(manifest, z, x + i, y + j)) continue
      wanted.push({
        bitmap: demBitmap(z, x + i, y + j),
        dx: (i + APRON) * size,
        dy: (j + APRON) * size,
      })
    }
  }

  for (const { bitmap, dx, dy } of await Promise.all(
    wanted.map(async (w) => ({ ...w, bitmap: await w.bitmap })),
  )) {
    if (bitmap) ctx.drawImage(bitmap, dx, dy)
  }

  return board
}
