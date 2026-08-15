/**
 * La escena atmosférica, dentro de «Experimental».
 *
 * ESTE BLOQUE TIENE QUE SEPARAR DOS COSAS, y es su trabajo principal. La escena
 * es lo más vistoso de la aplicación y lo más fácil de confundir con un
 * radar: alguien que vea una nube encima de Tijarafe puede pensar
 * razonablemente que ahí hay una nube, ahora, con esa forma. Y no es eso. Lo
 * que hay es un porcentaje de nubosidad por estrato, de un modelo, con celdas
 * de 5 km; la nube CONCRETA que se dibuja es una representación de esa cifra.
 *
 * Así que el panel enseña las cifras crudas al lado del interruptor —cuánta
 * nubosidad por piso, cuántos puntos con lluvia, a qué cota está la capa baja y
 * de dónde sale esa cota— para que se pueda juzgar lo que se está viendo. Es la
 * misma regla que sigue el mar de nubes con su banda de ±493 m.
 */

import { t } from '../../i18n'
import { n0 } from '../../i18n'
import type { SkyState } from '../../hooks/useSky'
import { rainingCount, skyAverage } from '../../lib/sky/field'

interface Props {
  sky: SkyState
  on: boolean
  onToggle: () => void
}

const pct = (v: number) => `${Math.round(v)} %`

export function Sky3D({ sky, on, onToggle }: Props) {
  const avg = skyAverage(sky.grid)
  const raining = rainingCount(sky.grid)

  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>{t.sky3d.layer}</span>
        </label>
      </div>

      <p className="dim small">{t.sky3d.hint}</p>

      {sky.loading && (
        <p className="dim small history-loading">
          <span className="spinner" />
          {t.sky3d.loading}
        </p>
      )}
      {sky.failed && <p className="warn small">{t.sky3d.failed}</p>}

      {on && avg && (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t.sky3d.low}</th>
                <td className="mono">{pct(avg.low)}</td>
              </tr>
              <tr>
                <th>{t.sky3d.mid}</th>
                <td className="mono">{pct(avg.mid)}</td>
              </tr>
              <tr>
                <th>{t.sky3d.high}</th>
                <td className="mono">{pct(avg.high)}</td>
              </tr>
              <tr>
                <th>{t.sky3d.rain}</th>
                <td className="mono">{t.sky3d.rainValue(raining)}</td>
              </tr>
              <tr>
                <th>{t.sky3d.base}</th>
                <td className="mono">
                  {n0(sky.lowBase)}–{n0(sky.lowTop)} m
                </td>
              </tr>
            </tbody>
          </table>

          {/* De dónde sale la cota de la capa baja. Es la diferencia entre una
              nube puesta donde el sondeo dice que está y una puesta donde suele
              estar, y quien mira tiene derecho a saber cuál de las dos ve. */}
          <p className="dim small">{t.sky3d.baseSource[sky.lowSource]}</p>
          <p className="dim small">{t.sky3d.shading}</p>
          <p className="dim small">{t.sky3d.crossShading}</p>
          <p className="dim small">{t.sky3d.haze}</p>
          <p className="dim small">{t.sky3d.scope}</p>
        </>
      )}
    </>
  )
}
