/**
 * Ficha de un tramo de carretera.
 *
 * La capa dice de dónde a dónde va el tramo y cuánto mide, y eso es TODO lo que
 * dice: no hay estado del firme, ni cortes, ni obras. La nota final lo dice en
 * voz alta, porque una ficha de carretera en una app del tiempo invita a
 * suponer lo contrario.
 *
 * Las dos longitudes no coinciden, y la diferencia se enseña en vez de
 * esconderse: es del propio inventario del Cabildo, no un error de medida
 * nuestro.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { RoadRecord } from '@core/lib/roads'
import { n, n0, t } from '@core/i18n'
import { color, font } from '../theme'
import { Row } from '../detail/Row'
import { Section } from '../detail/Section'
import { Chips } from './Chips'
import { Note } from './Note'

interface Props {
  road: RoadRecord
  lon: number
  lat: number
  onWeather: (lon: number, lat: number, label: string) => void
}

/** Metros por debajo del kilómetro, kilómetros por encima. */
function length(metres: number): string {
  return metres < 1000 ? `${n0(metres)} ${t.units.metres}` : `${n(metres / 1000, 2)} ${t.units.km}`
}

export function RoadSheet({ road, lon, lat, onWeather }: Props) {
  const drift = road.officialM !== null && road.gisM !== null ? road.gisM - road.officialM : null
  const tags = [road.code, road.owner ? t.roads.ownerLabel(road.owner) : null].filter(
    (v): v is string => !!v,
  )

  return (
    <>
      <Chips labels={tags} />
      {road.route ? <Text style={styles.route}>{road.route}</Text> : null}

      <Pressable onPress={() => onWeather(lon, lat, road.code ?? road.name)}>
        <Text style={styles.action}>{t.roads.weatherHere} →</Text>
      </Pressable>

      <Section title={t.roads.officialLength}>
        <View style={{ marginTop: 8 }}>
          {road.officialM !== null && (
            <Row label={t.roads.officialLength} value={length(road.officialM)} />
          )}
          {road.gisM !== null && (
            <Row
              label={t.roads.gisLength}
              sub={t.roads.gisHint}
              value={length(road.gisM)}
              valueSub={
                drift !== null && drift !== 0
                  ? `${drift > 0 ? '+' : '−'}${n0(Math.abs(drift))} ${t.units.metres}`
                  : undefined
              }
            />
          )}
          {road.cartoColor && (
            <Row
              label={t.roads.cartoColor}
              sub={t.roads.cartoHint}
              value={road.cartoColor.toLowerCase()}
              last
            />
          )}
        </View>
        <Note warn>{t.roads.note}</Note>
        <Note>{t.roads.source}</Note>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  route: { fontFamily: font.mono, fontSize: 11.5, lineHeight: 17, color: color.faint, marginTop: 8 },
  action: { fontFamily: font.medium, fontSize: 14, color: color.amber, paddingVertical: 10 },
})
