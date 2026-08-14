/**
 * De cuándo es la foto que se está mirando.
 *
 * Se pregunta a `api/webcam`, que hace un HEAD contra el origen y devuelve su
 * `Last-Modified` sin traerse la imagen. Desde el navegador no se puede: ni una
 * sola cámara del catálogo manda cabeceras CORS.
 *
 * SOLO CUANDO LA FICHA ESTÁ ABIERTA. El `enabled` no es una optimización de
 * cortesía: son 18 emplazamientos y 27 ángulos, y consultarlos todos al
 * encender la capa serían 27 peticiones a observatorios y ayuntamientos para
 * rellenar una hora que nadie está mirando todavía.
 *
 * Y NO SE REINTENTA. Si el origen no contesta al HEAD, la ficha se queda sin
 * hora y ya está: la imagen carga igual, porque el `<img>` va directo al
 * origen y no depende de esto para nada.
 */

import { useEffect, useState } from 'react'

export interface WebcamAge {
  /** Milisegundos de época del `Last-Modified` del origen, si lo manda. */
  lastModified: number | null
  /** Cuándo lo preguntamos nosotros. Nunca se presenta como hora de la foto. */
  askedAt: number
}

/** Por URL de vista. Ausente = todavía preguntando, o no se pudo preguntar. */
export type WebcamAges = Record<string, WebcamAge>

export function useWebcamAge(urls: string[], enabled: boolean): WebcamAges {
  const [ages, setAges] = useState<WebcamAges>({})
  // Las URL son un array nuevo en cada render; la clave estable es su contenido.
  const key = urls.join('|')

  useEffect(() => {
    if (!enabled || !key) return
    let cancelled = false
    setAges({})

    for (const url of key.split('|')) {
      fetch(`/api/webcam?url=${encodeURIComponent(url)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { lastModified?: string | null } | null) => {
          if (cancelled || !body) return
          const parsed = body.lastModified ? Date.parse(body.lastModified) : NaN
          setAges((prev) => ({
            ...prev,
            [url]: { lastModified: Number.isNaN(parsed) ? null : parsed, askedAt: Date.now() },
          }))
        })
        .catch(() => {
          /* Sin hora. La imagen no se entera. */
        })
    }

    return () => {
      cancelled = true
    }
  }, [key, enabled])

  return ages
}
