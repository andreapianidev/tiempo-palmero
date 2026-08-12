/**
 * Viento en una estación: flecha y velocidad, como en el prototipo.
 *
 * La flecha apunta HACIA DONDE VA el aire, por eso el giro es la dirección
 * medida más 180°: la convención meteorológica da de dónde viene. Es la misma
 * corrección que hace la ficha del punto en la web.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { color, font } from '../theme'

interface Props {
  speedKmh: number
  /** Grados meteorológicos: de dónde viene. `null` si la estación no lo da. */
  direction: number | null
  onPress: () => void
  accessibilityLabel: string
}

export const WindPin = memo(function WindPin({
  speedKmh,
  direction,
  onPress,
  accessibilityLabel,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.arrow,
          { transform: [{ rotate: `${(direction ?? 0) + 180}deg` }] },
        ]}
      />
      <Text style={styles.speed}>{Math.round(speedKmh)}</Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Triángulo con bordes, igual que el `.arrow` del prototipo.
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: color.amber,
  },
  speed: {
    fontFamily: font.mono,
    fontSize: 11,
    color: color.fg,
    textShadowColor: '#000',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
})
