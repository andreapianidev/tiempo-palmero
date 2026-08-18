/**
 * Cómo se le dice a MapLibre que una tesela pase por la caché.
 *
 * MapLibre resuelve el protocolo con `url.substring(0, url.indexOf('://'))`
 * —una sola línea de su `makeRequest`—, así que anteponer `palmero://` a la
 * URL entera deja el original intacto detrás y recuperable con un `slice`. La
 * URL de GRAFCAN lleva su propio `https://` dentro; el ejemplo de la
 * documentación de MapLibre (`params.url.split('://')[1]`) se lo comería, y por
 * eso aquí se corta por longitud del prefijo y no por separador.
 *
 * ESTO NO IMPORTA `maplibre-gl` A PROPÓSITO. Es la mitad del sistema de caché
 * que también usan el precargador y los tests, y ninguno de los dos tiene un
 * navegador delante. Quien registra el protocolo es `protocol.ts`, que es el
 * único fichero de este directorio que toca la librería del mapa.
 */

import type { RasterSourceSpecification } from 'maplibre-gl'

/**
 * El esquema. No es `cache://` ni `tile://` porque un protocolo registrado es
 * global a la página: si algún día conviven dos mapas, que se sepa de quién es.
 */
export const TILE_PROTOCOL = 'palmero'

const PREFIX = `${TILE_PROTOCOL}://`

/** La URL de una tesela, marcada para que la sirva la caché. */
export function cachedUrl(url: string): string {
  return url.startsWith(PREFIX) ? url : PREFIX + url
}

/** El camino de vuelta: lo que hay que pedirle de verdad a GRAFCAN. */
export function plainUrl(url: string): string {
  return url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url
}

/**
 * La clave con la que se guarda una tesela.
 *
 * Es la URL pedida, entera y sin normalizar, y eso incluye el `width=`/`height=`
 * que pone la densidad de pantalla (ver `realce/density.ts`): dos densidades
 * son dos imágenes distintas y compartir clave serviría la borrosa a quien pidió
 * la fina. `density.ts` ya redondea al medio punto justo para que esto no se
 * fragmente en una clave por cada zoom del navegador.
 */
export function cacheKey(url: string): string {
  return plainUrl(url)
}

/**
 * La misma fuente raster, pero pidiendo por la caché.
 *
 * Se aplica en la web al añadir la fuente al mapa, NO en `basemaps.ts`: de ese
 * fichero hay una copia en la aplicación de macOS, que no tiene ni IndexedDB ni
 * MapLibre y recibiría una URL con un protocolo que nadie sabe resolver. El
 * núcleo se queda como está.
 */
export function cachedSource(source: RasterSourceSpecification): RasterSourceSpecification {
  return { ...source, tiles: (source.tiles ?? []).map(cachedUrl) }
}
