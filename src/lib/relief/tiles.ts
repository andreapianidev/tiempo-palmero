/**
 * Las teselas del modelo de elevación, en memoria y ya decodificadas.
 *
 * Para sombrear una tesela hacen falta ella y sus ocho vecinas: sin el borde de
 * al lado, la pendiente del píxel del margen se calcula contra la nada y
 * aparece una costura de un píxel en cada junta —una rejilla sobre la isla—.
 *
 * Nueve lecturas por tesela suena a nueve veces el trabajo, y no lo es: la
 * vecina de una es la central de la siguiente. Con esta caché cada tesela se
 * descarga y se decodifica UNA vez y la usan las nueve que la tocan. Sin ella,
 * la misma tesela se decodificaría nueve veces.
 *
 * El tope son 96 teselas. A 256 × 256 en RGBA son 256 kB cada una, o sea unos
 * 24 MB en el peor caso — y el peor caso no se da, porque la isla entera a z12
 * son 63. Está puesto para el caso raro de moverse rápido por varios niveles a
 * la vez, no para la vista normal.
 */

import { dataUrl } from '../endpoints'

const LIMIT = 96

/** Clave → imagen. `null` significa «se pidió y no está», y también se recuerda. */
const cache = new Map<string, Promise<ImageBitmap | null>>()

const key = (z: number, x: number, y: number) => `${z}/${x}/${y}`

export function demBitmap(z: number, x: number, y: number): Promise<ImageBitmap | null> {
  const k = key(z, x, y)
  const hit = cache.get(k)
  if (hit) {
    // Volver a insertarla la pone al final: el orden del Map es el de uso.
    cache.delete(k)
    cache.set(k, hit)
    return hit
  }

  const pending = fetchBitmap(`/dem/${z}/${x}/${y}.png`)
  cache.set(k, pending)
  while (cache.size > LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    const dropped = cache.get(oldest.value)
    cache.delete(oldest.value)
    // Cerrar el ImageBitmap libera su memoria de verdad; dejarlo al recolector
    // de basura tarda, y son 256 kB cada uno.
    void dropped?.then((b) => b?.close())
  }
  return pending
}

async function fetchBitmap(path: string): Promise<ImageBitmap | null> {
  try {
    const res = await fetch(dataUrl(path))
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

/** Solo para los tests: deja la caché como recién arrancada. */
export function resetDemCache(): void {
  cache.clear()
}
