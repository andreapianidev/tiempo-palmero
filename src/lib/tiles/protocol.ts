/**
 * El enganche con MapLibre: teselas servidas desde la caché.
 *
 * ESTE ES EL ÚNICO FICHERO DE `tiles/` QUE IMPORTA `maplibre-gl`, y no es
 * casualidad. `mapStyle.ts` lo comparte el escritorio de UE5, que corre el
 * núcleo dentro de QuickJS y no tiene la librería; `mapStyle.portable.test.ts`
 * comprueba que nada de esa cadena la arrastre. Por eso el protocolo se registra
 * desde `MapView`, que es solo de la web, y los otros cuatro ficheros de este
 * directorio —rejilla, claves, presupuesto, almacén— no la mencionan.
 *
 * CÓMO ENCAJA. `addProtocol('palmero', ...)` intercepta cualquier URL que
 * empiece por `palmero://`; `key.ts` le pone ese prefijo a las plantillas de
 * GRAFCAN al añadir la fuente al mapa. MapLibre sustituye `{bbox-epsg-3857}`
 * antes de llamarnos, así que aquí llega la URL final y completa, que es
 * exactamente la clave con la que se guarda.
 *
 * SE DEVUELVE UN `ImageBitmap`, NO EL ArrayBuffer. Si se le devuelve el búfer,
 * MapLibre lo envuelve en `new Blob([...], { type: 'image/png' })` —el tipo está
 * escrito a fuego en su código— y se lo pasa a `createImageBitmap`. Con JPEG
 * eso funciona porque los navegadores olfatean los bytes y no se creen la
 * etiqueta, pero es depender de que la sigan olfateando. Decodificando aquí, con
 * el `content-type` real de la respuesta, no hay nada que adivinar: MapLibre
 * comprueba `instanceof ImageBitmap` y lo usa tal cual.
 */

import maplibregl from 'maplibre-gl'
import { fetchTileOnce, raceAbort } from './inflight'
import { TILE_PROTOCOL, cacheKey, plainUrl } from './key'
import { readTile, writeTile } from './store'

let registered = false

/**
 * Registra el protocolo. Es idempotente y global a la página: MapLibre guarda
 * los protocolos en un objeto suyo, así que registrarlo dos veces —dos montajes
 * de `MapView` en desarrollo, por ejemplo— pisaría el anterior sin avisar.
 */
export function registerTileCache(): void {
  if (registered) return
  registered = true
  maplibregl.addProtocol(TILE_PROTOCOL, async (params, abort) => {
    const url = plainUrl(params.url)
    const key = cacheKey(url)
    const now = Date.now()

    const hit = await readTile(key, now)
    if (hit) return { data: await decode(hit.body, hit.type) }

    // `fetchTileOnce` y no `fetch`: el precargador puede estar bajando esta
    // misma tesela ahora mismo, y sin esto salían las dos. Ver `inflight.ts`.
    const { body, type } = await raceAbort(fetchTileOnce(key, url), abort.signal)

    // Guardar es lo último y no se espera: la tesela ya se puede pintar, y que
    // IndexedDB tarde 3 ms o falle por cuota no tiene por qué retrasarla.
    void writeTile(key, body, type, now)
    return { data: await decode(body, type) }
  })
}

/**
 * Bytes a imagen, con el tipo que dijo el servidor.
 *
 * El mismo `ArrayBuffer` va a la vez a este `Blob` y a IndexedDB, y eso es
 * seguro: construir un `Blob` copia los bytes y `put()` los clona
 * estructuradamente, así que ninguno de los dos se queda con el búfer ni lo
 * desacopla. No hace falta el `slice()` defensivo — que a 230 kB por tesela
 * sería una copia de más por cada una.
 */
async function decode(body: ArrayBuffer, type: string): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([body], { type }))
}
