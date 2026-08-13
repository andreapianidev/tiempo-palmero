/**
 * Ficha de un punto de interés de la red de senderos.
 *
 * La capa publica cinco campos y la ficha los enseña los cinco, sin quedarse
 * ninguno: es todo lo que hay. El color y el icono dicen la familia —servicios,
 * patrimonio cultural, patrimonio natural—, que es lo único que el mapa puede
 * contar de un vistazo.
 */

import { Pressable, StyleSheet, Text } from 'react-native'
import { isDataProp, type PoiRecord } from '@core/lib/poi'
import { n, t } from '@core/i18n'
import { color, font } from '../theme'
import { Section } from '../detail/Section'
import { Chips } from './Chips'
import { FieldRows } from './FieldRows'
import { Note } from './Note'

/** La capa de senderos no publica ningún enlace. */
const NO_LINKS = new Set<string>()

interface Props {
  poi: PoiRecord
  onWeather: (lon: number, lat: number, label: string) => void
}

export function PoiSheet({ poi, onWeather }: Props) {
  const fields: [string, unknown][] = Object.entries(poi.props).filter(
    ([k, v]) => isDataProp(k) && v !== null && v !== undefined && String(v).trim() !== '',
  )
  fields.push([t.poi.coords, `${n(poi.lat, 5)}, ${n(poi.lon, 5)}`])

  return (
    <>
      <Chips labels={[t.poi.families[poi.family] ?? poi.family]} />

      <Pressable onPress={() => onWeather(poi.lon, poi.lat, poi.name)}>
        <Text style={styles.action}>{t.poi.weatherHere} →</Text>
      </Pressable>

      <Section title={t.poi.allFields}>
        <FieldRows fields={fields} labels={t.poi.fields} linkKeys={NO_LINKS} openLabel="" />
        <Note>{t.poi.rawNote}</Note>
        <Note>{t.poi.source}</Note>
      </Section>
    </>
  )
}

const styles = StyleSheet.create({
  action: { fontFamily: font.medium, fontSize: 14, color: color.amber, paddingVertical: 10 },
})
