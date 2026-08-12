/**
 * La cabecera de la ficha: la cifra grande y todo lo que hace falta para no
 * confundirla con una medida.
 *
 * Orden deliberado, el mismo que la web: valor, margen, «valor estimado, no
 * medido», y cuándo se midió lo que lo sostiene. La frescura lleva su punto de
 * color con los mismos umbrales que los pins del mapa —`freshness()`—, así que
 * un verde aquí y un verde allí significan lo mismo.
 */

import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { FRESHNESS_COLOR, cssColor, type RgbStop } from '@core/lib/palette'
import { freshness } from '@core/lib/quality'
import { humanAge, n, n0, t } from '@core/i18n'
import type { Estimate } from '@core/lib/interpolate'
import { color, font, space } from '../theme'

interface Props {
  estimate: Estimate
  /** Unidad ya resuelta: «°C» o «%». */
  unit: string
  decimals: number
  /** true para el punto de rocío, que se calcula y no se interpola. */
  derived: boolean
  stops: RgbStop[]
  lon: number
  lat: number
  elevation: number
  municipality: string
  now: number
}

export function Hero({
  estimate,
  unit,
  decimals,
  derived,
  stops,
  lon,
  lat,
  elevation,
  municipality,
  now,
}: Props) {
  const fromModel = estimate.contributors.some((c) => c.source === 'openmeteo')
  const ageHours = (now - estimate.observedAt) / 3_600_000
  const lo = stops[0][0]
  const hi = stops[stops.length - 1][0]

  return (
    <View style={styles.hero}>
      <Text style={styles.co}>
        {n(lat, 4)}, {n(lon, 4)} · {n0(elevation)} M · {municipality.toUpperCase()}
      </Text>

      <View style={styles.big}>
        <Text style={[styles.value, { color: cssColor(stops, estimate.value) }]}>
          {n(estimate.value, decimals)}
        </Text>
        <Text style={styles.unit}>
          {unit}
          {'\n'}
          {(derived ? t.point.derived : t.point.estimated).toUpperCase()}
        </Text>
      </View>

      <Text style={styles.band}>
        {t.point.uncertainty} ± {n(estimate.uncertainty, decimals)} {unit} ·{' '}
        {t.point.notAMeasurement.toLowerCase()}
      </Text>

      <View style={styles.fresh}>
        <View style={[styles.dot, { backgroundColor: FRESHNESS_COLOR[freshness(ageHours)] }]} />
        <Text style={styles.freshText}>
          {/* En la cumbre parte de la cifra la pone un modelo, y fechar un
              pronóstico como «medido» sería mentir con una palabra. */}
          {fromModel ? t.point.validAt : t.point.measuredAt} {humanAge(now - estimate.observedAt)}
          {estimate.oldestObservedAt < estimate.observedAt - 60_000
            ? ` · ${t.point.oldestContribution} ${humanAge(now - estimate.oldestObservedAt)}`
            : ''}
        </Text>
      </View>

      {now - estimate.observedAt > 3_600_000 && (
        <Text style={styles.warn}>{t.point.staleWarning}</Text>
      )}
      {estimate.extrapolated && <Text style={styles.warn}>{t.point.extrapolated}</Text>}
      {estimate.elevationExtrapolated && (
        <Text style={styles.warn}>{t.point.elevationExtrapolated}</Text>
      )}

      <LinearGradient
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        colors={stops.map(([, hex]) => hex) as [string, string, ...string[]]}
        locations={stops.map(([v]) => (v - lo) / (hi - lo)) as [number, number, ...number[]]}
        style={styles.ramp}
      />
      <View style={styles.ends}>
        <Text style={styles.end}>
          {n0(lo)} {unit}
        </Text>
        <Text style={styles.end}>
          {n(estimate.value, decimals)} {unit} aquí
        </Text>
        <Text style={styles.end}>
          {n0(hi)} {unit}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.sheet, paddingTop: 22, paddingBottom: 20 },
  co: { fontFamily: font.mono, fontSize: 10.5, letterSpacing: 0.5, color: color.faint },
  big: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 6 },
  value: {
    fontFamily: font.monoSemibold,
    fontSize: 66,
    lineHeight: 66,
    letterSpacing: -3,
  },
  unit: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, color: color.dim, paddingTop: 5 },
  band: { fontFamily: font.mono, fontSize: 11.5, lineHeight: 16, color: color.dim, marginTop: 8 },
  fresh: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  freshText: { flex: 1, fontFamily: font.mono, fontSize: 11, lineHeight: 15, color: color.dim },
  warn: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 18,
    color: color.warn,
    marginTop: 8,
  },
  ramp: { height: 7, borderRadius: 4, marginTop: 14, marginBottom: 4 },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { fontFamily: font.mono, fontSize: 10, color: color.faint },
})
