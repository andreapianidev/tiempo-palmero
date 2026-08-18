/**
 * Precargar el fondo que el usuario está a punto de encender.
 *
 * Es el tercer caso de `prefetch.ts` y está en su propio fichero porque no lo
 * dispara el mapa: lo dispara el puntero al posarse sobre un chip del selector,
 * que vive en el panel lateral y no tiene el mapa delante. De ahí lo único raro
 * que hay aquí, el encuadre guardado a un lado.
 *
 * POR QUÉ ESTO EXISTE. Encender la ortofoto con el mapa a z15 tardaba lo que
 * tarda GRAFCAN en servir una pantalla —12 teselas, mediana 556 ms cada una y
 * p90 de 1183— con el fondo a medio pintar mientras tanto. La vista de lejos de
 * `OVERVIEW_ZOOMS` no arregla eso: a z15 lo que deja es un z11 ampliado
 * dieciséis veces. Lo que quita la espera es tener ya en IndexedDB las teselas
 * del encuadre en el que está el mapa, y el momento de pedirlas es mientras la
 * mano va hacia el chip.
 *
 * LO QUE NO HACE, que es lo que mantiene en pie la promesa de `basemaps.ts`:
 * quien no se acerca al selector no gasta ni una petición fuera de casa. Esto
 * no precarga fondos «por si acaso» al abrir la página, no toca el fondo de
 * casa —que no tiene fuente externa— y no pide nada del fondo que ya está
 * puesto. Y con `saveData` o una red por debajo de 4G no pide nada de nada, que
 * eso lo decide `warmTiles` por todos.
 *
 * EL ENCUADRE ES DE MÓDULO, no un contexto de React ni una propiedad que baje
 * cinco niveles hasta el chip. Hay un mapa por página —`warm.ts` ya apoya toda
 * su fila en la misma suposición— y lo que el selector necesita saber es un
 * dato de una sola línea que cambia cuando el mapa se para. Un contexto para
 * eso sería más ceremonia que información.
 */

import { BASEMAPS, type BasemapId } from '../basemaps'
import { INTENT_DELAY_MS, INTENT_MAX_TILES } from './budget'
import { rasterTileZoom, type Bbox } from './grid'
import { viewTiles } from './prefetch'
import { dropWarmChannel, warmTiles } from './warm'

/** El encuadre de la cámara: bbox en grados y el zoom SIN redondear a tesela. */
export type CameraView = Bbox & { zoom: number }

let vista: CameraView | null = null
let temporizador: ReturnType<typeof setTimeout> | null = null

/**
 * Lo llama `useTileCache` cada vez que el mapa se para.
 *
 * El zoom que se guarda es el de la cámara, continuo, y no el nivel de tesela:
 * el nivel depende del `minzoom`/`maxzoom` de CADA fuente, y aquí todavía no se
 * sabe cuál de los fondos va a mirar el puntero.
 */
export function rememberView(view: CameraView): void {
  vista = view
}

/**
 * El puntero se ha posado sobre el chip de un fondo. Cuenta atrás y, si sigue
 * ahí, se pide su encuadre.
 *
 * No comprueba si `id` es el fondo puesto: eso lo sabe el selector, que es
 * quien tiene el estado, y llamar con el fondo actual solo pediría teselas que
 * ya están en la caché desde hace un segundo.
 */
export function warmBasemapIntent(id: BasemapId): void {
  cancelBasemapIntent()
  const source = BASEMAPS[id].source
  const encuadre = vista
  if (!source?.tiles?.length || !encuadre) return
  const plantilla = source.tiles[0]
  temporizador = setTimeout(() => {
    temporizador = null
    const z = rasterTileZoom(encuadre.zoom, source.minzoom ?? 0, source.maxzoom ?? 22)
    warmTiles('intención', plantilla, viewTiles({ ...encuadre, zoom: z }, INTENT_MAX_TILES))
  }, INTENT_DELAY_MS)
}

/**
 * El puntero se ha ido. Se para la cuenta atrás y se tira lo que quede en la
 * fila; lo que ya iba por el cable termina, ver `dropWarmChannel`.
 */
export function cancelBasemapIntent(): void {
  if (temporizador !== null) {
    clearTimeout(temporizador)
    temporizador = null
  }
  dropWarmChannel('intención')
}

/** Olvida el encuadre. Para las pruebas y para quien desmonte el mapa. */
export function forgetView(): void {
  cancelBasemapIntent()
  vista = null
}
