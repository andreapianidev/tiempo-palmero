/**
 * Dónde cae la luna en pantalla y hacia dónde mira su cuerno.
 *
 * LA POSICIÓN ES LA MISMA CUENTA QUE LA DEL SOL —el punto de fuga de una
 * dirección— y por eso se reutiliza `directionScreen`. Lo que no tiene el sol es
 * el segundo problema, que es el que justifica este fichero: **el disco lunar
 * está iluminado por un lado, y hay que saber por cuál en la pantalla**.
 *
 * NO SE PUEDE RESOLVER CON UN ÁNGULO DE POSICIÓN. La forma clásica es el ángulo
 * del limbo brillante medido desde el norte celeste, corregido por el ángulo
 * paraláctico para pasarlo al horizonte. Eso vale con una cámara que mira al
 * cielo con el horizonte horizontal. La de aquí no: MapLibre gira con el rumbo,
 * se inclina, y sobre la ortofoto ni siquiera enseña el horizonte. Cada uno de
 * esos tres grados de libertad habría que meterlo a mano en el ángulo, y
 * cualquiera de los tres olvidado da una luna iluminada por el lado que no es
 * —que es un error que nadie nota y que está mal todas las noches—.
 *
 * SE RESUELVE PROYECTANDO DOS PUNTOS. Se proyecta la luna, se proyecta un punto
 * un pelo hacia el sol, y la dirección del cuerno es la resta. La cámara entra
 * en la cuenta por donde tiene que entrar: por la misma matriz que coloca todo
 * lo demás.
 *
 * EL ESPACIO DE LLEGADA ES EL DEL CUADRILÁTERO, no el normalizado de pantalla.
 * El disco se dibuja en un cuadrilátero cuyo lado horizontal ya está dividido
 * por la relación de aspecto para que salga redondo; dentro de ese
 * cuadrilátero, un píxel mide lo mismo a lo ancho que a lo alto. La dirección
 * del cuerno tiene que estar en ESE espacio, y por eso la componente x se
 * multiplica por el aspecto. Sin esa línea el cuerno sale girado en cuanto la
 * ventana no es cuadrada, y sale bien en el portátil de quien lo escribió.
 */

import { directionScreen } from './sun-screen'

export interface MoonScreen {
  /** Coordenadas normalizadas de pantalla, −1 a 1, con la y hacia arriba. */
  x: number
  y: number
  /** `false` si la luna queda a la espalda de la cámara. */
  ahead: boolean
  /**
   * Dirección unitaria del cuerno brillante en el espacio del cuadrilátero.
   * `[0, 0]` cuando no se puede determinar, que es cuando no hay cuerno.
   */
  limb: [number, number]
}

/**
 * `direction` y `brightLimb` son vectores unitarios en la base local (este,
 * norte, arriba), tal y como salen de `moonSight`. `aspect` es ancho/alto del
 * lienzo.
 */
export function moonScreen(
  matrix: ArrayLike<number>,
  direction: [number, number, number],
  brightLimb: [number, number, number],
  aspect: number,
): MoonScreen {
  const center = directionScreen(matrix, direction)
  if (!center.ahead) return { x: 0, y: 0, ahead: false, limb: [0, 0] }

  // Un cuarto de grado hacia el cuerno: lo bastante lejos para que la resta no
  // se coma en el redondeo de coma flotante y lo bastante cerca para que la
  // curvatura de la proyección no doble la dirección.
  const step = 0.0044
  const nx = direction[0] + step * brightLimb[0]
  const ny = direction[1] + step * brightLimb[1]
  const nz = direction[2] + step * brightLimb[2]
  const n = Math.hypot(nx, ny, nz)
  const toward = directionScreen(matrix, [nx / n, ny / n, nz / n])
  if (!toward.ahead) return { x: center.x, y: center.y, ahead: true, limb: [0, 0] }

  const dx = (toward.x - center.x) * aspect
  const dy = toward.y - center.y
  const d = Math.hypot(dx, dy)
  return {
    x: center.x,
    y: center.y,
    ahead: true,
    limb: d > 1e-12 ? [dx / d, dy / d] : [0, 0],
  }
}
