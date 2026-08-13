/**
 * Una casilla de la hoja de capas: etiqueta a la izquierda, interruptor a la
 * derecha.
 *
 * El interruptor es el del sistema y no uno dibujado. En un teléfono ese
 * control ya significa «esto se enciende y se apaga» sin que nadie tenga que
 * aprenderlo, y además llega con el tamaño de toque, el gesto de arrastre y la
 * lectura de VoiceOver puestos.
 */

import { StyleSheet, Switch, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { color, font } from '../theme'

interface Props {
  label: string
  value: boolean
  onChange: () => void
  /** Una línea bajo la etiqueta cuando hace falta explicar la capa. */
  note?: string
}

export function SwitchRow({ label, value, onChange, note }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {note ? <Text style={styles.note}>{note}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={() => {
          Haptics.selectionAsync()
          onChange()
        }}
        trackColor={{ false: color.pillDim, true: color.amber }}
        thumbColor={color.fg}
        ios_backgroundColor={color.pillDim}
        accessibilityLabel={label}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  body: { flex: 1, minWidth: 0 },
  label: { fontFamily: font.regular, fontSize: 15, lineHeight: 20, color: color.fg },
  note: { fontFamily: font.mono, fontSize: 10.5, lineHeight: 15, color: color.faint, marginTop: 2 },
})
