/**
 * Ejecuta las funciones edge de `api/` durante `npm run dev`.
 *
 * El resto de `/api/*` se resuelve en desarrollo con un `proxy` de Vite que
 * reescribe la URL y reenvía al Cabildo. Con `/api/history` eso no vale: ese
 * endpoint no reenvía, AGREGA —de 2 MB de CDA saca 260 KB— y sin ejecutarlo la
 * gráfica solo funcionaría en producción, que es la peor forma de descubrir un
 * fallo.
 *
 * Las funciones edge son `(Request) => Promise<Response>` estándar, así que
 * basta con traducir el `req`/`res` de Node a esos dos objetos.
 */

import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

type EdgeHandler = (req: Request) => Promise<Response>

/** Qué ruta ejecuta qué módulo. Solo las que agregan; las que reenvían, no. */
const ROUTES: Record<string, () => Promise<{ default: EdgeHandler }>> = {
  '/api/history': () => import('../api/history'),
}

export function edgeApi(): Plugin {
  return {
    name: 'tiempo-palmero-edge-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? '').split('?')[0]
        const load = ROUTES[path]
        if (!load) return next()

        try {
          const { default: handler } = await load()
          const url = `http://localhost${req.url ?? ''}`
          const response = await handler(new Request(url, { method: req.method ?? 'GET' }))
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: 'fallo en la función edge', detail: String(e) }))
        }
      })
    },
  }
}
