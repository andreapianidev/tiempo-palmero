/**
 * Lo que hay que decir de «El disco del sol» —y, sobre todo, por qué ahora
 * mismo no se ve.
 *
 * ESTE ES EL ARREGLO QUE PEDÍA ESTA CASILLA. Es la única de las cuatro que se
 * enciende y, la mayor parte del día, no dibuja nada: el sol solo entra en
 * cuadro por debajo de 3,4° de altura, que son un rato al amanecer y otro al
 * atardecer. Antes eso estaba explicado en un párrafo fijo, en pasiva y en
 * general, debajo de otros seis párrafos que hablaban de otras funciones. A las
 * cuatro de la tarde, con el sol a 68°, lo que se leía era una explicación y lo
 * que se veía era una casilla marcada sin efecto: indistinguible de un fallo.
 *
 * AHORA LO DICE EN PRESENTE Y CON LA CIFRA DE HOY: dónde está el sol, hasta
 * dónde llega la pantalla, y a qué hora vuelve a entrar. Y el 3,4° no está
 * escrito a mano —sale de la inclinación máxima y del campo de visión, ver
 * `lib/sky/sun-screen.ts`—, así que el día que se toque el tope de la cámara
 * esta frase seguirá siendo verdad.
 */

import { formatIslandClock } from '../../../lib/cabildo'
import { n, n0 } from '../../../i18n'
import { SKY_CEILING_DEG } from '../../../lib/sky/sun-screen'
import type { SunEvents } from '../../../lib/sky/sun-path'
import type { SkyPosition } from '../../../lib/sun'
import { compass } from './Ephemeris'

interface Props {
  on: boolean
  sun: SkyPosition
  day: SunEvents
  /**
   * Hasta qué altura del cielo llega la pantalla con este fondo. Negativo con
   * los de GRAFCAN: ahí la cámara se queda en 65° y no hay cielo en cuadro.
   */
  ceilingDeg: number
  /** Cuándo baja el sol de ese techo, por la tarde. */
  ceilingMs: number | null
  /** Sin la vista 3D la cámara está en plano y no hay cielo donde dibujar. */
  view3d: boolean
}

export function DiscNotes({ on, sun, day, ceilingDeg, ceilingMs, view3d }: Props) {
  if (!on) {
    return (
      <p className="dim small">
        Dibuja el sol donde está, a los <span className="mono">0,53°</span> que
        mide de verdad. Se ve poco rato: solo entra en cuadro con el sol muy
        bajo, cerca del orto y del ocaso, y con la vista inclinada al tope.
      </p>
    )
  }

  return (
    <>
      <p className="dim small">
        <strong>Ahora mismo: </strong>
        {estado(sun, day, ceilingDeg, ceilingMs, view3d)}
      </p>

      <p className="dim small">
        <strong>El disco del sol</strong> tiene casilla propia porque dibujar un
        sol sobre un mapa de datos es una decisión de quien mira, no del
        programa. Se dibuja a{' '}
        <span className="mono">0,53°</span>, que es lo que mide de verdad —el
        error más repetido en una escena 3D es un sol de cartel—, con el color
        que le corresponde a su altura y con la aureola apagándose según el aire
        que el rayo atraviesa. El relieve lo tapa cuando se pone delante, sin
        cálculo ninguno: se dibuja al fondo de la escena.
      </p>

      <p className="dim small">
        La ventana es estrecha porque la pantalla se acaba: con el fondo de casa
        y la vista al tope, el borde de arriba queda a{' '}
        <span className="mono">{n(SKY_CEILING_DEG)}°</span> sobre el horizonte
        —75° de inclinación y 18,4° de medio campo de visión—, así que el sol
        solo sale en cuadro estando más bajo que eso y mirando hacia él. El resto
        del día está ahí, encima de la pantalla, iluminando todo lo demás. Para
        verlo a cualquier hora está la casilla de abajo, que dibuja el camino
        entero.
      </p>
    </>
  )
}

/** Qué está pasando con el disco en este instante, en una frase. */
function estado(
  sun: SkyPosition,
  day: SunEvents,
  ceilingDeg: number,
  ceilingMs: number | null,
  view3d: boolean,
): string {
  if (!view3d) {
    return 'con la vista en plano no hay cielo donde dibujarlo. Enciende la vista 3D e inclina la cámara.'
  }
  if (ceilingDeg <= 0) return SIN_CIELO
  if (sun.elevationDeg <= 0) {
    const orto = day.sunrise ? ` Sale a las ${formatIslandClock(day.sunrise.at)}.` : ''
    return `el sol está bajo el horizonte, así que no hay disco que dibujar.${orto}`
  }
  if (sun.elevationDeg > ceilingDeg) {
    const vuelve = ceilingMs ? ` Vuelve a entrar hacia las ${formatIslandClock(ceilingMs)}.` : ''
    return `el sol está a ${n0(sun.elevationDeg)}° y la pantalla llega a ${n(ceilingDeg)}°: queda fuera de cuadro por arriba.${vuelve}`
  }
  return `el sol está a ${n(sun.elevationDeg)}°, dentro de la ventana. Inclina la vista al tope y mira hacia el ${compass(sun.azimuthDeg)}.`
}

/**
 * El caso del fondo que no deja mirar arriba, escrito una vez: lo dicen las dos
 * casillas que dibujan en el cielo, y con la misma frase.
 */
export const SIN_CIELO =
  'con este fondo la cámara solo se inclina hasta 65°, y con esa inclinación el horizonte no llega a entrar en pantalla. Hace falta el fondo de relieve, que llega a 75°.'
