/**
 * El service worker: lo que hace que Tiempo Palmero se pueda instalar y abrir
 * sin cobertura.
 *
 * NO SE EMPAQUETA CON LA APLICACIÓN. Lo compila `dev/swBuild.ts` en un fichero
 * suyo, `/sw.js`, porque un service worker tiene que vivir en la raíz para
 * poder gobernar todo el sitio y no puede llevar el hash en el nombre: la URL
 * es su identidad, y el navegador compara byte a byte para decidir si hay una
 * versión nueva.
 *
 * QUÉ SE GUARDA Y POR QUÉ, en dos cajones que se tratan distinto:
 *
 *   `shell-<build>`  la aplicación: el HTML y los ficheros con hash de Vite.
 *                    Se llena de golpe al instalar y se tira entera con cada
 *                    despliegue, porque cada despliegue la renombra.
 *   `datos`          el DEM, los topónimos, la red de guaguas, los iconos. NO
 *                    se tira al desplegar: son 2,3 MB de teselas de relieve que
 *                    no han cambiado, y volver a bajarlas en cada despliegue
 *                    sería castigar al que actualiza.
 *
 * Lo que decide qué es cada cosa está en `policy.ts`, que se prueba en Node.
 */

import { routeFor } from './policy'

/** Los pone `dev/swBuild.ts` al compilar: la lista de la aplicación y su sello. */
declare const __BUILD__: string
declare const __PRECACHE__: string[]

const SHELL = `shell-${__BUILD__}`
const DATA = 'datos'

/**
 * El tipo mínimo del ámbito de un service worker.
 *
 * Se escribe a mano porque la alternativa era meter la biblioteca `WebWorker`
 * en el `tsconfig.json` del proyecto entero, y ésa choca con `DOM` —las dos
 * declaran `self`, `fetch` y media docena más— y rompería la comprobación de
 * tipos de toda la aplicación para tipar un fichero.
 */
interface Extendable {
  waitUntil(p: Promise<unknown>): void
}
interface FetchLike extends Extendable {
  request: Request
  respondWith(r: Response | Promise<Response>): void
}
interface Scope {
  addEventListener(type: 'install' | 'activate', fn: (e: Extendable) => void): void
  addEventListener(type: 'fetch', fn: (e: FetchLike) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  location: { origin: string }
  caches: CacheStorage
}

const scope = globalThis as unknown as Scope

scope.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await scope.caches.open(SHELL)
      // Una a una y sin abortar: `addAll` tira la instalación entera si falla
      // un solo fichero, y aquí un icono que no esté no puede dejar sin
      // instalar la aplicación.
      await Promise.all(
        __PRECACHE__.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'reload' })
            if (res.ok) await cache.put(url, res)
          } catch {
            /* sin red al instalar: ya se llenará navegando */
          }
        }),
      )
      await scope.skipWaiting()
    })(),
  )
})

scope.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Fuera las aplicaciones de despliegues anteriores. `datos` no se toca.
      const names = await scope.caches.keys()
      await Promise.all(
        names.filter((n) => n.startsWith('shell-') && n !== SHELL).map((n) => scope.caches.delete(n)),
      )
      await scope.clients.claim()
    })(),
  )
})

scope.addEventListener('fetch', (event) => {
  const { request } = event
  const route = routeFor(request.url, scope.location.origin, request.mode, request.method)
  if (route === 'passthrough') return

  if (route === 'shell') {
    event.respondWith(shell(request))
    return
  }
  if (route === 'immutable') {
    event.respondWith(cacheFirst(request))
    return
  }
  if (route === 'fresh') {
    event.respondWith(networkFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(event, request))
})

/** ¿Se puede guardar? Una respuesta parcial o de error, no. */
function storable(res: Response): boolean {
  return res.ok && res.status === 200 && res.type === 'basic'
}

async function put(cache: string, request: Request, res: Response): Promise<void> {
  if (!storable(res)) return
  const box = await scope.caches.open(cache)
  await box.put(request, res.clone())
}

/**
 * La navegación va a la red primero, y no al revés.
 *
 * Al revés la aplicación se abriría antes, pero el despliegue de hoy no se
 * vería hasta el segundo arranque, y este proyecto despliega varias veces al
 * día. Sin red —modo avión en una pista de Garafía, que es el caso de uso de
 * verdad— entra la copia guardada, que es la razón de todo esto.
 */
async function shell(request: Request): Promise<Response> {
  try {
    const res = await fetch(request)
    await put(SHELL, request, res)
    return res
  } catch {
    const hit = (await scope.caches.match(request)) ?? (await scope.caches.match('/'))
    if (hit) return hit
    throw new Error('sin red y sin copia de la aplicación')
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const hit = await scope.caches.match(request)
  if (hit) return hit
  const res = await fetch(request)
  await put(DATA, request, res)
  return res
}

async function networkFirst(request: Request): Promise<Response> {
  try {
    const res = await fetch(request)
    await put(DATA, request, res)
    return res
  } catch {
    const hit = await scope.caches.match(request)
    if (hit) return hit
    throw new Error('sin red y sin copia')
  }
}

/** Se sirve lo guardado y se pide la versión nueva por detrás, para la próxima. */
function staleWhileRevalidate(event: FetchLike, request: Request): Promise<Response> {
  return scope.caches.match(request).then((hit) => {
    const fresh = fetch(request).then(async (res) => {
      await put(DATA, request, res)
      return res
    })
    if (hit) {
      event.waitUntil(fresh.catch(() => undefined))
      return hit
    }
    return fresh
  })
}
