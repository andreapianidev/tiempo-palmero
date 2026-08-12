/**
 * Cabecera: el nombre y la línea de estado de la red.
 *
 * La línea de abajo es la que dice si lo que se está mirando vale: cuántas
 * estaciones publican de cuántas hay, y cuántas celdas ha podido calcular la
 * malla. Si el Cabildo no responde, lo dice ahí y no en un diálogo.
 */

import { StyleSheet, Text, View } from 'react-native'
import { t } from '@core/i18n'
import { color, font, space } from '../theme'

interface Props {
  /** Trozos de la línea de estado. Los marcados van en ámbar. */
  status: { text: string; strong?: boolean }[]
}

export function Header({ status }: Props) {
  return (
    <View style={styles.head} pointerEvents="none">
      <Text style={styles.title}>{t.app.name}</Text>
      <Text style={styles.sub} numberOfLines={2}>
        {status.map((part, i) => (
          <Text key={i} style={part.strong ? styles.strong : undefined}>
            {i > 0 ? ' · ' : ''}
            {part.text}
          </Text>
        ))}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.gutter },
  title: {
    fontFamily: font.bold,
    fontSize: 21,
    letterSpacing: -0.42,
    color: color.fg,
  },
  sub: {
    fontFamily: font.mono,
    fontSize: 9.5,
    lineHeight: 13,
    letterSpacing: 0.86,
    color: color.dim,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  strong: { color: color.amber, fontFamily: font.monoMedium },
})
