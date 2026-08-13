/**
 * Panel del punto consultado.
 *
 * Regla de esta pantalla: un valor interpolado no es una medida, y aquí se
 * nota. Cada estimación lleva su margen, su etiqueta de «estimado» y la lista
 * de qué estaciones la sostienen, con distancia y desnivel. Quien mire esto
 * tiene que poder decidir por su cuenta si se lo cree.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  estimateBundle,
  medianPressure,
  nearestWith,
  type Bundle,
  type DisplayVariable,
  type InterpolableVariable,
  type Model,
} from '../lib/interpolate'
import type { Station } from '../lib/quality'
import { cssColor, type RgbStop } from '../lib/palette'
import { freshness } from '../lib/quality'
import {
  findNearby,
  NEARBY_VISIBLE,
  type NearbyItem,
  type NearbyKind,
} from '../lib/nearby'
import {
  formatIsoDate,
  loadGuaguaNetwork,
  type GuaguaNetwork,
} from '../lib/guagua/network'
import { VARIABLES, VARIABLE_ORDER } from '../lib/variables'
import { ParcelBlock } from './ParcelBlock'
import type { EtoField } from '../lib/agro/eto'
import { n, n0, t, humanAge } from '../i18n'
import type { Dem } from '../lib/dem'
import { PointHistory } from './PointHistory'

export interface ProbePoint {
  lon: number
  lat: number
  elevation: number | null
  municipality: string | null
  label?: string
}

interface Props {
  /** Hace falta para reconstruir el pasado en este punto. */
  dem: Dem | null
  /** Estaciones averiadas: fuera de la reconstrucción, como lo están de hoy. */
  faulty: ReadonlySet<string>
  point: ProbePoint
  models: Record<InterpolableVariable, Model | null>
  stations: Station[]
  variable: DisplayVariable
  stops: RgbStop[]
  /** Campo de ETo, si la sección de agricultura está abierta. */
  eto: EtoField | null
  now: number
  onClose: () => void
}

/** Un glifo por categoría. Sin fuentes de iconos: son caracteres. */
const KIND_ICON: Record<NearbyKind, string> = {
  trail: '⛰',
  trailPoi: '◆',
  recreation: '⛺',
  tourism: '★',
  // El ojo del mirador. No se repite el monte de los senderos: lo que distingue
  // un mirador de una cumbre es que se mira desde él, no que sea alto.
  viewpoint: '◉',
  culture: '❖',
  history: '⌂',
  busStop: '⬤',
  charging: '⚡',
}

export function PointPanel({
  point,
  models,
  stations,
  variable,
  stops,
  dem,
  faulty,
  eto,
  now,
  onClose,
}: Props) {
  const elevation = point.elevation

  // Un solo cálculo para todas las variables. Interpolarlas por separado dejaba
  // que se contradijeran entre sí: se llegó a ver 99 % de humedad junto a un
  // punto de rocío de −7,9 °C a la misma altitud, que no es impreciso sino
  // imposible.
  const bundle: Bundle = useMemo(
    () =>
      elevation === null
        ? { temperature: null, relativehumidity: null, dewpoint: null, vpd: null }
        : estimateBundle(models, point.lon, point.lat, elevation),
    [models, point.lon, point.lat, elevation],
  )

  const main = bundle[variable]

  const secondary = useMemo(
    () =>
      VARIABLE_ORDER.filter((v) => v !== variable)
        .map((v) => (bundle[v] ? { variable: v, est: bundle[v]! } : null))
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [bundle, variable],
  )

  const wind = useMemo(
    () =>
      elevation === null
        ? null
        : nearestWith(stations, point.lon, point.lat, elevation, 'windspeed'),
    [stations, point.lon, point.lat, elevation],
  )

  const uv = useMemo(
    () =>
      elevation === null ? null : nearestWith(stations, point.lon, point.lat, elevation, 'uv'),
    [stations, point.lon, point.lat, elevation],
  )

  const pressure = useMemo(() => medianPressure(stations), [stations])

  const rain = useMemo(
    () =>
      elevation === null
        ? null
        : nearestWith(stations, point.lon, point.lat, elevation, 'dailyprecipitation'),
    [stations, point.lon, point.lat, elevation],
  )

  const spec = VARIABLES[variable]
  const unit = spec.unit
  const decimals = spec.decimals

  return (
    <section className="panel point-panel" aria-label={t.point.title}>
      <button className="panel-close" onClick={onClose} aria-label={t.point.close}>
        ×
      </button>

      <header className="point-head">
        <h2>{point.label ?? t.point.title}</h2>
        <p className="mono dim">
          {n(point.lat, 4)}, {n(point.lon, 4)}
          {elevation !== null && <> · {n0(elevation)} {t.units.metres}</>}
          {point.municipality && <> · {point.municipality}</>}
          {!point.municipality && <> · {t.point.outsideIsland}</>}
        </p>
      </header>

      {elevation === null && <p className="warn">{t.errors.demFailed}</p>}

      {main && (
        <>
          <div className="reading">
            <b style={{ color: cssColor(stops, main.value) }}>
              {n(main.value, decimals)}
            </b>
            <span className="reading-unit">
              {unit}
              <em>{spec.derived ? t.point.derived : t.point.estimated}</em>
            </span>
          </div>

          <p className="uncertainty mono">
            {t.point.uncertainty} ± {n(main.uncertainty, decimals)} {unit}
            <span className="dim"> · {t.point.notAMeasurement}</span>
          </p>

          {/* Cuándo se MIDIÓ lo que sostiene la cifra. Es distinto de cuándo se
              descargó: los datos pueden ser de hace 10 segundos y las lecturas
              de hace hora y media, y es lo segundo lo que dice si el número
              sigue valiendo. */}
          <p className="freshness mono" title={t.point.measuredAtHint}>
            <span className={`dot dot-${freshness((now - main.observedAt) / 3_600_000)}`} />
            <span className="nowrap">
              {/* En la cumbre parte de la cifra la pone un modelo, y su
                  `observedAt` es la hora de la pasada. Llamar «medido» a eso
                  sería fechar un pronóstico como si fuera un termómetro. */}
              {main.contributors.some((c) => c.source === 'openmeteo')
                ? t.point.validAt
                : t.point.measuredAt}{' '}
              {humanAge(now - main.observedAt)}
            </span>
            {main.oldestObservedAt < main.observedAt - 60_000 && (
              <span className="dim nowrap">
                · {t.point.oldestContribution} {humanAge(now - main.oldestObservedAt)}
              </span>
            )}
          </p>

          {now - main.observedAt > 3_600_000 && (
            <p className="warn">{t.point.staleWarning}</p>
          )}

          {spec.hint && <p className="note small">{spec.hint}</p>}

          {main.extrapolated && <p className="warn">{t.point.extrapolated}</p>}
          {main.elevationExtrapolated && (
            <p className="warn">{t.point.elevationExtrapolated}</p>
          )}

          {secondary.length > 0 && (
            <ul className="secondary-readings">
              {secondary.map(({ variable: v, est }) => (
                <li key={v}>
                  <span className="dim">{VARIABLES[v].label}</span>
                  <span className="mono">
                    {n(est.value, VARIABLES[v].decimals)} {VARIABLES[v].unit}
                    <em className="dim"> ± {n(est.uncertainty, VARIABLES[v].decimals)}</em>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <details className="contributors" open>
            <summary>{t.point.contributors}</summary>
            <table>
              <thead>
                <tr>
                  <th>{t.layers.stations}</th>
                  <th>{t.point.distance}</th>
                  <th>{t.point.elevationDelta}</th>
                  <th>{t.point.weight}</th>
                </tr>
              </thead>
              <tbody>
                {main.contributors.map((c) => (
                  <tr key={c.entityId}>
                    <td>
                      {c.name}
                      {/* Un aporte de modelo NUNCA sale con aspecto de medida:
                          va marcado aquí y explicado bajo la tabla. */}
                      {c.source === 'openmeteo' && (
                        <em className="contrib-model" title={t.model.anchorHint}>
                          {' '}
                          {t.model.anchorTag}
                        </em>
                      )}
                      <em className="contrib-age dim">{humanAge(now - c.observedAt)}</em>
                    </td>
                    <td className="mono">{n(c.distanceKm, 1)} {t.units.km}</td>
                    <td className="mono">
                      {c.elevationDelta >= 0 ? '+' : '−'}
                      {n0(Math.abs(c.elevationDelta))} {t.units.metres}
                    </td>
                    <td className="mono">{Math.round(c.weightShare * 100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {main.contributors.some((c) => c.source === 'openmeteo') && (
              <p className="warn small">{t.model.anchorNote}</p>
            )}
          </details>
        </>
      )}

      {!main && elevation !== null && <p className="warn">{t.errors.noStations}</p>}

      {/* Viento y lluvia: se muestra la estación, no una estimación del punto. */}
      <section className="nearest-block">
        <h3>{t.point.nearestOnly}</h3>
        <p className="dim small">{t.point.noInterpolation}</p>
        <ul className="secondary-readings">
          {wind && (
            <li>
              <span className="dim">
                {t.variables.wind}
                <em className="mono"> · {wind.station.name}</em>
              </span>
              <span className="mono">
                {n0(wind.station.windspeed ?? 0)} {t.units.kmh}
                {wind.station.winddirection !== null && (
                  <>
                    {' '}
                    <span
                      className="wind-arrow"
                      style={{ transform: `rotate(${wind.station.winddirection + 180}deg)` }}
                      aria-hidden
                    >
                      ↑
                    </span>
                  </>
                )}
              </span>
            </li>
          )}
          {wind && (
            <li className="sub mono dim">
              {n(wind.distanceKm, 1)} {t.units.km} ·{' '}
              {wind.elevationDelta >= 0 ? '+' : '−'}
              {n0(Math.abs(wind.elevationDelta))} {t.units.metres} ·{' '}
              {humanAge(now - wind.station.timeinstant)}
            </li>
          )}
          {rain && (
            <li>
              <span className="dim">
                {t.variables.precipitation}
                <em className="mono"> · {rain.station.name}</em>
              </span>
              <span className="mono">{n(rain.station.dailyprecipitation ?? 0, 1)} mm</span>
            </li>
          )}
          {uv && uv.station.uv !== null && (
            <li title={t.point.uvHint}>
              <span className="dim">
                {t.variables.uv}
                <em className="mono"> · {uv.station.name}</em>
              </span>
              <span className="mono">{n0(uv.station.uv)}</span>
            </li>
          )}
          {pressure !== null && (
            <li title={t.point.pressureHint}>
              <span className="dim">
                {t.variables.pressure}
                <em className="mono"> · {t.point.islandMedian}</em>
              </span>
              <span className="mono">{n0(pressure)} {t.units.hpa}</span>
            </li>
          )}
        </ul>
      </section>

      {/* La curva va DESPUÉS del dato de ahora y ANTES de lo que hay cerca: es
          la misma pregunta que el número de arriba, extendida hacia atrás. */}
      {elevation !== null && (
        <PointHistory
          lon={point.lon}
          lat={point.lat}
          elevation={elevation}
          dem={dem}
          excluded={faulty}
          now={now}
        />
      )}

      {/* Qué se cultiva aquí. Sólo si el punto tiene cota: sin ella no hay
          demanda de agua que calcular, y sin la demanda el bloque diría la
          mitad. */}
      {elevation !== null && (
        <ParcelBlock
          lon={point.lon}
          lat={point.lat}
          elevationM={elevation}
          eto={eto}
        />
      )}

      <NearbySection lon={point.lon} lat={point.lat} />
    </section>
  )
}

/**
 * «Cerca de aquí». Se carga bajo demanda y por su cuenta: son 10 MB de capas
 * y la mayoría de las visitas no llegan a tocar el mapa, así que no tiene
 * sentido pagarlas al arrancar. Mientras busca, el resto del panel ya está.
 */
function NearbySection({ lon, lat }: { lon: number; lat: number }) {
  const [items, setItems] = useState<NearbyItem[] | null>(null)
  const [guagua, setGuagua] = useState<GuaguaNetwork | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setExpanded(false)
    findNearby(lon, lat).then((r) => !cancelled && setItems(r))
    loadGuaguaNetwork().then((g) => !cancelled && setGuagua(g))
    return () => {
      cancelled = true
    }
  }, [lon, lat])

  const shown = items === null ? [] : expanded ? items : items.slice(0, NEARBY_VISIBLE)
  const hidden = (items?.length ?? 0) - shown.length
  const hasBusStop = shown.some((i) => i.kind === 'busStop')

  return (
    <section className="nearest-block">
      <h3>{t.nearby.title}</h3>
      {items === null && <p className="dim small">{t.nearby.loading}</p>}
      {items !== null && items.length === 0 && (
        <p className="dim small">{t.nearby.empty}</p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="nearby-list">
          {shown.map((it, i) => (
            <li key={`${it.kind}-${it.name}-${i}`}>
              <span className={`nearby-icon nearby-${it.kind}`} aria-hidden>
                {KIND_ICON[it.kind]}
              </span>
              <span className="nearby-body">
                <span className="nearby-name">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noreferrer">
                      {it.name}
                    </a>
                  ) : (
                    it.name
                  )}
                </span>
                <span className="nearby-detail dim">
                  {t.nearby.kinds[it.kind]}
                  {it.detail && <> · {it.detail}</>}
                </span>
              </span>
              <span className="nearby-dist mono dim">
                {it.distanceKm < 1
                  ? `${Math.round(it.distanceKm * 1000)} m`
                  : `${n(it.distanceKm, 1)} km`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button className="link-btn nearby-more" onClick={() => setExpanded(true)}>
          {t.nearby.showMore(hidden)}
        </button>
      )}

      {/* Si hay parada cerca, se dice por qué no hay horarios. Un horario
          caducado leído como vigente es una guagua perdida. */}
      {hasBusStop && guagua?.expired && guagua.validUntil && (
        <p className="warn small">
          {t.nearby.guaguaNoTimetable(formatIsoDate(guagua.validUntil))}{' '}
          <a href={t.nearby.guaguaSourceUrl} target="_blank" rel="noreferrer">
            {t.nearby.guaguaSource} →
          </a>
        </p>
      )}
    </section>
  )
}
