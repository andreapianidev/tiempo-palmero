/**
 * Fila de dato de la ficha: rótulo a la izquierda con su letra pequeña, valor
 * monoespaciado a la derecha, y una barra opcional debajo para el peso.
 *
 * El valor va en monoespaciada siempre. Con proporcional, una columna de cifras
 * baila de fila en fila y deja de poder compararse de un vistazo, que es
 * justamente para lo que está ahí.
 */

import { StyleSheet, Text, View } from 'react-native'
import { color, font } from '../theme'

interface Props {
  label: string
  sub?: string
  value: string
  valueSub?: string
  /** 0–1. Pinta la barra ámbar del peso, como en el prototipo. */
  share?: number
  last?: boolean
}

export function Row({ label, sub, value, valueSub, share, last = false }: Props) {
  return (
    <View>
      <View style={[styles.row, last && styles.last]}>
        <View style={styles.key}>
          <Text style={styles.label}>{label}</Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={styles.valueBox}>
          <Text style={styles.value}>{value}</Text>
          {valueSub ? <Text style={styles.valueSub}>{valueSub}</Text> : null}
        </View>
      </View>
      {share !== undefined && (
        <View style={[styles.bar, { width: `${Math.max(1, Math.round(share * 100))}%` }]} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  last: { borderBottomWidth: 0 },
  key: { flex: 1, minWidth: 0 },
  label: { fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: color.fg },
  sub: { fontFamily: font.mono, fontSize: 10, lineHeight: 14, color: color.faint, marginTop: 2 },
  valueBox: { alignItems: 'flex-end' },
  value: { fontFamily: font.mono, fontSize: 13.5, lineHeight: 19, color: color.fg },
  valueSub: { fontFamily: font.mono, fontSize: 10.5, lineHeight: 14, color: color.faint },
  bar: { height: 3, borderRadius: 2, backgroundColor: color.amber, opacity: 0.75, marginTop: 5 },
})
