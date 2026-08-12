/**
 * Bloque de la ficha: un título en versalitas monoespaciadas, una nota
 * opcional que explica qué se está mirando, y el contenido.
 *
 * La nota no es decoración. Es la regla de esta pantalla: cada cifra dice de
 * dónde sale, y las secciones que no son obvias lo explican en una línea.
 */

import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { color, font, space } from '../theme'

interface Props {
  title: string
  note?: string
  /** El primer bloque no lleva la línea de arriba. */
  first?: boolean
  children?: ReactNode
}

export function Section({ title, note, first = false, children }: Props) {
  return (
    <View style={[styles.sec, first && styles.first]}>
      <Text style={styles.h3}>{title.toUpperCase()}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  sec: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    paddingHorizontal: space.sheet,
    paddingVertical: 16,
  },
  first: { borderTopWidth: 0 },
  h3: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    color: color.faint,
  },
  note: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: color.dim,
    marginTop: 6,
  },
})
