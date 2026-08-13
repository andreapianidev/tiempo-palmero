/**
 * Ejecuta las funciones edge de `api/` durante `npm run dev`, con su cache.
 *
 * ANTES ESTO SOLO CUBRÍA `/api/history`. El resto de `/api/*` se resolvía con
 * un `proxy` de Vite que reescribía la URL y reenviaba al origen, y ese atajo
 * tenía una consecuencia que se pagó el 13 de agosto de 2026: **en desarrollo
 * no había ninguna cache**. En producción las funciones edge concentran todo el
 * tráfico en una petición por ventana (`s-maxage`), y en `npm run dev` cada
 * sondeo, cada recarga y cada remontado del HMR era una petición de verdad al
 * origen. Open-Meteo, que limita por IP, acabó contestando 429 a las tres
 * llamadas de la aplicación a la vez.
 *
 * Así que ahora el desarrollo se parece a producción en las dos cosas que
 * importan: se ejecuta **la misma función** que se despliega —no una reescritura
 * de URL que puede divergir de ella sin que nadie se entere— y se **respeta su
 * `s-maxage`** con una cache en memoria. El error de «funciona en local y no en
 * producción» y el de «me han limitado la IP mientras programaba» se cierran
 * los dos por el mismo sitio.
 *
 * Las funciones edge son `(Request) => Promise<Response>` estándar, así que
 * basta con traducir el `req`/`res` de Node a esos dos objetos.
 */

import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

type EdgeHandler = (req: Request) => Promise<Response>

/**
 * Qué ruta ejecuta qué módulo. Están TODAS: la lista parcial era justamente el
 * problema, porque lo que no estaba aquí se iba por el proxy sin cachear.
 */
const ROUTES: Record<string, () => Promise<{ default: EdgeHandler }>> = {
  '/api/cda': () => import('../api/cda'),
  '/api/co2': () => import('../api/co2'),
  '/api/history': () => import('../api/history'),
  '/api/openmeteo': () => import('../api/openmeteo'),
  '/api/roque': () => import('../api/roque'),
}

interface Entry {
  status: number
  headers: [string, string][]
  body: Buffer
  expires: number
}

/**
 * La cache del CDN, en pequeño.
 *
 * La clave es la URL completa, igual que en el edge de Vercel, y la caducidad
 * sale del `s-maxage` que la propia función se pone: no hay ningún número
 * repetido aquí que pueda quedarse desfasado respecto al de `api/`. Una
 * respuesta `no-store` —las de error— no se guarda, que es exactamente lo que
 * hace producción.
 *
 * Vive en memoria del servidor de desarrollo y se muere con él. No hace falta
 * más: lo que se quería evitar es la ráfaga de una sesión de trabajo, no
 * persistir nada entre sesiones.
 */
const cache = new Map<string, Entry>()

/** Segundos de `s-maxage` de una cabecera `cache-control`, o 0 si no la lleva. */
function maxAge(header: string | null): number {
  const m = /s-maxage=(\d+)/.exec(header ?? '')
  return m ? Number(m[1]) : 0
}

export function edgeApi(): Plugin {
  return {
    name: 'tiempo-palmero-edge-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url ?? ''
        const load = ROUTES[url.split('?')[0]]
        if (!load) return next()

        const send = (e: Entry, hit: boolean) => {
          res.statusCode = e.status
          for (const [k, v] of e.headers) res.setHeader(k, v)
          // Para poder ver desde el navegador que la cache está haciendo su
          // trabajo, que es la mitad del motivo por el que existe.
          res.setHeader('x-dev-cache', hit ? 'HIT' : 'MISS')
          res.end(e.body)
        }

        const cached = cache.get(url)
        if (cached && cached.expires > Date.now()) return send(cached, true)

        try {
          const { default: handler } = await load()
          const response = await handler(
            new Request(`http://localhost${url}`, { method: req.method ?? 'GET' }),
          )
          const entry: Entry = {
            status: response.status,
            headers: [...response.headers].map(([k, v]) => [k, v]),
            body: Buffer.from(await response.arrayBuffer()),
            expires: Date.now() + maxAge(response.headers.get('cache-control')) * 1000,
          }
          if (entry.expires > Date.now()) cache.set(url, entry)
          send(entry, false)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'fallo en la función edge', detail: String(e) }))
        }
      })
    },
  }
}
