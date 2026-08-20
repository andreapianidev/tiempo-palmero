/**
 * Los planetas, dentro de la escena nocturna.
 *
 * ENSEÑA LOS QUE SE VEN Y DICE POR QUÉ NO LOS DEMÁS. Es la misma regla del
 * bloque de la luna y la del disco del sol: una casilla marcada y un cielo sin
 * planetas es indistinguible de un fallo, y casi siempre la explicación es
 * mundana — están puestos, o demasiado cerca del sol, o Urano necesita un cielo
 * más oscuro del que hay esta noche.
 *
 * LA COLUMNA DE LA ELONGACIÓN es la que de verdad contesta «¿lo veré?». Un
 * planeta a 12° del sol está sobre el horizonte a la vez que el crepúsculo, y
 * da igual lo brillante que sea. Por eso va al lado de la magnitud y no
 * escondida en una nota.
 */

import { n, t } from '../../i18n'
import type { PlanetsState } from '../../hooks/usePlanets'
import { compassPoint } from '../../lib/stars/tonight'

interface Props {
  planets: PlanetsState
  on: boolean
  onToggle: () => void
  /** Horizonte visible del observador, grados. Negativo desde una cumbre. */
  floorDeg: number
}

export function NightPlanets({ planets, on, onToggle, floorDeg }: Props) {
  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>{t.nightPlanets.layer}</span>
        </label>
      </div>

      <p className="dim small">{t.nightPlanets.hint}</p>

      {planets.loading && (
        <p className="dim small history-loading">
          <span className="spinner" />
          {t.nightPlanets.loading}
        </p>
      )}
      {planets.failed && (
        <p className="warn small">{t.nightPlanets.failed(planets.failed)}</p>
      )}
      {planets.outOfRange && <p className="warn small">{t.nightPlanets.outOfRange}</p>}

      {on && planets.all.length > 0 && (
        <>
          <table className="kv">
            <tbody>
              {planets.all.map((p) => {
                const up = p.apparentElevationDeg > floorDeg
                const seen = planets.visible.includes(p)
                return (
                  <tr key={p.id}>
                    <th>{t.nightPlanets.names[p.id]}</th>
                    <td className={seen ? 'mono' : 'mono dim'}>
                      {up
                        ? t.nightPlanets.value(
                            n(p.apparentElevationDeg, 0),
                            compassPoint(p.azimuthDeg),
                            n(p.magnitude, 1),
                          )
                        : t.nightPlanets.down(n(p.apparentElevationDeg, 0))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Por qué los que no se ven no se ven, uno por uno y en presente. */}
          {planets.all
            .filter((p) => p.apparentElevationDeg > floorDeg && !planets.visible.includes(p))
            .map((p) => (
              <p className="dim small" key={`why-${p.id}`}>
                {p.elongationDeg < 18
                  ? t.nightPlanets.tooCloseToSun(
                      t.nightPlanets.names[p.id],
                      n(p.elongationDeg, 0),
                    )
                  : t.nightPlanets.tooFaint(t.nightPlanets.names[p.id], n(p.magnitude, 1))}
              </p>
            ))}

          <p className="dim small">{t.nightPlanets.scope}</p>
          <p className="dim small">{t.nightPlanets.twinkle}</p>
        </>
      )}
    </>
  )
}
