/**
 * Ficha de un aforo.
 *
 * Lo primero que hay que dejar claro no es una cifra: es QUÉ cifra. La grande
 * es el acumulado del día en curso, del archivo diario; el intervalo de cinco
 * minutos que publica el endpoint llamado «del día en curso» va abajo y
 * rotulado como lo que es. Confundirlos es contar trece coches en la entrada de
 * Santa Cruz.
 *
 * Y donde la fuente no publica un sentido —los peatones de los aforos de
 * carretera— se escribe que no lo publica, en vez de un cero que parecería una
 * medida.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { CounterSite } from '@core/lib/counters/model'
import { formatIslandTime } from '@core/lib/cabildo'
import { humanAge, n0, t } from '@core/i18n'
import { color, font } from '../theme'
import { Section } from '../detail/Section'
import { Chips } from './Chips'
import { CounterDays } from './CounterDays'
import { Note } from './Note'

interface Props {
  site: CounterSite
  /**
   * Día de la isla en curso, `YYYY-MM-DD`. Llega desde fuera y no se recalcula
   * aquí: tiene que ser exactamente el mismo con el que se sumó `todayTotal`, o
   * la cifra grande y la tabla dirían cosas distintas.
   */
  today: string
  now: number
  onWeather: (lon: number, lat: number, label: string) => void
}

export function CounterSheet({ site, today, now, onWeather }: Props) {
  const pulse = site.channels
    .filter((c) => c.pulse)
    .sort((a, b) => (b.pulse?.at ?? 0) - (a.pulse?.at ?? 0))[0]?.pulse

  return (
    <>
      <Chips labels={[t.counters.kinds[site.kind] ?? site.kind]} />

      <Pressable onPress={() => onWeather(site.lon, site.lat, site.name)}>
        <Text style={styles.action}>{t.counters.weatherHere} →</Text>
      </Pressable>

      {site.todayTotal === null ? (
        <Note warn>{t.counters.noToday}</Note>
      ) : (
        <View style={styles.reading}>
          <Text style={styles.big}>{n0(site.todayTotal)}</Text>
          <View style={styles.unit}>
            <Text style={styles.unitLabel}>{t.counters.todayTotal.toLowerCase()}</Text>
            <Text style={styles.unitNote}>{t.counters.inProgress}</Text>
          </View>
        </View>
      )}
      {site.todayTotal !== null && <Note>{t.counters.todayHint}</Note>}

      <Section title={t.counters.channels}>
        <View style={styles.channels}>
          {site.channels.map((channel) => {
            const day = channel.days.find((d) => d.day === today)
            const direction =
              channel.incomingLabel && channel.outgoingLabel
                ? t.counters.direction(channel.incomingLabel, channel.outgoingLabel)
                : null
            return (
              <View key={channel.entityId} style={styles.channel}>
                <View style={styles.channelKey}>
                  <Text style={styles.channelType}>
                    {t.counters.types[channel.type] ?? channel.type}
                    {/* El nombre del canal solo se repite si dice algo que el
                        del emplazamiento no dice: en CS06 son dos senderos
                        distintos contados en el mismo punto. */}
                    {channel.name !== site.name ? ` · ${channel.name}` : ''}
                  </Text>
                  {direction ? <Text style={styles.direction}>{direction}</Text> : null}
                </View>
                <Text style={styles.channelValue}>
                  {day
                    ? `${day.incoming === null ? '—' : n0(day.incoming)} / ${
                        day.outgoing === null ? '—' : n0(day.outgoing)
                      }`
                    : '—'}
                </Text>
              </View>
            )
          })}
        </View>
        <Note>{t.counters.oneWayNote}</Note>
      </Section>

      <Section title={t.counters.lastPulse}>
        {pulse ? (
          <>
            <Text style={styles.pulse}>
              {`${pulse.incoming === null ? '—' : n0(pulse.incoming)} / ${
                pulse.outgoing === null ? '—' : n0(pulse.outgoing)
              }`}
            </Text>
            <Text style={styles.pulseAt}>
              {`${t.counters.pulseAt} ${formatIslandTime(pulse.at)} · ${humanAge(now - pulse.at)}`}
            </Text>
            <Note>{t.counters.pulseHint}</Note>
          </>
        ) : (
          <Note warn>{t.counters.noPulse}</Note>
        )}
      </Section>

      <CounterDays channels={site.channels} today={today} />

      <Section title={t.counters.title}>
        <Note>{t.counters.pulseNote}</Note>
        <Note>{t.counters.source}</Note>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  action: { fontFamily: font.medium, fontSize: 14, color: color.amber, paddingVertical: 10 },
  reading: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 },
  big: { fontFamily: font.bold, fontSize: 38, lineHeight: 44, color: color.fg },
  unit: { flex: 1 },
  unitLabel: { fontFamily: font.regular, fontSize: 13, color: color.dim },
  unitNote: { fontFamily: font.mono, fontSize: 10, color: color.faint },
  channels: { marginTop: 8 },
  channel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  channelKey: { flex: 1, minWidth: 0 },
  channelType: { fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: color.fg },
  direction: { fontFamily: font.mono, fontSize: 10, lineHeight: 14, color: color.faint, marginTop: 2 },
  channelValue: { fontFamily: font.mono, fontSize: 13, lineHeight: 19, color: color.fg },
  pulse: { fontFamily: font.mono, fontSize: 17, lineHeight: 24, color: color.fg, marginTop: 8 },
  pulseAt: { fontFamily: font.mono, fontSize: 10.5, color: color.faint, marginTop: 2 },
})
