/**
 * La luna, dentro de la escena nocturna.
 *
 * ESTE BLOQUE TIENE UN TRABAJO Y ES EL MISMO QUE EL DE `DiscNotes`: decir por
 * qué la casilla está marcada y en pantalla no hay ninguna luna. Casi siempre la
 * respuesta es que está demasiado alta —la pantalla solo enseña hasta 3,4° de
 * altura con el relieve de casa—, y la segunda vez que pasa eso sin explicación
 * la casilla se lee como rota.
 *
 * Y TIENE UN SEGUNDO TRABAJO, que es distinguir lo dibujado de lo medido, igual
 * que hace el bloque de las estrellas con el fotómetro. La posición, la fase y
 * el tamaño son efeméride; la luz que echa sobre el mar es un modelo publicado;
 * el brillo del propio disco en la pantalla es dibujo, porque la luna llena es
 * dieciocho magnitudes más brillante que el cielo y eso en un monitor no cabe.
 */

import { n, n0, t } from '../../i18n'
import { moonPhaseName } from '../../lib/moon-phase'
import { relativeMoonlight } from '../../lib/moon-brightness'
import type { MoonSight } from '../../lib/moon'
import { compassPoint } from '../../lib/stars/tonight'

interface Props {
  moon: MoonSight
  on: boolean
  onToggle: () => void
  /** Horizonte visible del observador, grados. Negativo desde una cumbre. */
  floorDeg: number
  /**
   * Hasta qué altura del cielo llega la pantalla con el fondo puesto. Negativo
   * donde la cámara no se inclina lo bastante para que entre el horizonte.
   */
  ceilingDeg: number
  /** `false` con la vista en plano: no hay cielo en pantalla. */
  view3d: boolean
}

export function NightMoon({ moon, on, onToggle, floorDeg, ceilingDeg, view3d }: Props) {
  const up = moon.apparentElevationDeg > floorDeg
  const inFrame = up && moon.apparentElevationDeg <= ceilingDeg
  const phase = moonPhaseName(moon.illumination, moon.waxing)
  const light = relativeMoonlight(moon.illumination) * 100

  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>{t.nightMoon.layer}</span>
        </label>
      </div>

      <table className="kv">
        <tbody>
          <tr>
            <th>{t.nightMoon.phase}</th>
            <td className="mono">
              {t.nightMoon.phaseValue(t.nightMoon.names[phase], n0(moon.illumination * 100))}
            </td>
          </tr>
          <tr>
            <th>{t.nightMoon.where}</th>
            <td className="mono">
              {up
                ? t.nightMoon.whereValue(
                    n(moon.apparentElevationDeg, 1),
                    compassPoint(moon.azimuthDeg),
                  )
                : t.nightMoon.whereDown(n(moon.apparentElevationDeg, 1))}
            </td>
          </tr>
          <tr>
            <th>{t.nightMoon.size}</th>
            <td className="mono">
              {t.nightMoon.sizeValue(n(moon.angularDiameterDeg * 60, 1), n0(moon.topocentricKm))}
            </td>
          </tr>
          <tr>
            <th>{t.nightMoon.light}</th>
            <td className="mono">
              {/* Una luna fina echa el 0,7 % de la llena: con un decimal se
                  quedaría en «0,7 %» y con cero en «1 %», que es diez veces
                  más. Por debajo del 1 % hacen falta dos. */}
              {t.nightMoon.lightValue(
                light < 1 ? n(light, 2) : n0(light),
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Por qué no se ve, en presente y con la cifra de ahora. */}
      {on && view3d && up && !inFrame && (
        <p className="dim small">
          {t.nightMoon.tooHigh(n(moon.apparentElevationDeg, 1), n(ceilingDeg, 1))}
        </p>
      )}
      {on && view3d && !up && <p className="dim small">{t.nightMoon.below}</p>}

      <p className="dim small">{t.nightMoon.scope}</p>
      <p className="dim small">{t.nightMoon.sea}</p>
    </>
  )
}
