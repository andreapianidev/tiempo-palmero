/**
 * Punto de un sensor que NO se interpola: calidad del aire, CO₂ y fotómetros.
 *
 * Se dibujan como punto y no como píldora a propósito, igual que en la web: la
 * píldora de temperatura vive dentro de una malla continua y el punto no. Aquí
 * el color es del sensor y de ningún otro sitio.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { color, pillShadow } from '../theme'

interface Props {
  fill: string
  /** Sensor sin lectura fresca: se pinta hueco, nunca con el color anterior. */
  stale?: boolean
  onPress: () => void
  accessibilityLabel: string
}

export const SensorDot = memo(function SensorDot({
  fill,
  stale = false,
  onPress,
  accessibilityLabel,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[
          styles.dot,
          pillShadow,
          stale
            ? { backgroundColor: 'transparent', borderColor: color.faint }
            : { backgroundColor: fill, borderColor: 'rgba(0,0,0,0.55)' },
        ]}
      />
    </Pressable>
  )
})

const styles = StyleSheet.create({
  dot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.5,
  },
})
