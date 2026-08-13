/**
 * Ficha de un sitio del Cabildo: mirador, museo, recinto histórico, zona
 * recreativa o punto de recarga.
 *
 * Enseña todos los campos que publica la capa, en el orden en que llegan. Ver
 * `FieldRows` para el porqué.
 */

import { Pressable, StyleSheet, Text } from 'react-native'
import { isPlaceDataProp, PLACE_BY_KIND, type PlaceRecord } from '@core/lib/places'
import { n, t } from '@core/i18n'
import { color, font } from '../theme'
import { Section } from '../detail/Section'
import { Chips } from './Chips'
import { FieldRows } from './FieldRows'
import { Note } from './Note'

/** Enlaces: la fuente los publica con varios nombres según la capa. */
const LINK_KEYS = new Set(['web', 'web_externa', 'url_ficha', 'url_imagen'])

interface Props {
  place: PlaceRecord
  onWeather: (lon: number, lat: number, label: string) => void
}

export function PlaceSheet({ place, onWeather }: Props) {
  const spec = PLACE_BY_KIND[place.kind]
  const fields: [string, unknown][] = Object.entries(place.props).filter(
    ([k, v]) => isPlaceDataProp(k) && v !== null && v !== undefined && String(v).trim() !== '',
  )
  fields.push([t.poi.coords, `${n(place.lat, 5)}, ${n(place.lon, 5)}`])

  return (
    <>
      <Chips labels={[t.places.kinds[place.kind] ?? place.kind]} tint={spec.color} />

      <Pressable onPress={() => onWeather(place.lon, place.lat, place.name)}>
        <Text style={styles.action}>{t.poi.weatherHere} →</Text>
      </Pressable>

      <Section title={t.poi.allFields}>
        <FieldRows
          fields={fields}
          labels={t.places.fields}
          linkKeys={LINK_KEYS}
          openLabel={t.places.openLink}
        />
        <Note>{t.poi.rawNote}</Note>
        <Note>{t.places.source}</Note>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  action: { fontFamily: font.medium, fontSize: 14, color: color.amber, paddingVertical: 10 },
})
