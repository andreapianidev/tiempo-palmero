/**
 * De una tira de puntos en pantalla a los triángulos que dibujan la línea.
 *
 * POR QUÉ NO HAY `gl.LINES`. Porque el ancho de línea de WebGL es una promesa
 * que casi nadie cumple: la especificación permite que `lineWidth` valga
 * siempre 1, y en Metal —o sea, en todos los Mac y todos los iPhone— vale
 * siempre 1. Una línea de un píxel sobre el cielo no se ve. La única manera de
 * tener una línea con grosor de verdad es hacerla de triángulos, y eso es esto.
 *
 * SE CONSTRUYE EN COORDENADAS DE PANTALLA y no en el mundo, porque lo que se
 * dibuja no está en el mundo: el sol está a 150 millones de kilómetros y su
 * sitio en pantalla es el punto de fuga de una dirección. Un tubo en 3D
 * alrededor de una circunferencia celeste sería la misma línea con mucho más
 * trabajo y un grosor que cambiaría con la perspectiva sin motivo.
 *
 * EL GROSOR SE CORRIGE POR LA RELACIÓN DE ASPECTO. Las coordenadas normalizadas
 * van de −1 a 1 en los dos ejes aunque la ventana sea el doble de ancha que de
 * alta, así que un desplazamiento de 0,01 en x no mide lo mismo que en y. La
 * normal se calcula en el espacio corregido y se devuelve al de pantalla al
 * aplicarla: sin eso, la línea sale más gruesa cuando va vertical que cuando va
 * horizontal, que es el error que hace que un arco parezca pintado a mano.
 *
 * VIVE FUERA DE LA CAPA porque es la parte que se puede probar sin una tarjeta
 * gráfica, igual que `sun-screen.ts`. Lo que queda en `SunPathLayer.ts` es el
 * enchufe: un búfer, un programa y una llamada de dibujo.
 */

import type { Rgb } from '../ocean/light'
import type { TrackMark } from './sun-path'

/** Seis flotantes por vértice: x, y, través, r, g, b. */
export const RIBBON_STRIDE = 6

export interface RibbonPoint {
  /** Coordenadas normalizadas de pantalla, −1 a 1, con la y hacia arriba. */
  x: number
  y: number
  /** `false` si el punto queda a la espalda de la cámara: ahí la línea se corta. */
  ahead: boolean
  color: Rgb
  mark: TrackMark
}

export interface RibbonStyle {
  /** Semiancho de la línea —reborde incluido—, en unidades de la y de pantalla. */
  halfWidth: number
  /** Ancho del lienzo dividido por su alto. */
  aspect: number
  /** Medio brazo de una marca de hora en punto, en unidades de la y. */
  hourArm: number
  /** Medio brazo de la marca del sol de ahora. Más largo: es el cursor. */
  nowArm: number
}

/**
 * Hasta dónde se sigue un punto fuera de la pantalla.
 *
 * La pantalla es [−1, 1]. Un punto a 8 está a tres pantallas y media de
 * distancia del borde, y el segmento que lo une con su vecino ya no aporta un
 * solo píxel visible. El límite existe porque cerca del plano de la cámara la
 * división en perspectiva se dispara: sin él, un punto del camino que rozara
 * ese plano generaría un cuadrilátero de coordenadas enormes, y el reventón
 * numérico se vería como un destello del ancho de la pantalla.
 */
const BOUND = 8

/**
 * Los triángulos de la línea, entrelazados y listos para subir a la tarjeta.
 *
 * Cada segmento son dos triángulos —seis vértices— y cada marca, otros seis: un
 * palito perpendicular al camino. El atributo «través» vale −1 en un borde y +1
 * en el otro, que es lo que el sombreador usa para pintar el núcleo brillante y
 * el reborde oscuro sin necesidad de dos pasadas.
 */
export function trackRibbon(points: readonly RibbonPoint[], style: RibbonStyle): Float32Array {
  const out: number[] = []

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (!usable(a) || !usable(b)) continue
    quad(out, a.x, a.y, b.x, b.y, a.color, b.color, style.halfWidth, style.aspect)
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.mark === 'none' || !usable(p)) continue
    const arm = p.mark === 'now' ? style.nowArm : style.hourArm
    // La tangente sale de los vecinos que existan: en los extremos del camino
    // solo hay uno, y con el punto mismo de sustituto la marca sigue saliendo
    // perpendicular al trozo de línea que sí está dibujado.
    const before = usable(points[i - 1]) ? points[i - 1] : p
    const after = usable(points[i + 1]) ? points[i + 1] : p
    const dir = unit(after.x - before.x, after.y - before.y, style.aspect)
    if (!dir) continue
    // El brazo va POR LA NORMAL de la tangente, o sea cruzando el camino.
    const ax = p.x - (-dir.y * arm) / style.aspect
    const ay = p.y - dir.x * arm
    const bx = p.x + (-dir.y * arm) / style.aspect
    const by = p.y + dir.x * arm
    quad(out, ax, ay, bx, by, p.color, p.color, style.halfWidth, style.aspect)
  }

  return Float32Array.from(out)
}

function usable(p: RibbonPoint | undefined): p is RibbonPoint {
  return !!p && p.ahead && Math.abs(p.x) <= BOUND && Math.abs(p.y) <= BOUND
}

/** Dirección unitaria en el espacio corregido por aspecto. `null` si no hay. */
function unit(dx: number, dy: number, aspect: number): { x: number; y: number } | null {
  const x = dx * aspect
  const y = dy
  const len = Math.hypot(x, y)
  if (!(len > 1e-9)) return null
  return { x: x / len, y: y / len }
}

/** Los seis vértices de un tramo recto de a a b, con su grosor. */
function quad(
  out: number[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  colorA: Rgb,
  colorB: Rgb,
  halfWidth: number,
  aspect: number,
): void {
  const dir = unit(bx - ax, by - ay, aspect)
  if (!dir) return
  // Normal en el espacio corregido, devuelta al de pantalla al aplicarla.
  const ox = (-dir.y * halfWidth) / aspect
  const oy = dir.x * halfWidth

  const push = (x: number, y: number, across: number, c: Rgb) => {
    out.push(x + across * ox, y + across * oy, across, c[0], c[1], c[2])
  }
  push(ax, ay, -1, colorA)
  push(bx, by, -1, colorB)
  push(ax, ay, 1, colorA)
  push(ax, ay, 1, colorA)
  push(bx, by, -1, colorB)
  push(bx, by, 1, colorB)
}
