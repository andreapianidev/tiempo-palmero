/**
 * Qué estaciones sostienen la cifra, con su peso.
 *
 * Es la sección que hace auditable la estimación: distancia, desnivel y
 * porcentaje de peso. Un aporte de Open-Meteo va marcado como tal y con su
 * nota debajo — nunca sale con aspecto de medida.
 */

import { StyleSheet, Text, View } from 'react-native'
import { humanAge, n, n0, t } from '@core/i18n'
import type { Estimate } from '@core/lib/interpolate'
import { color, font } from '../theme'
import { Row } from './Row'
import { Section } from './Section'

interface Props {
  estimate: Estimate
  /** Cómo se ha llegado hasta aquí, en una frase. */
  note: string
  now: number
}

export function Contributors({ estimate, note, now }: Props) {
  const hasModel = estimate.contributors.some((c) => c.source === 'openmeteo')

  return (
    <Section title={t.point.contributors} note={note}>
      <View style={styles.rows}>
        {estimate.contributors.map((c, i) => (
          <Row
            key={c.entityId}
            label={c.source === 'openmeteo' ? `${c.name} · ${t.model.anchorTag}` : c.name}
            sub={`${humanAge(now - c.observedAt)} · ${n(c.rawValue, 1)}`}
            value={`${Math.round(c.weightShare * 100)} %`}
            valueSub={`${n(c.distanceKm, 1)} ${t.units.km} · ${
              c.elevationDelta >= 0 ? '+' : '−'
            }${n0(Math.abs(c.elevationDelta))} ${t.units.metres}`}
            share={c.weightShare}
            last={i === estimate.contributors.length - 1}
          />
        ))}
      </View>
      {hasModel && <Text style={styles.warn}>{t.model.anchorNote}</Text>}
    </Section>
  )
}

const styles = StyleSheet.create({
  rows: { marginTop: 10 },
  warn: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: color.warn,
    marginTop: 10,
  },
})
