/**
 * Ficha de un aforo.
 *
 * Lo primero que hay que dejar claro aquí no es una cifra, es QUÉ cifra: la
 * grande es el acumulado del día en curso, sacado del archivo diario; el
 * intervalo de cinco minutos que publica el endpoint «del día en curso» va
 * abajo, rotulado como lo que es. Y donde la fuente no publica un sentido —los
 * peatones de los aforos de carretera— se escribe que no lo publica, en vez de
 * un cero que parecería una medida.
 */

import type { CounterSite } from '../../lib/counters/model'
import { formatIslandTime } from '../../lib/cabildo'
import { CounterDays } from './CounterDays'
import { n, n0, t, humanAge } from '../../i18n'

/** El aforo del mapa más lo que la app sabe del sitio. */
export interface CounterSelection extends CounterSite {
  elevation: number | null
  municipality: string | null
  /**
   * Día de la isla en curso, `YYYY-MM-DD`. Viaja con la selección y no se
   * recalcula aquí: tiene que ser exactamente el mismo con el que se sumó
   * `todayTotal`, o la cifra grande y la tabla dirían cosas distintas.
   */
  today: string
}

interface Props {
  site: CounterSelection
  now: number
  onWeather: (lon: number, lat: number, label: string) => void
}

function typeLabel(type: string): string {
  return t.counters.types[type] ?? type
}

export function CounterDetail({ site, now, onWeather }: Props) {
  const today = site.today
  const pulse = site.channels
    .filter((c) => c.pulse)
    .sort((a, b) => (b.pulse?.at ?? 0) - (a.pulse?.at ?? 0))[0]?.pulse

  return (
    <>
      <header className="point-head">
        <h2>{site.name}</h2>
        <p className="mono dim">
          <span className={`chip chip-aforo chip-aforo-${site.kind}`}>
            {t.counters.kinds[site.kind]}
          </span>
        </p>
        <p className="mono dim small">
          {site.municipality ?? t.point.outsideIsland}
          {site.elevation !== null && (
            <>
              {' '}
              · {n0(site.elevation)} {t.units.metres}
            </>
          )}
        </p>
      </header>

      <button
        className="link-btn poi-weather"
        onClick={() => onWeather(site.lon, site.lat, site.name)}
      >
        {t.counters.weatherHere} →
      </button>

      {site.todayTotal === null ? (
        <p className="warn">{t.counters.noToday}</p>
      ) : (
        <>
          <div className="reading">
            <b>{n0(site.todayTotal)}</b>
            <span className="reading-unit">
              {t.counters.todayTotal.toLowerCase()}
              <em>{t.counters.inProgress}</em>
            </span>
          </div>
          <p className="note small">{t.counters.todayHint}</p>
        </>
      )}

      <h3>{t.counters.channels}</h3>
      <table className="kv aforo-channels">
        <tbody>
          {site.channels.map((c) => {
            const day = c.days.find((d) => d.day === today)
            const direction =
              c.incomingLabel && c.outgoingLabel
                ? t.counters.direction(c.incomingLabel, c.outgoingLabel)
                : null
            return (
              <tr key={c.entityId}>
                <td>
                  {typeLabel(c.type)}
                  {/* El nombre del canal solo se repite si dice algo que el del
                      emplazamiento no dice: en CS06 son dos senderos distintos
                      contados en el mismo punto. */}
                  {c.name !== site.name && <em className="dim"> · {c.name}</em>}
                  {direction && <span className="dim small aforo-dir">{direction}</span>}
                </td>
                <td className="mono">
                  {day ? (
                    <>
                      <span title={c.incomingLabel ?? t.counters.incoming}>
                        {day.incoming === null ? '—' : n0(day.incoming)}
                      </span>
                      {' / '}
                      <span title={c.outgoingLabel ?? t.counters.outgoing}>
                        {day.outgoing === null ? '—' : n0(day.outgoing)}
                      </span>
                      {day.outgoing === null && (
                        <em className="dim"> {t.counters.notPublished}</em>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {site.channels.some((c) => c.days.some((d) => d.outgoing === null)) && (
        <p className="note small">{t.counters.oneWayNote}</p>
      )}

      <CounterDays channels={site.channels} today={today} />

      <h3>{t.counters.lastPulse}</h3>
      {pulse ? (
        <table className="kv">
          <tbody>
            <tr>
              <td>{t.counters.pulseAt}</td>
              <td className="mono">
                {formatIslandTime(pulse.at)}
                <span className="dim"> · {humanAge(now - pulse.at)}</span>
              </td>
            </tr>
            <tr>
              <td>{t.counters.incoming} / {t.counters.outgoing}</td>
              <td className="mono">
                {pulse.incoming === null ? '—' : n0(pulse.incoming)}
                {' / '}
                {pulse.outgoing === null ? '—' : n0(pulse.outgoing)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="dim small">{t.counters.noPulse}</p>
      )}
      <p className="note small">{t.counters.pulseHint}</p>

      <table className="kv">
        <tbody>
          <tr>
            <td>{t.poi.coords}</td>
            <td className="mono">
              {n(site.lat, 5)}, {n(site.lon, 5)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="note small">{t.counters.pulseNote}</p>
      <p className="note small">{t.counters.source}</p>
    </>
  )
}
