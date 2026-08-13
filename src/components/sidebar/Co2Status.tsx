/**
 * De qué está hecho el mapa de CO₂, dicho con el denominador honesto.
 *
 * Un campo de gas volcánico enseñado sin decir cuántos sensores lo sostienen
 * es una mancha de color con autoridad prestada. Aquí van las tres cosas sin
 * las que ese color no se puede leer: cuántos sensores exteriores están
 * transmitiendo, cuál es el valor más alto de la red en este momento, y de
 * cuándo es la lectura más vieja que se está pintando.
 *
 * Y una que no es una cifra: hasta dónde llega la red. Es lo que evita que un
 * mapa en blanco sobre Santa Cruz se lea como «aquí no hay CO₂», cuando lo que
 * dice es «aquí no hay sensor».
 */

import { co2Band } from '../../lib/palette'
import type { Co2Field } from '../../lib/co2/field'
import { CO2_NEAR_M } from '../../lib/co2/field'
import { humanAge, n0, t } from '../../i18n'

interface Props {
  field: Co2Field | null
  now: number
}

export function Co2Status({ field, now }: Props) {
  if (!field) {
    return (
      <>
        <p className="warn small">{t.co2.noneLive}</p>
        <p className="note small">{t.variables.co2Scope}</p>
      </>
    )
  }

  const band = co2Band(field.max)

  return (
    <>
      <table className="kv">
        <tbody>
          <tr>
            <td>Sensores exteriores</td>
            <td className="mono">
              {field.nodes.length} <span className="dim">transmitiendo</span>
            </td>
          </tr>
          <tr>
            <td>Máximo de la red</td>
            <td className="mono">
              {n0(field.max)} {t.units.ppm}{' '}
              <span className="dim">{band.label.toLowerCase()}</span>
            </td>
          </tr>
          <tr>
            <td>Lectura más vieja</td>
            <td className="mono">{humanAge(now - field.oldestAt)}</td>
          </tr>
          <tr>
            <td>Alcance de cada sensor</td>
            <td className="mono">{CO2_NEAR_M} m</td>
          </tr>
        </tbody>
      </table>
      <p className="note small">{t.variables.co2NoAverage}</p>
      <p className="note small">{t.variables.co2Scope}</p>
    </>
  )
}
