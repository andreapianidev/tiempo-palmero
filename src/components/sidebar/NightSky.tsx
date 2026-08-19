/**
 * La escena nocturna, dentro de «Experimental».
 *
 * ESTE PANEL TIENE UN TRABAJO Y ES DECIR DE DÓNDE SALE LA CUENTA. «4420
 * estrellas visibles» es una cifra que se cree sola, y detrás de ella puede
 * haber una medida de un fotómetro que está a 3 km o un modelo que no ha mirado
 * el cielo. Las dos son legítimas; confundirlas no. Por eso la fila del origen
 * no es una nota al pie: nombra la estación, dice a qué distancia está y cuánto
 * tiene la lectura, o dice que no hay ninguna y que lo de arriba es una
 * estimación.
 *
 * Y por eso también se enseña el censo del descarte. La red tiene 59 estaciones
 * registradas y de noche miden unas trece: publicar «59 fotómetros» sería
 * verdad y sería mentira.
 */

import { t } from '../../i18n'
import type { NightSkyState } from '../../hooks/useNightSky'

interface Props {
  sky: NightSkyState
  on: boolean
  onToggle: () => void
  figures: boolean
  onToggleFigures: () => void
  twinkle: boolean
  onToggleTwinkle: () => void
  observerElevationM: number
  /** `false` con la vista en plano: no hay cielo en pantalla que enseñar. */
  view3d: boolean
}

export function NightSky({
  sky,
  on,
  onToggle,
  figures,
  onToggleFigures,
  twinkle,
  onToggleTwinkle,
  observerElevationM,
  view3d,
}: Props) {
  const total = sky.data?.catalog.count ?? 0
  const minutes = sky.station
    ? Math.max(0, Math.round((Date.now() - sky.station.station.observedAt) / 60000))
    : 0

  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>{t.nightSky.layer}</span>
        </label>
        {on && (
          <>
            <label>
              <input type="checkbox" checked={figures} onChange={onToggleFigures} />
              <span>{t.nightSky.figures}</span>
            </label>
            <label>
              <input type="checkbox" checked={twinkle} onChange={onToggleTwinkle} />
              <span>{t.nightSky.twinkle}</span>
            </label>
          </>
        )}
      </div>

      <p className="dim small">{t.nightSky.hint}</p>

      {sky.loading && (
        <p className="dim small history-loading">
          <span className="spinner" />
          {t.nightSky.loading}
        </p>
      )}
      {sky.failed && <p className="warn small">{t.nightSky.failed(sky.failed)}</p>}

      {on && !view3d && <p className="dim small">{t.nightSky.needs3d}</p>}

      {on && sky.data && (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t.nightSky.glow}</th>
                <td className="mono">{t.nightSky.glowUnit(sky.glow)}</td>
              </tr>
              <tr>
                <th>{t.nightSky.limit}</th>
                <td className="mono">{sky.limitMag.toFixed(2)}</td>
              </tr>
              <tr>
                <th>{t.nightSky.visible}</th>
                <td className="mono">{t.nightSky.visibleOf(sky.visible, total)}</td>
              </tr>
              <tr>
                <th>{t.nightSky.observer}</th>
                <td className="mono">{t.nightSky.observerValue(observerElevationM)}</td>
              </tr>
              <tr>
                <th>{t.nightSky.extinction}</th>
                <td className="mono">{t.nightSky.extinctionUnit(sky.extinctionK)}</td>
              </tr>
              <tr>
                <th>{t.nightSky.horizon}</th>
                <td className="mono">{t.nightSky.horizonUnit(sky.floorDeg)}</td>
              </tr>
              {sky.network && (
                <tr>
                  <th>{t.nightSky.network}</th>
                  <td className="mono">
                    {t.nightSky.networkValue(
                      sky.network.usable.length,
                      sky.network.registered,
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* De dónde sale el brillo. Es la fila que hace honesta a la de
              arriba: sin ella, «4420 estrellas» parecería siempre medido. */}
          <p className={sky.station ? 'dim small' : 'warn small'}>
            {sky.station
              ? t.nightSky.sourceStation(
                  sky.station.station.name,
                  sky.station.distanceKm,
                  minutes,
                )
              : t.nightSky.sourceModel}
          </p>

          {sky.network && (
            <p className="dim small">
              {t.nightSky.rejectedDetail({
                sunUp: sky.network.rejected['sol-arriba'],
                impossible: sky.network.rejected['valor-imposible'],
                sentinel: sky.network.rejected.centinela,
                stale: sky.network.rejected.vieja,
              })}
            </p>
          )}
          {sky.frozen.length > 0 && (
            <p className="dim small">{t.nightSky.frozen(sky.frozen.length)}</p>
          )}

          <p className="dim small">{t.nightSky.scope}</p>
          {figures && <p className="dim small">{t.nightSky.figuresScope}</p>}
          {twinkle && <p className="dim small">{t.nightSky.twinkleScope}</p>}
        </>
      )}
    </>
  )
}
