/**
 * Qué es la capa de webcams, y qué no llegó a entrar en ella.
 *
 * Existe por lo segundo. La lista es corta —dieciocho sitios en una isla que
 * tiene cámaras por todas partes— y sin decir por qué, la ausencia de Puerto
 * Naos o del faro de Fuencaliente parece un descuido. No lo es: una está
 * congelada desde julio y la otra es privada. Un catálogo depurado que no
 * explica su criterio es indistinguible de uno incompleto.
 */

import { t } from '../../i18n'
import { WEBCAM_SITES, webcamViewCount } from '../../lib/webcams/catalog'

export function WebcamStatus() {
  const cabildo = WEBCAM_SITES.filter((s) => s.operator === 'cabildo').length
  const orm = WEBCAM_SITES.filter((s) => s.operator === 'iac').length
  const otras = WEBCAM_SITES.length - cabildo - orm

  return (
    <>
      <table className="kv">
        <tbody>
          <tr>
            <td>{t.webcams.fromCabildo}</td>
            <td className="mono">{cabildo}</td>
          </tr>
          <tr>
            <td>{t.webcams.fromOrm}</td>
            <td className="mono">{orm}</td>
          </tr>
          <tr>
            <td>{t.webcams.fromOthers}</td>
            <td className="mono">{otras}</td>
          </tr>
          <tr>
            <td>{t.webcams.views}</td>
            <td className="mono">{webcamViewCount()}</td>
          </tr>
        </tbody>
      </table>

      <p className="dim small">{t.webcams.cadence}</p>
      <p className="dim small">{t.webcams.excluded}</p>
    </>
  )
}
