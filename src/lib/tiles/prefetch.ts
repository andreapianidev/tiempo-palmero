/**
 * Qué teselas se piden por delante. Solo la decisión: aquí no se descarga nada.
 *
 * Dos casos, y ninguno de los dos es «bajarse la isla»:
 *
 *  1. **La vista de lejos**, al encender un fondo por primera vez. Diecisiete
 *     teselas de z9 a z11 que cubren La Palma entera; con ellas MapLibre tiene
 *     algo que ampliar en cuanto se pulsa el selector, en vez de un hueco. El
 *     coste está medido en `budget.ts`: 838 kB la ortofoto, 1154 kB el MT20.
 *  2. **El borde por el que se está saliendo**, cuando el mapa se para. No el
 *     anillo entero: solo el lado hacia el que el usuario ya venía moviéndose,
 *     que es la diferencia entre adelantarse y acaparar.
 *
 * La licencia de GRAFCAN prohíbe la descarga masiva, y por eso lo que no está
 * aquí importa tanto como lo que está: no se recorre la isla, no se bajan los
 * niveles finos y no se pide nada de un fondo que no se esté mirando.
 */

import { PREFETCH_MAX_TILES, OVERVIEW_ZOOMS } from './budget'
import { tilesInBbox, type Bbox, type TileXY } from './grid'

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
