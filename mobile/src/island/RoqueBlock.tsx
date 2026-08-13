/**
 * El parte del Roque, 2387 m.
 *
 * La regla que esta pantalla comparte con la web sin negociar: un campo que la
 * propia fuente marca como `outdated` sale apagado y con su fecha. El día que
 * se escribió esto, el seeing llevaba cuatro días parado y los otros ocho
 * campos eran de hace un minuto.
 */

import { StyleSheet, Text, View } from 'react-native'
import { humanAge, n } from '@core/i18n'
import {
  ROQUE_ELEVATION_M,
  ROQUE_KEYS,
  dustLevel,
  seeingQuality,
  type RoqueStatus,
} from '@core/lib/roque'
import { Section } from '../detail/Section'
import { Row } from '../detail/Row'
import { color, font } from '../theme'

const SEEING_WORDS = {
  excellent: 'noche excelente',
  good: 'noche buena',
  average: 'regular',
  poor: 'turbulenta',
} as const

const DUST_WORDS = {
  clean: 'aire limpio',
  hazy: 'polvo en suspensión',
  calima: 'calima',
} as const

const DECIMALS: Partial<Record<(typeof ROQUE_KEYS)[number], number>> = {
  temperature: 1,
  humidity: 0,
  dewpoint: 1,
  windspeed: 1,
  winddir: 0,
  pressure: 1,
  dust: 2,
  seeing: 2,
  solarimeter: 0,
}

interface Props {
  status: RoqueStatus | null
  aboveDeck: boolean | null
  now: number
}

export function RoqueBlock({ status, aboveDeck, now }: Props) {
  if (!status) {
    return (
      <Section
        title="Roque de los Muchachos"
        note="La estación del TNG no responde. Es un observatorio de investigación, no un servicio público de datos."
      />
    )
  }

  const temp = status.fields.temperature
  const seeing = status.fields.seeing
  const dust = status.fields.dust
  const keys = ROQUE_KEYS.filter((k) => status.fields[k])

  return (
    <Section title="Roque de los Muchachos">
      {temp && (
        <Text style={styles.headline}>
          <Text style={styles.hi}>{n(temp.value, 1)} °C</Text> a {ROQUE_ELEVATION_M} m
          {aboveDeck === true && ' · por encima del mar de nubes'}
        </Text>
      )}

      {keys.map((key, i) => {
        const f = status.fields[key]!
        return (
          <View key={key} style={f.outdated ? styles.stale : undefined}>
            <Row
              label={f.label}
              sub={f.outdated ? `de hace ${humanAge(now - f.observedAt)}` : undefined}
              value={`${n(f.value, DECIMALS[key] ?? 1)} ${f.unit}`}
              last={i === keys.length - 1}
            />
          </View>
        )
      })}

      {/* Sólo se interpretan los campos frescos. Un seeing de hace cuatro días
          no describe la noche de hoy. */}
      <View style={styles.chips}>
        {seeing && !seeing.outdated && (
          <Text style={styles.chip}>Seeing: {SEEING_WORDS[seeingQuality(seeing.value)]}</Text>
        )}
        {dust && !dust.outdated && (
          <Text style={styles.chip}>{DUST_WORDS[dustLevel(dust.value)]}</Text>
        )}
      </View>

      <Text style={styles.foot}>
        Telescopio Nazionale Galileo (INAF). Presión de estación sin reducir al
        nivel del mar: a 2.387 m son ~778 hPa de verdad, y es la razón física de
        que allí arriba haya un observatorio.
      </Text>
    </Section>
  )
}

const styles = StyleSheet.create({
  headline: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: color.fg,
    marginTop: 10,
    marginBottom: 4,
  },
  hi: { fontFamily: font.semibold, color: color.amber },
  stale: { opacity: 0.45 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: {
    fontFamily: font.mono,
    fontSize: 10.5,
    color: color.dim,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  foot: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: color.faint,
    marginTop: 12,
  },
})
