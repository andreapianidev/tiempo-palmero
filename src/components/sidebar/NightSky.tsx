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
import { compassPoint } from '../../lib/stars/tonight'
import { NightMoon } from './NightMoon'
import { NightPlanets } from './NightPlanets'
import type { PlanetsState } from '../../hooks/usePlanets'

interface Props {
  sky: NightSkyState
  on: boolean
  onToggle: () => void
  figures: boolean
  onToggleFigures: () => void
  twinkle: boolean
  onToggleTwinkle: () => void
  moon: boolean
  onToggleMoon: () => void
  planets: PlanetsState
  planetsOn: boolean
  onTogglePlanets: () => void
  /** Hasta qué altura del cielo llega la pantalla con el fondo puesto. */
  ceilingDeg: number
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
  moon,
  onToggleMoon,
  planets,
  planetsOn,
  onTogglePlanets,
  ceilingDeg,
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

          {/* La parte que se puede comprobar saliendo a la puerta. Va antes
              del aviso de alcance a propósito: es lo más concreto que este
              panel puede decir. */}
          {sky.tonight.length > 0 && (
            <>
              <h4 className="lbl">{t.nightSky.tonight}</h4>
              <table className="kv">
                <tbody>
                  {sky.tonight.map((s) => (
                    <tr key={s.name}>
                      <th>{s.name}</th>
                      <td className="mono">
                        {t.nightSky.tonightValue(
                          s.elevationDeg,
                          compassPoint(s.azimuthDeg),
                          s.apparentMag,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="dim small">{t.nightSky.tonightScope}</p>
            </>
          )}

          <p className="dim small">{t.nightSky.scope}</p>
          {figures && <p className="dim small">{t.nightSky.figuresScope}</p>}
          {twinkle && <p className="dim small">{t.nightSky.twinkleScope}</p>}
        </>
      )}

      {/*
        LA LUNA VA FUERA DEL `sky.data &&` de arriba a propósito: no depende del
        catálogo. Los 133 KB de estrellas pueden estar descargándose o haber
        fallado, y la luna se sigue viendo igual — en el cielo y en este panel.
      */}
      {on && (
        <>
          <hr className="sep" />
          <NightMoon
            moon={sky.moon}
            on={moon}
            onToggle={onToggleMoon}
            floorDeg={sky.floorDeg}
            ceilingDeg={ceilingDeg}
            view3d={view3d}
          />
          <hr className="sep" />
          <NightPlanets
            planets={planets}
            on={planetsOn}
            onToggle={onTogglePlanets}
            floorDeg={sky.floorDeg}
          />
        </>
      )}
    </>
  )
}
