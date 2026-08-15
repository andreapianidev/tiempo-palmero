/**
 * La luz solar sobre el relieve, dentro de «Experimental».
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
 * LO QUE ARREGLA, que es lo que la justifica: la aplicación ya dibujaba el
 * reflejo del sol sobre el mar en su sitio real y las nubes encendidas por la
 * cara que les da la luz. La isla que había en medio seguía iluminada desde el
 * noroeste. Eran tres soles distintos en la misma pantalla.
 */

import { n0 } from '../../i18n'
import type { SkyPosition } from '../../lib/sun'

interface Props {
  on: boolean
  onToggle: () => void
  sun: SkyPosition
  moon: SkyPosition | null
  /** Fracción iluminada del disco lunar, 0 a 1. */
  moonPhase: number
}

/** El rumbo, en la rosa de los vientos. Un acimut en grados no dice nada. */
function compass(deg: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
  return points[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

export function SunLight({ on, onToggle, sun, moon, moonPhase }: Props) {
  const isDay = sun.elevationDeg > -6
  const moonUp = moon !== null && moon.elevationDeg > -2

  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>Luz del sol real</span>
        </label>
      </div>

      <p className="dim small">
        El relieve se ilumina desde donde está el sol ahora mismo, en vez de
        desde el noroeste fijo de la convención cartográfica. Es la misma
        posición con la que ya se dibuja el reflejo sobre el mar y la cara
        encendida de las nubes: con esto, las tres cosas dejan de contradecirse.
      </p>

      {on && (
        <table className="kv">
          <tbody>
            <tr>
              <th>Sol</th>
              <td className="mono">
                {sun.elevationDeg > 0
                  ? `${n0(sun.elevationDeg)}° sobre el horizonte · ${compass(sun.azimuthDeg)}`
                  : `${n0(-sun.elevationDeg)}° bajo el horizonte`}
              </td>
            </tr>
            <tr>
              <th>Luna</th>
              <td className="mono">
                {moonUp
                  ? `${Math.round(moonPhase * 100)} % · ${compass(moon!.azimuthDeg)}`
                  : 'bajo el horizonte'}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {on && !isDay && (
        <p className="dim small">
          {moonUp && moonPhase > 0.15
            ? 'De noche ilumina la luna, desde donde está y con la luz que le corresponde a su fase: fría, floja y de sombras suaves.'
            : 'Sin luna que ilumine, el relieve queda apenas insinuado por la luz del cielo. Se deja un mínimo de sombreado a propósito: la isla se sigue usando de noche para leer la temperatura, y sin forma se lee peor.'}
        </p>
      )}

      <p className="dim small">
        <strong>Se ve mejor y se lee peor</strong>, y por eso no viene puesta. La
        luz fija del noroeste no es un descuido: es una convención con dos siglos
        detrás que deja el mapa igual de legible a cualquier hora. La real hunde
        media isla en sombra al amanecer.
      </p>

      <p className="dim small">
        No dibuja sombras arrojadas: el sombreado de MapLibre sabe hacia dónde
        mira cada ladera, pero no sabe que la pared de la Caldera le tapa el sol
        al barranco de al lado.
      </p>
    </>
  )
}
