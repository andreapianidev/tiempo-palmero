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

import { GRAZING_MAX_PITCH } from '../terrain'
import { skyVector, type SkyPosition } from '../sun'

/**
 * Campo de visión vertical de la cámara de MapLibre: 36,87°, su valor de
 * fábrica (`Transform.fov`, 0,6435 rad).
 *
 * No es API pública, así que quien pueda lo lee del `transform` y usa esto de
 * respaldo. Vive aquí porque lo necesitan las dos cosas que dibujan en el
 * cielo —el disco, para saber cuántos píxeles miden sus 0,53°, y el panel, para
 * decir hasta dónde llega el cielo que se ve— y dos copias serían dos.
 */
export const CAMERA_FOV_DEG = 36.87

/**
 * Hasta qué altura del cielo llega la pantalla, con la vista inclinada al tope.
 *
 * LA CUENTA. La cámara inclinada `p` grados mira `90 − p` por DEBAJO del
 * horizonte, y el borde de arriba de la pantalla está medio campo de visión más
 * arriba: `p − 90 + 18,4`. Con el tope del fondo de casa, 75°, salen 3,4°. Todo
 * lo que esté por encima de esa altura está fuera de cuadro POR ARRIBA,
 * iluminando la escena pero sin salir en ella.
 *
 * Y CON LOS FONDOS DE GRAFCAN SALE NEGATIVO: ahí el tope son 65°, o sea −6,6°, y
 * eso quiere decir que el horizonte NO ENTRA EN PANTALLA. Sobre la ortofoto y
 * sobre la carta topográfica no hay cielo que mirar, y por tanto ni disco ni
 * camino del sol por mucho que se enciendan. Es una consecuencia de una
 * limitación de licencia —el tope de 65 lo pone el número de teselas que se le
 * piden a GRAFCAN— y el panel lo dice en vez de dejar dos casillas mudas.
 *
 * SALE CALCULADO Y NO ESCRITO A MANO porque los números de los que depende ya
 * viven en el repositorio y se han movido antes: el tope de inclinación subió de
 * 65 a 75 el día que se decidió que el cielo se viera. Con el 3,4 escrito en una
 * cadena del panel, aquel cambio habría dejado una cifra falsa en pantalla.
 */
export function skyCeilingDeg(maxPitchDeg: number): number {
  return maxPitchDeg - 90 + CAMERA_FOV_DEG / 2
}

/** El techo del cielo con el fondo de casa, que es el único que llega a verlo. */
export const SKY_CEILING_DEG = skyCeilingDeg(GRAZING_MAX_PITCH)

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
