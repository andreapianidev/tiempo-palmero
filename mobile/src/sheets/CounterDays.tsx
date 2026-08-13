/**
 * Los últimos días de un aforo, en barras.
 *
 * El día en curso va rotulado «día en curso» y no se mete en la media: a las
 * once de la mañana su barra es la mitad de corta que la de ayer por la hora
 * que es, no porque haya pasado menos gente. Sin decirlo, la barra miente.
 *
 * El reparto por días —`dailyTotals`— es el de la web, importado tal cual: la
 * suma por día tiene que dar lo mismo en las dos plataformas o una de las dos
 * está contando mal.
 */

import { StyleSheet, Text, View } from 'react-native'
import { dailyTotals } from '@core/components/counters/CounterDays'
import type { ChannelSeries } from '@core/lib/counters/model'
import { n0, t } from '@core/i18n'
import { color, font } from '../theme'
import { Section } from '../detail/Section'
import { Note } from './Note'

interface Props {
  channels: readonly ChannelSeries[]
  /** Día de la isla en curso, `YYYY-MM-DD`. */
  today: string
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
  const closed = totals.filter((d) => !d.current && d.total !== null).map((d) => d.total as number)
  const average = closed.length ? closed.reduce((a, b) => a + b, 0) / closed.length : null

  return (
    <Section title={t.counters.week}>
      <View style={styles.list}>
        {totals.map((d) => (
          <View key={d.day} style={styles.row}>
            <Text style={styles.day}>{dayLabel(d.day)}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  d.current && styles.current,
                  { width: `${Math.max(1, ((d.total ?? 0) / max) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.value}>{d.total === null ? '—' : n0(d.total)}</Text>
          </View>
        ))}
      </View>
      {average !== null && (
        <Text style={styles.average}>
          {t.counters.average}: {n0(average)}
        </Text>
      )}
      <Note>{t.counters.weekHint}</Note>
    </Section>
  )
}

const styles = StyleSheet.create({
  list: { marginTop: 10, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  day: { width: 56, fontFamily: font.mono, fontSize: 11, color: color.dim },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: color.hairline },
  bar: { height: 7, borderRadius: 4, backgroundColor: color.amber, opacity: 0.8 },
  // El día en curso, a rayas de otro tono: está a medias y se ve que lo está.
  current: { backgroundColor: color.amber, opacity: 0.4 },
  value: { width: 58, textAlign: 'right', fontFamily: font.mono, fontSize: 11.5, color: color.fg },
  average: { fontFamily: font.mono, fontSize: 11, color: color.dim, marginTop: 12 },
})
