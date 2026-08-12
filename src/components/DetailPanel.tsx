/**
 * Panel de detalle de un pin: estación meteorológica, calidad del aire,
 * sensor de CO₂, fotómetro o cámara de incendios.
 *
 * El de CO₂ es distinto de los demás a propósito: falla en cerrado, no dice
 * nunca «seguro», enseña la hora exacta de la medida y enlaza a la fuente
 * oficial. No lleva publicidad ni muro de pago, y no los llevará.
 */

import { formatIslandTime } from '../lib/cabildo'
import { co2Band, CO2_FLOOR_PPM } from '../lib/palette'
import { freshness, stationReading, type Station } from '../lib/quality'
import { FAMILY_COLOR, isDataProp, poiIconDataUrl, type PoiRecord } from '../lib/poi'
import type { AirStation, Co2Point, FireCamera, SkyStation } from '../hooks/useIslandData'
import type { Model } from '../lib/interpolate'
import { n, n0, t, humanAge } from '../i18n'

/** El punto de interés llega del mapa y la app le añade lo que sabe del sitio. */
export interface PoiSelection extends PoiRecord {
  elevation: number | null
  municipality: string | null
}

export type Selection =
  | { kind: 'station'; value: Station }
  | { kind: 'air'; value: AirStation }
  | { kind: 'co2'; value: Co2Point }
  | { kind: 'fire'; value: FireCamera }
  | { kind: 'sky'; value: SkyStation }
  | { kind: 'poi'; value: PoiSelection }

interface Props {
  selection: Selection
  model: Model | null
  now: number
  firePolledAt: number | null
  co2Down: boolean
  onClose: () => void
  /** Del punto de interés al tiempo de ese mismo punto, sin buscarlo a mano. */
  onWeather: (lon: number, lat: number, label: string) => void
}

const FRESHNESS_LABEL = {
  live: t.station.fresh,
  recent: t.station.recent,
  dead: t.station.dead,
} as const

const RAW_FIELDS: [keyof Station, string, string][] = [
  ['temperature', t.variables.temperature, t.units.celsius],
  ['relativehumidity', t.variables.relativehumidity, t.units.percent],
  ['dewpoint', t.variables.dewpoint, t.units.celsius],
  ['windspeed', t.variables.wind, t.units.kmh],
  ['atmosphericpressure', 'Presión (nivel del mar)', t.units.hpa],
  ['precipitation', t.variables.precipitation, 'mm'],
  ['dailyprecipitation', 'Precipitación diaria', 'mm'],
  ['uv', 'Índice UV', ''],
  ['solarradiation', 'Radiación solar', 'W/m²'],
  // Sin unidad en la etiqueta a propósito: ver `Station.dailyevapotranspiration`.
  // La columna mezcla dos convenciones y aquí se enseña el crudo de la estación.
  ['dailyevapotranspiration', 'Evapotranspiración (día)', 'mm'],
]

export function DetailPanel({
  selection,
  model,
  now,
  firePolledAt,
  co2Down,
  onClose,
  onWeather,
}: Props) {
  return (
    <section className="panel detail-panel" aria-label={t.point.title}>
      <button className="panel-close" onClick={onClose} aria-label={t.point.close}>
        ×
      </button>
      {selection.kind === 'poi' && <PoiDetail p={selection.value} onWeather={onWeather} />}
      {selection.kind === 'station' && <StationDetail s={selection.value} model={model} now={now} />}
      {selection.kind === 'air' && <AirDetail a={selection.value} now={now} />}
      {selection.kind === 'co2' && <Co2Detail c={selection.value} down={co2Down} />}
      {selection.kind === 'fire' && <FireDetail f={selection.value} polledAt={firePolledAt} now={now} />}
      {selection.kind === 'sky' && <SkyDetail s={selection.value} now={now} />}
    </section>
  )
}

/**
 * Ficha de un punto de interés de la red de senderos.
 *
 * La capa publica cinco campos por punto y aquí salen los cinco: se recorren
 * las propiedades del GeoJSON tal cual llegan, en vez de listar a mano las que
 * hoy conocemos. Si el Cabildo añade una columna, aparece sola.
 *
 * Lo que la app sabe del sitio —altitud del modelo de elevación y municipio—
 * va aparte, separado de lo que dice la fuente: son cosas distintas.
 */
function PoiDetail({
  p,
  onWeather,
}: {
  p: PoiSelection
  onWeather: (lon: number, lat: number, label: string) => void
}) {
  const subtype = p.subtipo ? (t.poi.subtypes[p.subtipo.toLowerCase()] ?? p.subtipo) : null
  const label = (k: string) => t.poi.fields[k] ?? k
  const fields = Object.entries(p.props).filter(
    ([k, v]) => isDataProp(k) && v !== null && v !== undefined && String(v).trim() !== '',
  )

  return (
    <>
      <header className="point-head poi-head">
        <img className="poi-icon" src={poiIconDataUrl(p.icon, 34)} alt="" width={34} height={34} />
        <div>
          <h2>{p.name}</h2>
          <p className="mono dim">
            <span className="chip" style={{ background: FAMILY_COLOR[p.family], color: '#141311' }}>
              {t.poi.families[p.family]}
            </span>
            {subtype && <> · {subtype}</>}
          </p>
          <p className="mono dim small">
            {p.municipality ?? t.point.outsideIsland}
            {p.elevation !== null && <> · {n0(p.elevation)} {t.units.metres}</>}
          </p>
        </div>
      </header>

      <button className="link-btn poi-weather" onClick={() => onWeather(p.lon, p.lat, p.name)}>
        {t.poi.weatherHere} →
      </button>

      <h3>{t.poi.allFields}</h3>
      <table className="kv">
        <tbody>
          {fields.map(([k, v]) => (
            <tr key={k}>
              <td>{label(k)}</td>
              <td className="mono">{String(v)}</td>
            </tr>
          ))}
          <tr>
            <td>{t.poi.coords}</td>
            <td className="mono">
              {n(p.lat, 5)}, {n(p.lon, 5)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="note small">{t.poi.rawNote}</p>
      <p className="note small">{t.poi.source}</p>
    </>
  )
}

function StationDetail({ s, model, now }: { s: Station; model: Model | null; now: number }) {
  const state = freshness(s.ageHours)
  const rejected = model?.rejected.find((r) => r.entityId === s.entityId)
  return (
    <>
      <header className="point-head">
        <h2>{s.name}</h2>
        <p className="mono dim">
          <span className={`chip chip-${state}`}>{FRESHNESS_LABEL[state]}</span>
          {' · '}
          {n0(s.elevation)} {t.units.metres} · {n(s.lat, 4)}, {n(s.lon, 4)}
        </p>
        <p className="mono dim small">
          {t.station.lastReading}: {formatIslandTime(s.timeinstant)} ·{' '}
          {humanAge(now - s.timeinstant)}
        </p>
      </header>

      {rejected && (
        <p className="warn">
          <strong>{t.station.excludedByQc}.</strong>{' '}
          {t.station.excludedReason(rejected.sigmas)}
        </p>
      )}

      <h3>{t.station.allValues}</h3>
      {s.pressureWasReduced && (
        <p className="note small">{t.station.pressureReduced}</p>
      )}
      <table className="kv">
        <tbody>
          {RAW_FIELDS.map(([key, label, unit]) => {
            const raw = s[key]
            // El rocío y la humedad se completan el uno al otro cuando falta
            // uno de los dos: es la misma cifra que enseña el pin, y aquí va
            // dicho de dónde sale.
            const derived =
              typeof raw !== 'number' && (key === 'dewpoint' || key === 'relativehumidity')
                ? stationReading(s, key)
                : null
            const v = typeof raw === 'number' ? raw : (derived?.value ?? null)
            if (v === null) return null
            return (
              <tr key={String(key)}>
                <td>
                  {label}
                  {derived && <em className="dim"> · {t.point.derived}</em>}
                </td>
                <td className="mono">
                  {n(v, key === 'relativehumidity' || key === 'uv' ? 0 : 1)} {unit}
                </td>
              </tr>
            )
          })}
          {s.winddirection !== null && (
            <tr>
              <td>Dirección del viento</td>
              <td className="mono">{n0(s.winddirection)}°</td>
            </tr>
          )}
          <tr>
            <td>{t.station.elevation}</td>
            <td className="mono">{n0(s.elevation)} {t.units.metres}</td>
          </tr>
        </tbody>
      </table>
    </>
  )
}

function AirDetail({ a, now }: { a: AirStation; now: number }) {
  const stale = now - a.at > 24 * 3_600_000
  return (
    <>
      <header className="point-head">
        <h2>{a.name}</h2>
        <p className="mono dim">
          {t.air.title} · {t.air.pointMeasurement}
        </p>
        <p className="mono dim small">
          {formatIslandTime(a.at)} · {humanAge(now - a.at)}
        </p>
      </header>

      <p className="note">{t.air.neverInterpolated}</p>

      {stale ? (
        <p className="warn">{t.air.noData}</p>
      ) : (
        <table className="kv">
          <tbody>
            {a.index !== null && (
              <tr>
                <td>{t.air.index}</td>
                <td className="mono">{a.index}</td>
              </tr>
            )}
            {a.level && (
              <tr>
                <td>{t.air.level}</td>
                <td className="mono">{a.level}</td>
              </tr>
            )}
            {a.values.map((v) => (
              <tr key={v.key}>
                <td>{v.key.toUpperCase()}</td>
                <td className="mono">{n(v.value, 1)} µg/m³</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

/**
 * CO₂. Los sensores DEMASE miden hasta 69.301 ppm — 6,9 %, letal en minutos —
 * y son el motivo de la evacuación de Puerto Naos.
 *
 * Sin lectura de los últimos 15 minutos aquí se lee «sin datos» y nada más. No
 * se muestra la última lectura buena, no se interpola con los sensores vecinos
 * y no se colorea el área intermedia. Y no aparece la palabra «seguro»: eso lo
 * decide el Cabildo, no una pantalla.
 */
function Co2Detail({ c, down }: { c: Co2Point; down: boolean }) {
  const band = c.reading && !c.stale ? co2Band(c.reading.ppm) : null
  return (
    <>
      <header className="point-head">
        <h2>{c.alias || c.name}</h2>
        <p className="mono dim">
          {t.co2.title}
          {c.zone && <> · {c.zone}</>}
        </p>
      </header>

      {down && (
        <p className="warn">
          <strong>{t.co2.networkDown}</strong> {t.co2.networkDownDetail}
        </p>
      )}

      {!down && c.stale && (
        <div className="co2-nodata">
          <strong>{t.co2.noData}</strong>
          <span className="dim small">{t.co2.noDataDetail}</span>
        </div>
      )}

      {!down && !c.stale && c.reading && band && (
        <>
          <div className="reading">
            <b style={{ color: band.color }}>{n0(c.reading.ppm)}</b>
            <span className="reading-unit">
              {t.units.ppm}
              <em>{n(c.reading.percent, 2)} %</em>
            </span>
          </div>
          <p className="mono">
            <span className="chip" style={{ background: band.color, color: '#11100e' }}>
              {band.label}
            </span>
            {c.reading.ppm <= CO2_FLOOR_PPM && (
              <span className="chip chip-ghost">{t.co2.floorValue}</span>
            )}
          </p>

          {/* El suelo del equipo lo marcan 169 de los 182 sensores que
              transmitían el 12 ago 2026: sin decirlo, la cifra más repetida de
              la red parece una medida precisa y no lo es. */}
          {c.reading.ppm <= CO2_FLOOR_PPM && (
            <p className="note small">{t.co2.floorBody}</p>
          )}

          <table className="kv">
            <tbody>
              <tr>
                <td>{t.co2.at}</td>
                <td className="mono">{formatIslandTime(c.reading.at)}</td>
              </tr>
              <tr title={c.outdoor ? undefined : t.co2.indoorHint}>
                <td>{t.co2.outdoor}</td>
                <td className="mono">
                  {c.outdoor ? t.co2.outdoorValue : t.co2.indoorValue}
                </td>
              </tr>
              {/* La altura viene en la lectura, no en el inventario: ver
                  `Co2Reading.heightM`. Antes se leía de `/MetaDato`, donde está
                  a null en los 209 sensores, y esta fila no salía nunca. */}
              {c.reading.heightM !== null && (
                <tr title={t.co2.heightHint}>
                  <td>{t.co2.height}</td>
                  <td className="mono">
                    {n(c.reading.heightM, 1)} {t.units.metres}
                  </td>
                </tr>
              )}
              {c.reading.tempC !== null && (
                <tr title={t.co2.sensorTempHint}>
                  <td>{t.co2.sensorTemp}</td>
                  <td className="mono">{n(c.reading.tempC, 1)} {t.units.celsius}</td>
                </tr>
              )}
            </tbody>
          </table>

          {!c.outdoor && <p className="note small">{t.co2.indoorHint}</p>}

          <details className="explain">
            <summary>{t.co2.whatIsThis}</summary>
            <p className="small">{t.co2.whatIsThisBody}</p>
          </details>
        </>
      )}

      <p className="note">{t.co2.neverInterpolated}</p>
      <a
        className="official-link"
        href={t.co2.officialSourceUrl}
        target="_blank"
        rel="noreferrer"
      >
        {t.co2.officialSource} →
      </a>
    </>
  )
}

function FireDetail({
  f,
  polledAt,
  now,
}: {
  f: FireCamera
  polledAt: number | null
  now: number
}) {
  return (
    <>
      <header className="point-head">
        <h2>{f.name}</h2>
        <p className="mono dim">{t.fire.title}</p>
      </header>

      <p className={f.hasAlert ? 'warn strong' : 'note'}>
        {f.hasAlert ? t.fire.alert : t.fire.noAlert}
      </p>

      <table className="kv">
        <tbody>
          {f.maxTemperature !== null && (
            <tr>
              <td>Temperatura máxima</td>
              <td className="mono">{n(f.maxTemperature, 1)} {t.units.celsius}</td>
            </tr>
          )}
          {f.minTemperature !== null && (
            <tr>
              <td>Temperatura mínima</td>
              <td className="mono">{n(f.minTemperature, 1)} {t.units.celsius}</td>
            </tr>
          )}
          {polledAt && (
            <tr>
              <td>{t.fire.lastPolled}</td>
              <td className="mono">{humanAge(now - polledAt)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="note small">{t.fire.noTimestamp}</p>
      <p className="note small">{t.fire.onlyFour}</p>
    </>
  )
}

function SkyDetail({ s, now }: { s: SkyStation; now: number }) {
  return (
    <>
      <header className="point-head">
        <h2>{s.name}</h2>
        <p className="mono dim">{t.sky.title}</p>
        <p className="mono dim small">
          {formatIslandTime(s.at)} · {humanAge(now - s.at)}
        </p>
      </header>
      <table className="kv">
        <tbody>
          {s.skyMagnitude !== null && (
            <tr>
              <td>
                {t.sky.magnitude} <em className="dim">({t.sky.darker})</em>
              </td>
              <td className="mono">{n(s.skyMagnitude, 2)} {t.units.magArcsec}</td>
            </tr>
          )}
          {s.clouds !== null && (
            <tr>
              <td>Nubosidad</td>
              <td className="mono">{n(s.clouds, 0)} %</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="note small">{t.sky.mostlyDead}</p>
    </>
  )
}
