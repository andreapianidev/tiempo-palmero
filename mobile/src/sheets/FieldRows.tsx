/**
 * Todos los campos que publica una capa, tal cual llegan.
 *
 * Lo comparten la ficha de un sitio y la de un punto de sendero, y las dos lo
 * hacen por la misma razón que la web: son fuentes muy desiguales —una trae web
 * y teléfono, otra solo un nombre y una superficie— y enumerar a mano las que
 * hoy conocemos garantiza perder las que el Cabildo añada mañana.
 *
 * Lo que parece un enlace se abre como un enlace. Un `https://…` de 90
 * caracteres dentro de una tabla de teléfono no es un dato legible, y además es
 * lo único de la ficha que se puede tocar para ir a algún sitio.
 */

import { Linking, StyleSheet, Text, View } from 'react-native'
import { color, font } from '../theme'

interface Props {
  fields: [string, unknown][]
  /** Traducción del nombre del campo. Lo que no esté sale con su nombre crudo. */
  labels: Record<string, string>
  /** Campos cuyo valor es una dirección web cuando lo parece. */
  linkKeys: ReadonlySet<string>
  openLabel: string
}

export function FieldRows({ fields, labels, linkKeys, openLabel }: Props) {
  return (
    <View style={styles.table}>
      {fields.map(([key, value], i) => {
        const text = String(value)
        const isLink = linkKeys.has(key) && /^https?:/i.test(text)
        return (
          <View key={key} style={[styles.row, i === fields.length - 1 && styles.last]}>
            <Text style={styles.key}>{labels[key] ?? key}</Text>
            {isLink ? (
              <Text style={styles.link} onPress={() => Linking.openURL(text)}>
                {openLabel} →
              </Text>
            ) : (
              <Text style={styles.value}>{text}</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  table: { marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  last: { borderBottomWidth: 0 },
  key: { flex: 1, minWidth: 0, fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: color.fg },
  value: {
    flex: 1.4,
    textAlign: 'right',
    fontFamily: font.mono,
    fontSize: 12.5,
    lineHeight: 19,
    color: color.fg,
  },
  link: { flex: 1.4, textAlign: 'right', fontFamily: font.medium, fontSize: 13, color: color.amber },
})
