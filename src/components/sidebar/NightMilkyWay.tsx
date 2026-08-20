/**
 * La Vía Láctea, dentro de la escena nocturna.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE BLOQUE TIENE UN TRABAJO QUE NO TIENEN LOS OTROS: decir que esto NO es
 * una fotografía. La luna, los planetas y las estrellas salen de efemérides y
 * de un catálogo; esto sale de cinco curvas de nivel dibujadas, rasterizadas y
 * suavizadas. Se parece a una foto y no lo es, y quien lo mira tiene derecho a
 * saberlo sin abrir el código.
 *
 * LO QUE SÍ SE MIDE, y por eso la cifra del fotómetro va en este bloque y no
 * escondida: **cuánto se ve**. La banda se divide contra el brillo del fondo
 * que publican los fotómetros del Cabildo, así que la misma Vía Láctea sale a
 * la mitad de brillo con la luna en cuarto y desaparece con luna llena — y esa
 * es la parte comprobable, la que se puede contrastar saliendo a la puerta.
 *
 * ENSEÑA LA FRACCIÓN, no la opacidad de pantalla. Es el número con significado
 * físico: qué parte de la luz que llega de esa dirección la pone ella.
 */

import { n, t } from '../../i18n'
import type { MilkyWayState } from '../../hooks/useMilkyWay'
import { milkyWayFraction } from '../../lib/sky/vialactea'

interface Props {
  milkyWay: MilkyWayState
  on: boolean
  onToggle: () => void
  /** El fondo de cielo de ahora mismo, mag/arcsec². */
  skyMag: number
  /** De dónde sale esa cifra: un fotómetro o el modelo. */
  measured: boolean
}

export function NightMilkyWay({ milkyWay, on, onToggle, skyMag, measured }: Props) {
  const fraction = milkyWayFraction(200, skyMag)

  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>{t.nightMilkyWay.layer}</span>
        </label>
      </div>

      <p className="dim small">{t.nightMilkyWay.hint}</p>

      {milkyWay.loading && (
        <p className="dim small history-loading">
          <span className="spinner" />
          {t.nightMilkyWay.loading}
        </p>
      )}
      {milkyWay.failed && (
        <p className="warn small">{t.nightMilkyWay.failed(milkyWay.failed)}</p>
      )}

      {on && milkyWay.map && (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t.nightMilkyWay.sky}</th>
                <td>
                  {n(skyMag, 2)} {t.nightMilkyWay.unit}
                  <span className="dim">
                    {' '}
                    ·{' '}
                    {measured ? t.nightMilkyWay.fromPhotometer : t.nightMilkyWay.fromModel}
                  </span>
                </td>
              </tr>
              <tr>
                <th>{t.nightMilkyWay.share}</th>
                <td>{n(fraction * 100, 1)} %</td>
              </tr>
            </tbody>
          </table>
          <p className="dim small">{t.nightMilkyWay.shareScope}</p>
        </>
      )}

      {on && <p className="dim small">{t.nightMilkyWay.scope}</p>}
    </>
  )
}
