/**
 * El mapa de la Vía Láctea: descargarlo una vez y decir si está.
 *
 * VA APARTE DE `useNightSky` porque es otra descarga y otra casilla, igual que
 * los planetas. Son 50 KB de PNG y solo los paga quien la enciende.
 *
 * SE PIDE UNA VEZ Y SE QUEDA. El mapa no cambia nunca —lo genera
 * `prepare-vialactea.ts` en tiempo de compilación—, así que apagar y encender
 * no vuelve a descargarlo.
 *
 * FALLA EN ABIERTO: sin mapa no hay Vía Láctea y el panel dice por qué; el
 * resto de la escena nocturna sigue entera.
 *
 * EL MISMO MECANISMO DE «SE INTENTA UNA VEZ» QUE LOS PLANETAS, y por el mismo
 * motivo escrito en `useNightSky.ts`: con `loading` en las dependencias del
 * efecto que lo pone, la limpieza del propio render mata la descarga y el panel
 * se queda diciendo «Descargando…» para siempre con la red devolviendo 200. Le
 * pasó al catálogo de estrellas en producción.
 *
 * `createImageBitmap` Y NO UN `Image`, porque decodifica fuera del hilo
 * principal: son 1440 × 720 píxeles, y descodificarlos en medio de un
 * fotograma se nota. Donde no exista —Safari viejo—, se cae al `Image` de toda
 * la vida en vez de quedarse sin Vía Láctea.
 */

import { useEffect, useRef, useState } from 'react'
import { dataUrl } from '../lib/endpoints'

export interface MilkyWayState {
  loading: boolean
  /** Motivo por el que no hay mapa, si no lo hay. */
  failed: string | null
  /** El bitmap listo para subir a la GPU. `null` mientras no ha llegado. */
  map: ImageBitmap | HTMLImageElement | null
}

async function fetchMilkyWayMap(): Promise<ImageBitmap | HTMLImageElement> {
  const url = dataUrl('/cielo/vialactea.png')
  if (typeof createImageBitmap === 'function') {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`vialactea.png: HTTP ${res.status}`)
    return createImageBitmap(await res.blob())
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('vialactea.png no se pudo decodificar'))
    img.src = url
  })
}

export function useMilkyWay(enabled: boolean): MilkyWayState {
  const [map, setMap] = useState<ImageBitmap | HTMLImageElement | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const attempted = useRef(false)
  useEffect(() => {
    if (!enabled) {
      attempted.current = false
      return
    }
    if (attempted.current || map) return
    attempted.current = true
    let alive = true
    setLoading(true)
    fetchMilkyWayMap()
      .then((image) => {
        if (!alive) return
        setMap(image)
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setFailed(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enabled, map])

  return { loading, failed, map }
}
