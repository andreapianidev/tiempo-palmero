/**
 * Lectura del PNG de cobertura TDT en el navegador.
 *
 * Aparte de `mask.ts` porque esto toca el DOM —un `<canvas>` y `getImageData`—
 * y aquello es aritmética pura que se puede probar sin navegador. El mismo
 * reparto que hay entre `dem.ts` y `dem-loader.ts`.
 *
 * Se lee EL MISMO fichero que pinta el mapa, no una copia ni un GeoJSON
 * paralelo: la ficha de un punto y la mancha del mapa no pueden discrepar
 * porque son literalmente los mismos píxeles.
 */

import { dataUrl } from '../endpoints'
import type { TdtMask } from './mask'

export async function loadTdtMask(file: string): Promise<TdtMask> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(`cobertura TDT: no se pudo cargar ${file}`))
    el.src = dataUrl(file)
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('sin contexto 2D para la cobertura TDT')
  ctx.drawImage(img, 0, 0)

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  // Solo el alfa: es donde va el número de repetidores, y guardar los cuatro
  // canales serían 1 MB en memoria para tres bits de información.
  const alpha = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]

  return { width: canvas.width, height: canvas.height, alpha }
}
