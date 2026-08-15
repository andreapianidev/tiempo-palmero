/**
 * Lo que hay que decir de «La carrera del sol».
 *
 * ES LA RESPUESTA A LA CASILLA DE ARRIBA. El disco solo entra en cuadro con el
 * sol muy bajo; el camino baja hasta el horizonte por los dos extremos, así que
 * a cualquier hora se ve por dónde salió y por dónde se va a poner. Lo que
 * queda por encima de la pantalla es el trozo de arco del mediodía, y ése no
 * hace falta: la pregunta que se hace delante de un mapa de La Palma no es a
 * qué altura está el sol a las dos, es a qué hora le va a dar a una ladera.
 */

import { n } from '../../../i18n'
import { TRACK_STEP_MIN } from '../../../lib/sky/sun-path'
import { SIN_CIELO } from './DiscNotes'

interface Props {
  on: boolean
  /** Sin la vista 3D la cámara está en plano y no hay cielo donde dibujar. */
  view3d: boolean
  /** Hasta qué altura del cielo llega la pantalla con el fondo puesto. */
  ceilingDeg: number
}

export function PathNotes({ on, view3d, ceilingDeg }: Props) {
  if (!on) {
    return (
      <p className="dim small">
        Dibuja el arco que recorre el sol hoy, del orto al ocaso, con una marca
        por cada hora en punto. Es lo que se ve cuando el disco no cabe en la
        pantalla, y lo que dice por dónde sale y por dónde se pone HOY —30° más
        al norte en junio que en diciembre—.
      </p>
    )
  }

  return (
    <>
      {(!view3d || ceilingDeg <= 0) && (
        <p className="dim small">
          <strong>Ahora mismo: </strong>
          {!view3d
            ? 'con la vista en plano no hay cielo donde dibujarlo. Enciende la vista 3D e inclina la cámara.'
            : SIN_CIELO}
        </p>
      )}

      <p className="dim small">
        <strong>La carrera del sol</strong> es el camino que recorre hoy, del
        orto al ocaso, con una <strong>marca por cada hora en punto</strong> del
        reloj de la isla: contar marcas hasta el horizonte es contar la luz que
        queda. La marca larga es dónde está ahora. Sale de la misma astronomía
        que ilumina el relieve, muestreada cada {TRACK_STEP_MIN} minutos, que es
        lo que hace falta para que el arco no se lea hecho de trozos rectos.
      </p>

      <p className="dim small">
        <strong>Lo que no se ve es la mitad del dato.</strong> La línea se dibuja
        al fondo de la escena, así que el relieve la tapa: el trozo escondido
        detrás de la Cumbre es exactamente el rato que el sol tarda en asomar por
        encima del filo después de haber salido. En el valle de Aridane eso es
        más de una hora entre el orto del almanaque y el amanecer de verdad, y
        aquí sale dibujado sin calcular nada.
      </p>

      <p className="dim small">
        Por arriba se sale de la pantalla, y no es un fallo: el borde superior
        queda a <span className="mono">{n(Math.max(0, ceilingDeg))}°</span> con
        la vista al tope, así que del arco se ven los dos extremos —que es donde
        está la pregunta— y el mediodía pasa por encima. Se colorea con el color que
        tiene el sol a cada altura, el mismo del disco: blanco arriba, naranja al
        rozar el horizonte.
      </p>
    </>
  )
}
