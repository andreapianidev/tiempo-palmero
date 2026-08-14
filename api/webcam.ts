/**
 * Cuándo se tomó la foto de una webcam. Solo la fecha: la imagen no pasa por aquí.
 *
 * POR QUÉ EXISTE. La ficha de una cámara tiene que decir de cuándo es lo que se
 * está viendo, y el navegador no puede averiguarlo: **ninguna de las cámaras
 * del catálogo manda cabeceras CORS** (comprobado el 14 ago 2026, host por
 * host), así que desde el cliente un `fetch` no llega y de un `<img>` no se
 * pueden leer las cabeceras de la respuesta. El servidor sí las lee.
 *
 * POR QUÉ NO REENVÍA LA IMAGEN. Porque no hace falta y saldría caro. Las
 * panorámicas del Cabildo son JPEG de 2688×1520, entre 400 KB y 1,2 MB: pasarlas
 * por una función de borde sería pagar ese tráfico dos veces —entrada y salida—
 * por cada visitante y por cada recarga, para entregar exactamente los mismos
 * bytes que el navegador puede pedirle al origen él solo. La etiqueta `<img>`
 * carga directa; aquí solo viaja una fecha.
 *
 * QUÉ DEVUELVE, Y CUÁNDO NULL. `lastModified` es la cabecera del origen, en
 * ISO. Las del Cabildo **no la mandan** —su nginx sirve con `no-store` y sin
 * `Last-Modified`— y entonces esto contesta `null` en vez de inventarse una
 * hora. Esa distinción es justo el punto: donde no hay sello, la ficha lo dice
 * y remite al reloj impreso dentro de la propia imagen, que en las del Cabildo
 * es el único que hay. Ver `stampedClock` en el catálogo.
 *
 * NO ES UN PROXY ABIERTO. Solo se acepta un host de `WEBCAM_HOSTS`, que se
 * deriva del propio catálogo; mismo criterio que la lista `ALLOWED` de
 * `api/cda.ts`. Sin eso esto sería un escáner de puertos con dominio propio.
 */

import { WEBCAM_HOSTS } from '../src/lib/webcams/catalog'

export const config = { runtime: 'edge' }

/**
 * Un minuto. La cámara más rápida del catálogo publica cada pocos minutos, así
 * que cachear la respuesta 60 s no envejece nada perceptiblemente y evita que
 * abrir la misma ficha diez veces sean diez peticiones al observatorio.
 */
const TTL_SECONDS = 60

function json(body: unknown, status: number, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds
        ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`
        : 'no-store',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get('url')
  if (!raw) return json({ error: 'falta el parámetro url' }, 400)

  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return json({ error: 'url mal formado' }, 400)
  }
  if (target.protocol !== 'https:') return json({ error: 'solo https' }, 400)
  if (!WEBCAM_HOSTS.includes(target.host)) return json({ error: 'host no permitido' }, 400)

  // HEAD primero. Si el origen no lo implementa —pasa, y devuelve 405 o 501—,
  // se pide UN byte con `Range` en vez de la imagen entera: basta para que el
  // servidor conteste con sus cabeceras.
  for (const attempt of ['HEAD', 'RANGE'] as const) {
    try {
      const res = await fetch(target.toString(), {
        method: attempt === 'HEAD' ? 'HEAD' : 'GET',
        headers: attempt === 'RANGE' ? { range: 'bytes=0-0' } : undefined,
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok && res.status !== 206) {
        if (attempt === 'HEAD') continue
        return json({ error: `origen HTTP ${res.status}`, reachable: false }, 200, TTL_SECONDS)
      }
      const header = res.headers.get('last-modified')
      const parsed = header ? Date.parse(header) : NaN
      return json(
        {
          reachable: true,
          lastModified: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
        },
        200,
        TTL_SECONDS,
      )
    } catch {
      // Al siguiente intento; si era el último, se cae al return de abajo.
    }
  }

  // Que no se pueda preguntar la edad NO significa que la imagen no cargue: el
  // `<img>` va por su cuenta al origen. Por eso esto es un 200 con
  // `reachable: false` y no un error — la ficha se dibuja igual, sin la hora.
  return json({ reachable: false, lastModified: null }, 200, TTL_SECONDS)
}
