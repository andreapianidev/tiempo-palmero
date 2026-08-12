/**
 * Los últimos días de un aforo, en barras.
 *
 * El día en curso se dibuja distinto y va rotulado «día en curso»: a las once
 * de la mañana su barra es la mitad de corta que la de ayer por la hora que es,
 * no porque haya pasado menos gente. Sin decirlo, la barra corta miente.
 */

import { sumPublished, type ChannelSeries } from '../../lib/counters/model'
import { n0, t } from '../../i18n'

interface Props {
  channels: readonly ChannelSeries[]
  /** Día de la isla en curso, `YYYY-MM-DD`. */
  today: string
}

export interface DayTotal {
  day: string
  total: number | null
  current: boolean
}

/** Suma por día de todos los contadores del emplazamiento. */
export function dailyTotals(channels: readonly ChannelSeries[], today: string): DayTotal[] {
  const byDay = new Map<string, (number | null)[]>()
  for (const c of channels) {
    for (const d of c.days) {
      const list = byDay.get(d.day) ?? []
      list.push(d.incoming, d.outgoing)
      byDay.set(d.day, list)
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, values]) => ({ day, total: sumPublished(values), current: day === today }))
}

/** «mié 12», a partir de la clave del día. Se lee como fecha, no como número. */
function dayLabel(day: string): string {
  const at = Date.parse(`${day}T12:00:00Z`)
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(at)
}

export function CounterDays({ channels, today }: Props) {
  const totals = dailyTotals(channels, today)
  if (!totals.length) return null
  const max = Math.max(...totals.map((d) => d.total ?? 0), 1)
  // La media se calcula SOLO con los días cerrados: meter el día a medias la
  // hundiría, y es la cifra contra la que se compara el día de hoy.
  const closed = totals.filter((d) => !d.current && d.total !== null).map((d) => d.total as number)
  const average = closed.length ? closed.reduce((a, b) => a + b, 0) / closed.length : null

  return (
    <section className="aforo-days">
      <h3>{t.counters.week}</h3>
      <ul>
        {totals.map((d) => (
          <li key={d.day} className={d.current ? 'current' : undefined}>
            <span className="aforo-day">{dayLabel(d.day)}</span>
            <span className="aforo-bar">
              <i style={{ width: `${((d.total ?? 0) / max) * 100}%` }} />
            </span>
            <span className="aforo-value mono">
              {d.total === null ? '—' : n0(d.total)}
              {d.current && <em className="dim"> · {t.counters.inProgress}</em>}
            </span>
          </li>
        ))}
      </ul>
      {average !== null && (
        <p className="dim small">
          {t.counters.average}: <span className="mono">{n0(average)}</span>
        </p>
      )}
      <p className="note small">{t.counters.weekHint}</p>
    </section>
  )
}
