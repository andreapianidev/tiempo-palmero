/**
 * Panel de detalle de un pin: estación meteorológica, calidad del aire,
 * sensor de CO₂, fotómetro o cámara de incendios.
 *
 * El de CO₂ es distinto de los demás a propósito: falla en cerrado, no dice
 * nunca «seguro», enseña la hora exacta de la medida y enlaza a la fuente
 * oficial. No lleva publicidad ni muro de pago, y no los llevará.
 */

import { formatIslandTime } from '../lib/cabildo'
import { co2Band } from '../lib/palette'
import { freshness, type Station } from '../lib/quality'
import type { AirStation, Co2Point, FireCamera, SkyStation } from '../hooks/useIslandData'
import type { Model } from '../lib/interpolate'
import { n, n0, t, humanAge } from '../i18n'

export type Selection =
  | { kind: 'station'; value: Station }
  | { kind: 'air'; value: AirStation }
  | { kind: 'co2'; value: Co2Point }
  | { kind: 'fire'; value: FireCamera }
  | { kind: 'sky'; value: SkyStation }

interface Props {
  selection: Selection
  model: Model | null
  now: number
  firePolledAt: number | null
  co2Down: boolean
  onClose: () => void
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
]

export function DetailPanel({ selection, model, now, firePolledAt, co2Down, onClose }: Props) {
  return (
    <section className="panel detail-panel" aria-label={t.point.title}>
      <button className="panel-close" onClick={onClose} aria-label={t.point.close}>
        ×
      </button>
      {selection.kind === 'station' && <StationDetail s={selection.value} model={model} now={now} />}
      {selection.kind === 'air' && <AirDetail a={selection.value} now={now} />}
      {selection.kind === 'co2' && <Co2Detail c={selection.value} down={co2Down} />}
      {selection.kind === 'fire' && <FireDetail f={selection.value} polledAt={firePolledAt} now={now} />}
      {selection.kind === 'sky' && <SkyDetail s={selection.value} now={now} />}
    </section>
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
            const v = s[key]
            if (typeof v !== 'number') return null
            return (
              <tr key={String(key)}>
                <td>{label}</td>
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
          </p>
          <table className="kv">
            <tbody>
              <tr>
                <td>{t.co2.at}</td>
                <td className="mono">{formatIslandTime(c.reading.at)}</td>
              </tr>
              {c.heightM !== null && (
                <tr>
                  <td>{t.co2.height}</td>
                  <td className="mono">{n(c.heightM, 1)} {t.units.metres}</td>
                </tr>
              )}
              {c.reading.tempC !== null && (
                <tr>
                  <td>{t.variables.temperature}</td>
                  <td className="mono">{n(c.reading.tempC, 1)} {t.units.celsius}</td>
                </tr>
              )}
            </tbody>
          </table>
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
