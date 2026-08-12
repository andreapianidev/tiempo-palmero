/**
 * La tarjeta que asoma abajo al tocar el mapa.
 *
 * Enseña lo mínimo para decidir si merece la pena abrir la ficha: la cifra, el
 * sitio, la altitud y el margen. El margen va aquí, no solo en la ficha, porque
 * es lo que separa «22,0 °C» de «22,0 °C ± 1,0», y la primera lectura es la que
 * hace la gente si se lo pones fácil.
 *
 * Entra y sale con la curva del prototipo, `cubic-bezier(.32,.72,0,1)`.
 */

import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { color, duration, easing, font, radius, cardShadow } from '../theme'
import { Glass } from './Glass'

interface Props {
  visible: boolean
  /** Cifra grande ya formateada, con su unidad: «22,0°». */
  value: string
  valueColor: string
  title: string
  meta: string
  onPress: () => void
}

const CURVE = Easing.bezier(easing[0], easing[1], easing[2], easing[3])

export function PeekCard({ visible, value, valueColor, title, meta, onPress }: Props) {
  const shown = useSharedValue(0)

  useEffect(() => {
    shown.value = withTiming(visible ? 1 : 0, { duration: duration.peek, easing: CURVE })
  }, [visible, shown])

  const animated = useAnimatedStyle(() => ({
    // 140 % de su propio alto, como el `translateY(140%)` del prototipo. Con
    // 120 px de tarjeta son 168 px por debajo del borde.
    transform: [{ translateY: (1 - shown.value) * 168 }],
    opacity: shown.value,
  }))

  return (
    <Animated.View style={[styles.wrap, animated]} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${value}. Abrir la ficha`}
        style={({ pressed }) => pressed && styles.down}
      >
        <Glass intensity={40} style={styles.card} fallback={color.panel}>
          <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
            {value}
          </Text>
          <View style={styles.who}>
            <Text style={styles.name} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          </View>
          <Text style={styles.go}>›</Text>
        </Glass>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, bottom: 26 },
  down: { opacity: 0.9 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.line,
    ...cardShadow,
  },
  value: {
    fontFamily: font.monoSemibold,
    fontSize: 34,
    letterSpacing: -1,
    lineHeight: 36,
  },
  who: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: font.semibold,
    fontSize: 15,
    lineHeight: 19,
    color: color.fg,
  },
  meta: {
    fontFamily: font.mono,
    fontSize: 10.5,
    lineHeight: 14,
    color: color.dim,
  },
  go: { fontSize: 20, color: color.faint, fontFamily: font.regular },
})
