/**
 * Quién se queda con el sitio cuando dos cosas del mapa caen encima.
 *
 * POR QUÉ EXISTE. El reparto vivía dentro de `MapView.tsx`, mezclado con el
 * `map.project()` y el `offsetWidth` de cada elemento, y eso tenía dos
 * consecuencias. La primera es que no se podía probar: para comprobar una
 * regla de prioridad hacía falta un mapa de verdad. La segunda es peor —
 * cualquier marcador nuevo se podía añadir SIN pasar por aquí, y nada avisaba.
 *
 * Fue exactamente lo que pasó con las cámaras de incendio: se dibujaban con
 * `z-index` 50, por encima de todo y sin entrar en el reparto, y el 13 de
 * agosto de 2026 un triángulo de aviso cayó justo sobre la pastilla de
 * LasTricias. En pantalla se leía **«29▲1°»**: el aviso desaparecía camuflado
 * de coma decimal, y la cifra parecía otra. Con 29,1 °C y un 17 % de humedad
 * en la vertiente de sotavento, esconder un aviso de incendio era la peor
 * cosa posible que podía tapar el mapa.
 *
 * Aquí solo se decide el reparto. Medir los rectángulos y aplicar el resultado
 * al DOM sigue siendo de `MapView`, que es quien tiene el mapa.
 */

/** Qué se hace con cada elemento después del reparto. */
export type Placement = 'full' | 'dot' | 'hidden'

export interface Box {
  /** Centro en píxeles de pantalla. */
  x: number
  y: number
  w: number
  h: number
}

export interface DeclutterItem {
  /** Menor gana. Ver `RANK`. */
  rank: number
  /**
   * Se puede encoger a un punto en vez de desaparecer. Vale para las pastillas
   * —un punto sigue siendo pinchable y sigue diciendo que ahí hay un sensor— y
   * no vale para un nombre de pueblo ni para un triángulo de incendio, que
   * encogidos no significan nada.
   */
  collapsible: boolean
  box: Box
}

/** Holgura entre dos rectángulos para no darlos por solapados al ras. */
export const GAP_X = 3
export const GAP_Y = 2

/** Lado del punto al que se encoge una pastilla. */
export const DOT = 12

/**
 * La tabla de prioridades del mapa, en un sitio y comentada.
 *
 * El orden es una decisión editorial, no técnica, y por eso está escrita como
 * una tabla y no repartida por el código:
 *
 * - `fireAlert` — lo único que avisa de algo que está ocurriendo AHORA. Gana a
 *   todo, incluido el nombre de la capital. Va en −1 y no en 0 A PROPÓSITO:
 *   empatado con `placeMajor` el desempate lo decidía el orden en que quien
 *   llama hubiera metido los elementos en la lista, que es justo la clase de
 *   dependencia oculta que este módulo existe para quitar de en medio.
 * - `placeMajor` — sin «Santa Cruz de La Palma» ni «Los Llanos» el mapa es
 *   bonito y nadie sabe dónde está.
 * - `pill` — el dato es el contenido. Entre pastillas manda la altitud: en una
 *   isla de 2426 m las estaciones altas son las que cuentan la historia y las
 *   que menos vecinas tienen. Cae entre 1 y 1,9, siempre por detrás de un
 *   topónimo mayor y siempre por delante de uno menor.
 * - `placeMinor` — contexto.
 * - `fireQuiet` — una cámara SIN aviso también es contexto, y va la última: no
 *   vale que un triángulo hueco tape una temperatura.
 */
export const RANK = {
  fireAlert: -1,
  placeMajor: 0,
  placeMinor: 2,
  fireQuiet: 2.5,
} as const

/**
 * El rango de una pastilla según su prioridad propia (altitud para las
 * estaciones, tráfico para los aforos), normalizada contra la mayor de la capa.
 */
export function pillRank(priority: number, maxPriority: number): number {
  return 1 + (1 - priority / Math.max(1, maxPriority)) * 0.9
}

function overlaps(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP_X &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + GAP_Y
  )
}

/**
 * Reparte el sitio y devuelve qué hacer con cada elemento, **en el mismo orden
 * en que llegaron**: quien llama midió los rectángulos y necesita volver a
 * casar cada respuesta con su elemento del DOM.
 *
 * Los rectángulos llegan SIEMPRE medidos expandidos. Si se midiera un pin ya
 * encogido, su ancho sería el del punto y no volvería a abrirse nunca al
 * separarse de sus vecinos.
 */
export function place(items: readonly DeclutterItem[]): Placement[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].rank - items[b].rank)
  const out: Placement[] = new Array(items.length).fill('hidden')
  const taken: Box[] = []

  for (const i of order) {
    const it = items[i]
    if (!taken.some((r) => overlaps(r, it.box))) {
      taken.push(it.box)
      out[i] = 'full'
      continue
    }
    if (!it.collapsible) continue
    const dot: Box = { x: it.box.x, y: it.box.y, w: DOT, h: DOT }
    // Aun encogido ocupa sitio: dos puntos uno encima del otro son un punto.
    if (!taken.some((r) => overlaps(r, dot))) {
      taken.push(dot)
      out[i] = 'dot'
    }
  }

  return out
}
