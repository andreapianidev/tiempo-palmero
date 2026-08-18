/**
 * Qué teselas se piden por delante. Solo la decisión: aquí no se descarga nada.
 *
 * Cuatro casos, y ninguno de los cuatro es «bajarse la isla». Los cuatro
 * responden a la misma pregunta —¿hacia dónde va ya el usuario?— y ninguno
 * inventa una dirección que el usuario no haya empezado a tomar:
 *
 *  1. **La vista de lejos**, al encender un fondo por primera vez. Diecisiete
 *     teselas de z9 a z11 que cubren La Palma entera; con ellas MapLibre tiene
 *     algo que ampliar a cualquier escala, en vez de un hueco. El
 *     coste está medido en `budget.ts`: unos 720-740 kB la ortofoto y unos
 *     900-1040 kB el MT20, que tardan tres segundos si nadie compite por la red
 *     y bastante más dentro del navegador, donde no la tienen para ellas.
 *  2. **El borde por el que se está saliendo**, cuando el mapa se para. No el
 *     anillo entero: solo el lado hacia el que el usuario ya venía moviéndose,
 *     que es la diferencia entre adelantarse y acaparar.
 *  3. **El encuadre de un fondo que se está a punto de encender**, mientras el
 *     puntero está encima de su chip. Una pantalla, del centro hacia afuera.
 *  4. **El paso siguiente del zoom**, y solo cuando el usuario ACABA de subir
 *     un nivel de tesela. Cuatro teselas, las hijas de la del centro.
 *
 * La licencia de GRAFCAN prohíbe la descarga masiva, y por eso lo que no está
 * aquí importa tanto como lo que está: no se recorre la isla, no se bajan los
 * niveles finos y no se pide nada de un fondo que no se esté mirando ni a punto
 * de mirar. El peor caso de una parada del mapa son 8 + 4 teselas; el de un
 * roce en el selector, 12. Ninguno crece con el tiempo que uno pase delante.
 */

import { INTENT_MAX_TILES, OVERVIEW_ZOOMS, PREFETCH_MAX_TILES } from './budget'
import { tileAt, tilesInBbox, type Bbox, type TileXY } from './grid'

/**
 * Las teselas de la isla de lejos, de la más gruesa a la más fina.
 *
 * El orden importa: si la conexión se corta a la mitad, lo que habrá quedado
 * guardado es lo que cubre más superficie por byte.
 */
export function overviewTiles(bbox: Bbox): TileXY[] {
  return OVERVIEW_ZOOMS.flatMap((z) => tilesInBbox(bbox, z))
}

/**
 * Las teselas justo fuera de la vista, del lado hacia el que se venía moviendo.
 *
 * `from` es el centro donde estaba el mapa antes del movimiento y `view` es
 * donde ha quedado. Si no se movió —o solo se hizo zoom— no se pide nada: sin
 * dirección, adelantarse es adivinar, y adivinar contra un servicio ajeno es
 * justo lo que no se hace.
 *
 * Se piden las columnas o filas contiguas al borde, no las diagonales sueltas
 * de las esquinas: en un arrastre en diagonal salen los dos lados, y las
 * esquinas caen dentro por ser parte de una de las dos tiras.
 */
export function leadingEdgeTiles(
  from: { lon: number; lat: number },
  view: Bbox & { zoom: number },
  cap = PREFETCH_MAX_TILES,
): TileXY[] {
  const cx = (view.west + view.east) / 2
  const cy = (view.south + view.north) / 2
  const dx = cx - from.lon
  const dy = cy - from.lat

  // Menos de un 5 % del ancho de la ventana no es un desplazamiento, es el
  // temblor de soltar el ratón. Sin este mínimo, cada clic dispararía una
  // precarga en una dirección inventada.
  const minX = (view.east - view.west) * 0.05
  const minY = (view.north - view.south) * 0.05
  if (Math.abs(dx) < minX && Math.abs(dy) < minY) return []

  const inside = tilesInBbox(view, view.zoom)
  if (!inside.length) return []
  const xs = inside.map((t) => t.x)
  const ys = inside.map((t) => t.y)
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const n = 2 ** view.zoom

  const out: TileXY[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return
    if (out.some((t) => t.x === x && t.y === y)) return
    out.push({ z: view.zoom, x, y })
  }

  // El eje que más se movió va primero: si el cupo no da para los dos lados de
  // una diagonal, se gasta en el que más probablemente se cruce.
  const horizontalFirst = Math.abs(dx) / (minX || 1) >= Math.abs(dy) / (minY || 1)
  const column = () => {
    if (Math.abs(dx) < minX) return
    const x = dx > 0 ? x1 + 1 : x0 - 1
    for (let y = y0; y <= y1; y++) push(x, y)
  }
  const row = () => {
    if (Math.abs(dy) < minY) return
    // Y crece hacia el sur en el esquema XYZ: subir en latitud es bajar en Y.
    const y = dy > 0 ? y0 - 1 : y1 + 1
    for (let x = x0; x <= x1; x++) push(x, y)
  }
  if (horizontalFirst) {
    column()
    row()
  } else {
    row()
    column()
  }

  return out.slice(0, cap)
}

/**
 * Las teselas del encuadre en el que está el mapa, del centro hacia afuera.
 *
 * Es lo que se pide cuando el puntero se posa sobre un fondo del selector: lo
 * que va a hacer falta en cuanto suelte el clic, no la isla de lejos. Ver
 * `INTENT_MAX_TILES` en `budget.ts`, donde está la diferencia entre las dos y
 * por qué solo esta quita la espera.
 *
 * EL ORDEN ES LA MITAD DE LA FUNCIÓN. Con un tope de 12 y una pantalla que pida
 * más —un monitor grande, una ventana apaisada—, lo que se quede fuera tiene
 * que ser el borde y nunca el centro: es donde está mirando quien va a pulsar.
 * Se ordena por distancia de Chebyshev a la tesela central, que en una rejilla
 * cuadrada es «cuántos anillos hacia afuera», y los empates por coordenada para
 * que dos ejecuciones con los mismos datos den la misma lista.
 */
export function viewTiles(
  view: Bbox & { zoom: number },
  cap = INTENT_MAX_TILES,
): TileXY[] {
  const tiles = tilesInBbox(view, view.zoom)
  if (tiles.length <= cap) return tiles
  const c = tileAt((view.west + view.east) / 2, (view.south + view.north) / 2, view.zoom)
  const anillo = (t: TileXY) => Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y))
  return tiles
    .slice()
    .sort((a, b) => anillo(a) - anillo(b) || a.y - b.y || a.x - b.x)
    .slice(0, cap)
}

/**
 * Las cuatro hijas de la tesela del centro: lo que se ve al acercarse un paso.
 *
 * SOLO SE LLAMA CUANDO EL USUARIO ACABA DE SUBIR UN NIVEL, y esa condición vive
 * en `useTileCache`, no aquí: se compara el nivel de tesela de antes del
 * movimiento con el de después, así que no hace falta ningún umbral sobre el
 * zoom de la cámara —que es continuo y tiembla— sino un escalón que ya ocurrió.
 * Quien acaba de pasar de z14 a z15 casi siempre va a z16; quien arrastró en
 * plano no, y a ese no se le pide nada por aquí.
 *
 * CUATRO Y NO UNA PANTALLA. Un paso de zoom deja en pantalla el centro del
 * encuadre anterior, y las cuatro hijas de la tesela central son exactamente
 * esa superficie: 0,9 MB a la mediana de 230 kB, contra los 2,8 de precargar la
 * pantalla entera del nivel siguiente. Lo que quede fuera lo pide MapLibre por
 * el camino de siempre, ya con el centro puesto.
 *
 * Y NADA EN EL TECHO. Con la cámara en el `maxzoom` de la fuente —17 en los dos
 * fondos de GRAFCAN— no hay nivel siguiente que pedir, y pedir el 18 sería
 * bajarse teselas que el estilo no va a dibujar nunca.
 */
export function zoomInTiles(view: Bbox & { zoom: number }, maxzoom: number): TileXY[] {
  if (view.zoom >= maxzoom) return []
  const c = tileAt((view.west + view.east) / 2, (view.south + view.north) / 2, view.zoom)
  const z = view.zoom + 1
  const n = 2 ** z
  return [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]
    .map(([dx, dy]) => ({ z, x: 2 * c.x + dx, y: 2 * c.y + dy }))
    .filter((t) => t.x < n && t.y < n)
}
