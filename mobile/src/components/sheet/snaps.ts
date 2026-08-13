/**
 * Las tres alturas de la hoja, y nada más.
 *
 * `peek` — solo la cabecera, asomando por encima del indicador de inicio. Es la
 * posición de reposo y la hoja NUNCA baja de aquí: la cifra del punto que se
 * está mirando tiene que seguir en pantalla mientras se mueve el mapa, que es
 * justo lo que se perdía cuando el detalle era otra pantalla.
 *
 * `half` — algo menos de la mitad. Entra la cifra grande con su margen y su
 * frescura, y el mapa sigue viéndose arriba.
 *
 * `full` — pegada al borde superior seguro. La ficha entera, para leer.
 *
 * El valor es el desplazamiento vertical de una hoja que mide toda la pantalla:
 * 0 sería taparla del todo, y `peek` es el número más grande de los tres.
 */

export const SNAP = { peek: 0, half: 1, full: 2 } as const

export type SnapIndex = 0 | 1 | 2

export type SnapOffsets = readonly [number, number, number]

interface Measures {
  /** Alto de la pantalla. */
  height: number
  /** Alto del asa más la fila de cabecera, medido en pantalla. */
  headHeight: number
  safeTop: number
  safeBottom: number
}

export function snapOffsets({ height, headHeight, safeTop, safeBottom }: Measures): SnapOffsets {
  return [
    // La cabecera queda justo encima del indicador de inicio, sin tocarlo.
    Math.max(0, height - headHeight - safeBottom),
    Math.round(height * 0.46),
    // El prototipo deja 44 px por arriba; en un teléfono de verdad ese número
    // es la isla dinámica o la muesca, y lo dice el sistema.
    safeTop,
  ] as const
}

/** El escalón más cercano a una posición, para soltar el arrastre donde toca. */
export function nearestSnap(offsets: SnapOffsets, at: number): SnapIndex {
  let best: SnapIndex = 0
  let bestGap = Infinity
  for (let i = 0; i < offsets.length; i++) {
    const gap = Math.abs(offsets[i] - at)
    if (gap < bestGap) {
      bestGap = gap
      best = i as SnapIndex
    }
  }
  return best
}

/** Qué escalón sigue al tocar la cabecera: sube, sube y vuelve abajo. */
export function nextSnap(current: SnapIndex): SnapIndex {
  return current === SNAP.peek ? SNAP.half : current === SNAP.half ? SNAP.full : SNAP.peek
}
