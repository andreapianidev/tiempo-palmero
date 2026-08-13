/**
 * El asa y la fila que asoma siempre: la cifra, el nombre y la línea de
 * contexto.
 *
 * Es lo único que se ve cuando la hoja está en reposo, así que tiene que
 * responder solo: qué se está mirando, cuánto marca y con qué margen. Es
 * también la zona de arrastre —el asa está ahí para eso— y toda ella se puede
 * tocar para subir un escalón.
 */

import { StyleSheet, Text, View } from 'react-native'
import { color, font } from '../../theme'

export interface HeadContent {
  /** La cifra grande, o un glifo cuando lo elegido no es una temperatura. */
  lead: string
  leadColor: string
  title: string
  meta: string
}

export function SheetHead({ lead, leadColor, title, meta }: HeadContent) {
  return (
    <>
      <View style={styles.grab}>
        <View style={styles.bar} />
      </View>
      <View style={styles.head}>
        <Text style={[styles.lead, { color: leadColor }]} numberOfLines={1}>
          {lead}
        </Text>
        <View style={styles.who}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  grab: { paddingTop: 8, paddingBottom: 2, alignItems: 'center' },
  bar: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.28)' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 13,
  },
  lead: {
    fontFamily: font.monoSemibold,
    fontSize: 33,
    lineHeight: 34,
    letterSpacing: -1,
  },
  who: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.semibold, fontSize: 15.5, lineHeight: 19, color: color.fg },
  meta: { fontFamily: font.mono, fontSize: 10.5, lineHeight: 15, color: color.dim },
})
