/**
 * Una fila de etiquetas: destinos de una línea, categoría de un sitio, nivel de
 * servicio de una parada.
 *
 * Envuelven, no se desplazan. Una línea con nueve cabeceras tiene nueve
 * cabeceras, y esconder seis detrás de un gesto horizontal dentro de una hoja
 * que ya se arrastra en vertical es pedir que nadie las vea.
 */

import { StyleSheet, Text, View } from 'react-native'
import { color, font } from '../theme'

interface Props {
  labels: string[]
  /** Fondo sólido, para la etiqueta que identifica de qué se trata. */
  tint?: string
}

export function Chips({ labels, tint }: Props) {
  if (!labels.length) return null
  return (
    <View style={styles.row}>
      {labels.map((label) => (
        <View
          key={label}
          style={[styles.chip, tint ? { backgroundColor: tint, borderColor: 'transparent' } : null]}
        >
          <Text style={[styles.label, tint ? styles.onTint : null]}>{label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.line,
  },
  label: { fontFamily: font.medium, fontSize: 12.5, lineHeight: 16, color: color.dim },
  onTint: { color: color.onLight, fontFamily: font.semibold },
})
