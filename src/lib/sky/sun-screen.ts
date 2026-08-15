/**
 * Dónde cae el sol en la pantalla.
 *
 * NO ES UN PUNTO DEL MAPA. El sol está a 150 millones de kilómetros: sobre la
 * isla no tiene posición, tiene DIRECCIÓN. Su sitio en pantalla es el punto de
 * fuga de esa dirección, y eso se saca multiplicando el vector por la matriz de
 * vista con la componente w a cero — que es la forma exacta, no una
 * aproximación: un punto «muy lejos» habría que ponerlo a alguna distancia
 * concreta, y cualquiera que se elija está mal.
 *
 * Vive fuera de la capa que lo dibuja porque es la única parte de ella que se
 * puede probar sin una tarjeta gráfica y un mapa cargado: es geometría.
 */

import { skyVector, type SkyPosition } from '../sun'

export interface SunScreen {
  /** Coordenadas normalizadas de pantalla: −1 a 1, con la y hacia arriba. */
  x: number
  y: number
  /** `false` si el sol queda a la espalda de la cámara. */
  ahead: boolean
}

/**
 * `matrix` es la matriz de vista de MapLibre, en columna mayor, tal cual llega
 * a una capa personalizada.
 *
 * En Mercator la `y` crece hacia el SUR, y por eso la componente norte entra
 * con signo cambiado. Es el error que haría salir el sol en el sitio simétrico
 * respecto al centro de la pantalla, o sea plausible y equivocado.
 */
export function sunScreen(matrix: ArrayLike<number>, sun: SkyPosition): SunScreen {
  const [east, north, up] = skyVector(sun)
  const x = matrix[0] * east + matrix[4] * -north + matrix[8] * up
  const y = matrix[1] * east + matrix[5] * -north + matrix[9] * up
  const w = matrix[3] * east + matrix[7] * -north + matrix[11] * up
  if (!(w > 1e-9)) return { x: 0, y: 0, ahead: false }
  return { x: x / w, y: y / w, ahead: true }
}
