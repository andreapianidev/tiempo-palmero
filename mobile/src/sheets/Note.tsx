/**
 * La letra pequeña de una ficha: de dónde sale el dato, qué no dice y a dónde
 * ir a comprobarlo.
 *
 * Tiene componente propio porque en esta app la nota no es un pie de página
 * opcional: es la regla. Cada cifra dice de dónde viene, y un enlace a la
 * fuente que hubiera que maquetar a mano en cada ficha acabaría faltando en
 * alguna.
 */

import { Linking, StyleSheet, Text } from 'react-native'
import { color, font } from '../theme'

interface Props {
  children: string
  /** Si se da, la nota termina en un enlace a la fuente. */
  link?: { label: string; url: string }
  /** En ámbar: para lo que hay que leer antes de fiarse del dato. */
  warn?: boolean
}

export function Note({ children, link, warn = false }: Props) {
  return (
    <Text style={[styles.note, warn && styles.warn]}>
      {children}
      {link ? (
        <Text style={styles.link} onPress={() => Linking.openURL(link.url)}>
          {'  '}
          {link.label} →
        </Text>
      ) : null}
    </Text>
  )
}

const styles = StyleSheet.create({
  note: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: color.dim,
    marginTop: 10,
  },
  warn: { color: color.warn },
  link: { color: color.amber, fontFamily: font.medium },
})
