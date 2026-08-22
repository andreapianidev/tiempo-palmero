/**
 * Qué hace el service worker con cada petición.
 *
 * VA APARTE DEL SERVICE WORKER A PROPÓSITO. Un service worker solo se puede
 * ejecutar dentro de un navegador y con un despliegue delante; una función que
 * mira una URL y devuelve una palabra se prueba en Node en un milisegundo. Todo
 * lo que decide está aquí, y `sw.ts` solo obedece —por eso `policy.test.ts`
 * puede blindar la regla que de verdad importa, que es la primera—.
 *
 * LA REGLA QUE IMPORTA: `/api/` NO SE CACHEA NUNCA. Detrás de esas rutas están
 * las estaciones del Cabildo, y una temperatura de hace dos horas enseñada como
 * si fuera la de ahora no es una aplicación más lenta, es una aplicación que
 * miente. La caché que hay delante de esos datos es la del CDN, con el
 * `s-maxage` que se pone cada función de `api/`, y esa sí sabe cuánto dura cada
 * cosa. Aquí no se duplica.
 */

export type Route =
  /** No la tocamos: se resuelve como si no hubiera service worker. */
  | 'passthrough'
  /** Navegación: red primero, y si no hay red, la aplicación guardada. */
  | 'shell'
  /** No puede cambiar sin cambiar de URL: caché primero, y ya está. */
  | 'immutable'
  /** Red primero y caché de respaldo: son los ficheros que dicen qué versión hay. */
  | 'fresh'
  /** Caché primero y refresco por detrás, para la siguiente vez. */
  | 'data'

/**
 * Ficheros del manifiesto y de la pestaña: cambian, pero no de nombre.
 *
 * La lista se exporta porque `dev/swBuild.ts` la necesita para precargarlos al
 * instalar. Tenerla dos veces sería tener dos verdades sobre qué es la
 * aplicación.
 */
export const BRANDING = [
  '/manifest.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]
const IS_BRANDING = new Set(BRANDING)

/**
 * Los que apuntan a la versión de un conjunto de datos. Si se sirven de la
 * caché, el resto del conjunto no se entera nunca de que ha cambiado.
 */
const POINTERS = new Set([
  '/dem/manifest.json',
  '/ocean/manifest.json',
  '/cielo/manifest.json',
  '/layers/index.json',
])

/** Datos generados que se piden enteros y cambian de tarde en tarde. */
// `/cielo/` entra aquí y no en los punteros: el catálogo de estrellas se
// regenera con `npm run prepare-cielo` y su manifiesto sí es puntero, pero los
// binarios pesan 107 KB y se piden enteros una sola vez. Cachearlos es la
// diferencia entre una escena que aparece al instante y una que se descarga
// otra vez cada noche.
const DATA_PREFIXES = ['/dem/', '/ocean/', '/cielo/', '/fire/']
const DATA_FILES = new Set(['/gazetteer.json', '/guagua-red.json'])

export function routeFor(url: string, origin: string, mode: string, method = 'GET'): Route {
  // Solo GET. Un POST cacheado sería otra clase de error.
  if (method !== 'GET') return 'passthrough'

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'passthrough'
  }

  // Las teselas de GRAFCAN, las tipografías de Google y todo lo que no es
  // nuestro se dejan pasar. Las teselas ya tienen su propia caché, en
  // IndexedDB y con presupuesto —ver `src/lib/tiles/`—: meterlas también aquí
  // sería guardar los mismos 230 kB por tesela dos veces.
  if (parsed.origin !== origin) return 'passthrough'

  if (mode === 'navigate') return 'shell'

  const path = parsed.pathname

  if (path.startsWith('/api/')) return 'passthrough'

  // Vite les pone el hash del contenido en el nombre: si el fichero cambia,
  // cambia la URL. Es el único caso en el que la caché no puede quedarse vieja.
  if (path.startsWith('/assets/')) return 'immutable'

  if (POINTERS.has(path)) return 'fresh'

  // Las teselas del DEM llevan `?v=` con la fecha del modelo, así que también
  // cambian de URL al cambiar el modelo. Ver `demTilePath` en `src/lib/dem.ts`.
  if (path.startsWith('/dem/') && parsed.searchParams.has('v')) return 'immutable'

  if (IS_BRANDING.has(path)) return 'data'
  if (DATA_FILES.has(path)) return 'data'
  if (DATA_PREFIXES.some((p) => path.startsWith(p))) return 'data'

  // `/layers/` SÍ entra, desde el 22 de agosto de 2026, y hasta ese día no
  // entraba. El argumento de entonces era que esas capas «se piden solo al
  // encender su interruptor» y que «casi nadie las enciende», así que guardarlas
  // sería gastar cuota por si acaso. Las dos mitades eran falsas, cada una a su
  // manera:
  //
  //  - Cuatro de esos ficheros NUNCA dependieron de ningún interruptor: los
  //    municipios (2.431 kB), el límite insular (1.638 kB), los senderos (1.595
  //    kB) y sus puntos (271 kB) los pide `useIslandData` en cada arranque. Eran
  //    900 kB comprimidos por visita que se volvían a bajar siempre.
  //  - Y desde hoy la primera visita trae las doce capas encendidas (ver
  //    `INITIAL_LAYERS` en `App.tsx`), así que las carreteras, las guaguas y el
  //    viario de OSM tampoco son «lo que casi nadie enciende»: son lo que
  //    descarga todo el mundo.
  //
  // Se guarda lo que se pide, no el directorio entero: los 16 MB del catálogo
  // solo se materializan en disco si alguien enciende de verdad todas las capas
  // de sitios, y para entonces las ha usado.
  //
  // La cabecera de `vercel.json` —`stale-while-revalidate` de 30 días— sigue
  // valiendo y no sobra: es la que gobierna la revalidación. Esto es lo que
  // hace que la isla se abra sin cobertura, que es de lo que va este fichero.
  if (path.startsWith('/layers/')) return 'data'

  return 'passthrough'
}
