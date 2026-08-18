/**
 * Quien de verdad descarga lo que decide `prefetch.ts`.
 *
 * Está aparte porque son dos responsabilidades distintas y una de ellas —qué
 * teselas— se puede probar sin red ni navegador. Aquí queda lo otro: la fila
 * estrecha, el respeto por la conexión y no pedir dos veces lo mismo.
 *
 * UNA SOLA FILA PARA TODO, con dos obreros. No una fila por cada quien llame:
 * la vista de lejos son 17 teselas que tardan lo suyo, y si el usuario arrastra
 * el mapa mientras bajan, la precarga del borde no puede abrir su propio par de
 * peticiones en paralelo — serían cuatro compitiendo con las que MapLibre está
 * pidiendo para la pantalla, que son las que alguien está mirando de verdad.
 *
 * Y LOS CANALES NO SE PISAN IGUAL. Un arrastre nuevo deja sin sentido el borde
 * que se estaba precargando —el usuario ya va hacia otro lado— y un puntero que
 * se va del chip deja sin sentido ese encuadre, así que lo que quede pendiente
 * de esos dos se tira. La vista de lejos no: se pide una vez cada 30 días y
 * abandonarla a medias dejaría el fondo con agujeros que nadie volvería a
 * rellenar, porque nadie vuelve a pedirla. La regla está en el tipo, unas
 * líneas más abajo, y no en un `if` con el nombre de un canal escrito a mano:
 * así el compilador es quien impide tirar `lejos` por descuido.
 *
 * TRES FRENOS más, y los tres importan:
 *
 *  - **Nada si ya está guardado.** Se pregunta al inventario, que son unos
 *    bytes por tesela, antes de tocar la red.
 *  - **Nada si la conexión pide ahorro** (`prefetchAllowed`).
 *  - **Nada que falle hace ruido.** Una precarga que no sale adelante no es un
 *    fallo: esa tesela se pedirá cuando se mire, por el camino de siempre.
 */

import { PREFETCH_CONCURRENCY, prefetchAllowed } from './budget'
import { tileUrl, type TileXY } from './grid'
import { fetchTileOnce, raceAbort } from './inflight'
import { cacheKey } from './key'
import { hasTile, writeTile } from './store'

/**
 * `lejos` es la vista de la isla al encender un fondo; `borde`, lo que viene
 * detrás de un arrastre; `intención`, el encuadre del fondo sobre cuyo chip
 * está el puntero.
 *
 * LOS DOS ÚLTIMOS SE DESCARTAN Y EL PRIMERO NO, y la línea que los separa es si
 * alguien va a volver a pedirlos. Un arrastre nuevo deja sin sentido el borde
 * anterior y el puntero que se va del chip deja sin sentido ese encuadre: los
 * dos se vuelven a pedir solos la próxima vez que hagan falta. La vista de
 * lejos se pide UNA vez cada 30 días, así que abandonarla a medias dejaría el
 * fondo con agujeros que nadie volvería a rellenar.
 */
export type WarmChannel = 'lejos' | 'borde' | 'intención'

/** Los que se pueden tirar sin que nadie los eche de menos. Ver arriba. */
export type DiscardableChannel = Exclude<WarmChannel, 'lejos'>

interface Job {
  channel: WarmChannel
  template: string
  tile: TileXY
}

let queue: Job[] = []
let running = 0
let controller: AbortController | null = null

/**
 * Encola teselas para bajarlas en segundo plano. No devuelve las imágenes:
 * nadie las espera, y el objetivo es solo que estén en IndexedDB cuando
 * MapLibre las pida.
 */
export function warmTiles(channel: WarmChannel, template: string, tiles: TileXY[]): void {
  if (!tiles.length || !prefetchAllowed()) return
  if (channel !== 'lejos') queue = queue.filter((j) => j.channel !== channel)
  queue.push(...tiles.map((tile) => ({ channel, template, tile })))
  pump()
}

/**
 * Pone obreros a trabajar si hacen falta y hay hueco.
 *
 * LO LLAMAN LOS DOS EXTREMOS —quien encola y el obrero que termina— y esa es la
 * corrección de un fallo real. Con el arranque solo en `warmTiles`, un obrero
 * que salía de su bucle decrementaba el contador DESPUÉS de que la siguiente
 * llamada hubiera comprobado que ya había dos trabajando: la fila se quedaba
 * llena y sin nadie que la vaciara, callada, hasta el siguiente arrastre. Pasaba
 * justo al volver a montar el mapa después de un `stopWarming()`.
 */
function pump(): void {
  if (!queue.length) return
  controller ??= new AbortController()
  while (running < PREFETCH_CONCURRENCY && running < queue.length) {
    running++
    void worker(controller)
  }
}

async function worker(ctl: AbortController): Promise<void> {
  while (queue.length && !ctl.signal.aborted) {
    const job = queue.shift()
    if (!job) break
    const url = tileUrl(job.template, job.tile)
    const key = cacheKey(url)
    try {
      if (await hasTile(key, Date.now())) continue
      // Compartida con el protocolo: si MapLibre está pidiendo esta misma
      // tesela para la pantalla, esto se engancha a su descarga en vez de
      // abrir otra. Ver `inflight.ts`, que existe por una medida.
      const { body, type } = await raceAbort(fetchTileOnce(key, url), ctl.signal)
      await writeTile(key, body, type, Date.now())
    } catch {
      // Ver la cabecera: una precarga que falla no es un fallo.
    }
  }
  running--
  if (controller === ctl && !running && !queue.length) controller = null
  pump()
}

/**
 * Tira lo que quede pendiente de un canal descartable, sin tocar el resto.
 *
 * NO CORTA LO QUE YA VA POR EL CABLE, y es la misma decisión que toma
 * `warmTiles` al reemplazar un canal: una petición a medio camino son 230 kB de
 * mediana que ya se le pidieron a GRAFCAN, y abandonarla los tira sin ahorrarle
 * nada al servicio. Terminan y se guardan. Por eso el coste de una intención
 * equivocada —un puntero que roza un chip y sigue— está acotado en dos teselas
 * y no en cero: está medido y escrito en `INTENT_DELAY_MS`.
 */
export function dropWarmChannel(channel: DiscardableChannel): void {
  queue = queue.filter((j) => j.channel !== channel)
}

/** Corta lo que haya en vuelo y vacía la fila. Se llama al desmontar el mapa. */
export function stopWarming(): void {
  queue = []
  controller?.abort()
  controller = null
}

/** Lo que queda por bajar. Existe para poder observar esto desde una prueba. */
export function pendingWarmups(): number {
  return queue.length
}
