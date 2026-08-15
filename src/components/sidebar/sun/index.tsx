/**
 * La luz solar sobre el relieve, dentro de «Experimental». Cuatro casillas y el
 * armazón que las junta; lo que cada una explica vive en su propio fichero.
 *
 * POR QUÉ ES EXPERIMENTAL Y NO EL COMPORTAMIENTO NORMAL. Porque es más real y
 * a la vez menos legible, y las dos cosas son ciertas a la vez.
 *
 * El sombreado fijo del noroeste es una convención cartográfica con dos siglos
 * detrás: se ilumina desde arriba a la izquierda porque el ojo humano
 * interpreta al revés un relieve iluminado desde abajo —el efecto del cráter—,
 * y porque una luz constante deja el mapa siempre igual de legible a cualquier
 * hora. La luz real no hace ninguna de las dos cosas: al amanecer entra rasante
 * por el este y la mitad de la isla se hunde en sombra, y de noche solo queda
 * la luna. Se ve mucho mejor, y se lee peor.
 *
 * Como esta aplicación es primero un instrumento para leer temperaturas y
 * después un mapa bonito, la convención se queda de fábrica y la verdad se
 * ofrece. Quien la encienda sabe lo que gana y lo que pierde, porque está
 * escrito aquí debajo.
 *
 * LAS CUATRO CASILLAS CONTESTAN CUATRO PREGUNTAS DISTINTAS, y por eso no son
 * una con tres subordinadas: hacia dónde mira una ladera (la luz), qué tiene
 * delante (las sombras), dónde está el sol ahora (el disco) y por dónde pasa hoy
 * (la carrera). Cualquiera de las cuatro vale sola.
 *
 * CADA TEXTO SE ENSEÑA CON SU CASILLA, y esto sí es nuevo. Antes se escribían
 * los nueve párrafos siempre, encendido lo que fuera: con solo el disco puesto
 * se leían tres párrafos sobre sombras que no se estaban dibujando y uno sobre
 * el fondo de satélite sin tener el satélite puesto. Un panel que explica lo
 * que no está pasando enseña a no leerlo. Ahora cada bloque se explica en su
 * fichero —`LightNotes`, `ShadowNotes`, `DiscNotes`, `PathNotes`— y sale cuando
 * viene a cuento, con una línea en su lugar cuando está apagado, que es lo que
 * hace falta para decidir si encenderlo.
 *
 * Y LA CIFRA MANDA SOBRE LA PROSA. La casilla del disco se encendía a las
 * cuatro de la tarde y no dibujaba nada —el sol estaba a 68° y la pantalla llega
 * a 3,4°—, con la explicación escondida en el séptimo párrafo y en general.
 * Ahora lo primero que se lee es qué está pasando AHORA, con la altura de este
 * momento y la hora a la que vuelve a entrar en cuadro.
 */

import type { BasemapId } from '../../../lib/basemaps'
import type { SunEvents } from '../../../lib/sky/sun-path'
import type { SkyPosition } from '../../../lib/sun'
import { BasemapNote } from './BasemapNote'
import { DiscNotes } from './DiscNotes'
import { Ephemeris } from './Ephemeris'
import { LightNotes } from './LightNotes'
import { PathNotes } from './PathNotes'
import { ShadowNotes } from './ShadowNotes'

interface Props {
  on: boolean
  onToggle: () => void
  shadows: boolean
  onToggleShadows: () => void
  disc: boolean
  onToggleDisc: () => void
  path: boolean
  onTogglePath: () => void
  sun: SkyPosition
  moon: SkyPosition | null
  /** Fracción iluminada del disco lunar, 0 a 1. */
  moonPhase: number
  /** Orto, ocaso y mediodía de hoy. */
  day: SunEvents
  /**
   * Hasta qué altura del cielo llega la pantalla con el fondo puesto. Negativo
   * donde la cámara no se inclina lo bastante para que entre el horizonte.
   */
  ceilingDeg: number
  /** Cuándo baja el sol de ese techo, por la tarde. */
  ceilingMs: number | null
  /** El fondo puesto: decide qué hace la luz sobre él. */
  basemap: BasemapId
  /** La vista 3D. Sin ella la cámara está en plano y no hay cielo. */
  view3d: boolean
  /** La escena atmosférica: sin ella no hay nubes que echen sombra. */
  clouds: boolean
  /** Dejar la vista en condiciones de ver el cielo, de un golpe. */
  onPrepareSky: () => void
}

export function SunLight(props: Props) {
  const anyOn = props.on || props.shadows || props.disc || props.path

  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={props.on} onChange={props.onToggle} />
          <span>Luz del sol real</span>
        </label>
        <label>
          <input type="checkbox" checked={props.shadows} onChange={props.onToggleShadows} />
          <span>Sombras arrojadas</span>
        </label>
        <label>
          <input type="checkbox" checked={props.disc} onChange={props.onToggleDisc} />
          <span>El disco del sol</span>
        </label>
        <label>
          <input type="checkbox" checked={props.path} onChange={props.onTogglePath} />
          <span>La carrera del sol</span>
        </label>
      </div>

      {anyOn && (
        <Ephemeris
          sun={props.sun}
          moon={props.moon}
          moonPhase={props.moonPhase}
          day={props.day}
          shadows={props.shadows}
          path={props.path}
          light={props.on}
        />
      )}

      <LightNotes
        on={props.on}
        sun={props.sun}
        moon={props.moon}
        moonPhase={props.moonPhase}
      />
      <ShadowNotes on={props.shadows} clouds={props.clouds} />
      <DiscNotes
        on={props.disc}
        sun={props.sun}
        day={props.day}
        ceilingDeg={props.ceilingDeg}
        ceilingMs={props.ceilingMs}
        view3d={props.view3d}
        onPrepareSky={props.onPrepareSky}
      />
      <PathNotes
        on={props.path}
        view3d={props.view3d}
        ceilingDeg={props.ceilingDeg}
        onPrepareSky={props.onPrepareSky}
      />
      <BasemapNote basemap={props.basemap} on={props.on} shadows={props.shadows} />
    </>
  )
}
