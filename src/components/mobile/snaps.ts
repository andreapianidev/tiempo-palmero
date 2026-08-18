/**
 * Las tres alturas de la hoja del móvil, y nada más.
 *
 * `peek` — solo la cabecera, asomando por abajo. Es la posición de reposo y la
 * hoja NUNCA baja de aquí: la cifra del punto que se está mirando tiene que
 * seguir en pantalla mientras se mueve el mapa. Es también la posición de
 * arranque, para que el mapa se vea entero y quien quiera el detalle lo pida.
 *
 * `half` — algo menos de la mitad. Entra la cifra grande con su margen y su
 * frescura, y el mapa sigue viéndose arriba.
 *
 * `full` — pegada al borde superior seguro. La ficha entera, para leer.
 *
 * El valor de cada escalón es el desplazamiento vertical de una hoja que mide
 * toda la pantalla: 0 la taparía del todo, y `peek` es el número más grande de
 * los tres.
 *
 * Los márgenes seguros salen de `env(safe-area-inset-*)`, medido en el
 * navegador: la muesca y la barra de gestos de un teléfono se comen la hoja por
 * arriba y por abajo, y sin descontarlas el escalón `full` queda debajo del
 * reloj del sistema.
 */

export const SNAP = { peek: 0, half: 1, full: 2 } as const

export type SnapIndex = 0 | 1 | 2

export type SnapOffsets = readonly [number, number, number]

interface Measures {
  /** Alto útil de la pantalla, medido sobre la propia hoja. */
  height: number
  /** Alto del asa más la fila de cabecera, con su margen seguro incluido. */
  headHeight: number
  /** Lo que hay que dejar libre arriba: muesca, isla dinámica o nada. */
  topInset: number
}

export function snapOffsets({ height, headHeight, topInset }: Measures): SnapOffsets {
  return [
    // La cabecera queda justo asomando por el borde de abajo.
    Math.max(topInset, height - headHeight),
    Math.max(topInset, Math.round(height * 0.46)),
    topInset,
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

/**
 * Hasta dónde deja llegar el dedo. Se permiten 40 px de más por cada extremo
 * —la goma de siempre— para que el gesto no se sienta topado en seco, pero ni
 * la hoja se va de la pantalla por abajo ni tapa la muesca por arriba.
 */
const RUBBER = 40

export function clampDrag(offsets: SnapOffsets, at: number): number {
  return Math.max(offsets[SNAP.full] - RUBBER, Math.min(offsets[SNAP.peek] + RUBBER, at))
}

/**
 * Velocidad (px/ms) a partir de la cual el gesto es un lanzamiento y no un
 * arrastre: con ella se salta al escalón de al lado aunque el dedo se haya
 * movido poco.
 *
 * ESTE NÚMERO ESTÁ AJUSTADO A MANO Y NO MEDIDO, y queda dicho porque en este
 * repositorio lo normal es lo contrario. Venía de un prototipo que ya no está,
 * así que hoy su única justificación es que la hoja se siente bien con él.
 * Quien lo toque tiene las dos orillas que pesan: subirlo obliga a sacudir el
 * dedo para cambiar de escalón, y bajarlo convierte en salto cualquier arrastre
 * que termine con algo de inercia.
 */
export const FLICK = 0.55

/** Dónde termina un gesto: lanzamiento hacia un lado, o el escalón más cercano. */
export function settleSnap(
  offsets: SnapOffsets,
  current: SnapIndex,
  at: number,
  velocity: number,
): SnapIndex {
  if (Math.abs(velocity) > FLICK) {
    // Hacia arriba (velocidad negativa) sube un escalón; hacia abajo, baja.
    const next = current + (velocity < 0 ? 1 : -1)
    return Math.max(0, Math.min(2, next)) as SnapIndex
  }
  return nearestSnap(offsets, at)
}
