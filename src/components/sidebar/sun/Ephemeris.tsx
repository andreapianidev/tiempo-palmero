/**
 * Las cifras del sol de hoy: dónde está, cuánto quita su sombra, a qué hora y
 * por dónde sale y se pone, y qué luna hay.
 *
 * CADA FILA APARECE CON SU FUNCIÓN ENCENDIDA, y esa es toda la regla. La fila de
 * la sombra no significa nada sin sombras; el orto y el ocaso son las cifras del
 * camino del sol, y sin camino dibujado sobran. Una tabla que enseña siempre
 * todas las filas obliga a leer cuatro para encontrar la que importa.
 *
 * EL RUMBO VA EN LA ROSA DE LOS VIENTOS y no en grados: «286°» no le dice nada a
 * nadie mirando una isla, «ONO» se busca en el mapa.
 */

import { formatIslandClock } from '../../../lib/cabildo'
import { n0 } from '../../../i18n'
import { shadowDepth } from '../../../lib/shadow/depth'
import type { SunEvents } from '../../../lib/sky/sun-path'
import type { SkyPosition } from '../../../lib/sun'

interface Props {
  sun: SkyPosition
  moon: SkyPosition | null
  moonPhase: number
  day: SunEvents
  shadows: boolean
  /** El orto y el ocaso son las cifras del camino: van con él. */
  path: boolean
  /** La luna solo la calcula la luz real, y solo de noche. */
  light: boolean
}

/** El rumbo, en la rosa de los vientos. Un acimut en grados no dice nada. */
export function compass(deg: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
  return points[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
}

export function Ephemeris({ sun, moon, moonPhase, day, shadows, path, light }: Props) {
  const moonUp = moon !== null && moon.elevationDeg > -2
  const horas = day.daylightHours

  return (
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
        {shadows && sun.elevationDeg > 0 && (
          <tr>
            <th>Sombra</th>
            <td className="mono">
              quita el {Math.round(shadowDepth(sun.elevationDeg) * 100)} % de la luz
            </td>
          </tr>
        )}
        {path && day.sunrise && (
          <tr>
            <th>Sale</th>
            <td className="mono">
              {formatIslandClock(day.sunrise.at)} · {compass(day.sunrise.azimuthDeg)}
            </td>
          </tr>
        )}
        {path && day.sunset && (
          <tr>
            <th>Se pone</th>
            <td className="mono">
              {formatIslandClock(day.sunset.at)} · {compass(day.sunset.azimuthDeg)}
            </td>
          </tr>
        )}
        {path && horas !== null && (
          <tr>
            <th>Luz</th>
            <td className="mono">
              {Math.floor(horas)} h {Math.round((horas % 1) * 60)} min
            </td>
          </tr>
        )}
        {light && (
          <tr>
            <th>Luna</th>
            <td className="mono">
              {moonUp
                ? `${Math.round(moonPhase * 100)} % · ${compass(moon!.azimuthDeg)}`
                : 'bajo el horizonte'}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
