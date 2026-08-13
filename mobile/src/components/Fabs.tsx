/**
 * Los botones redondos: capas, mi ubicación y volver a ver la isla entera.
 *
 * Los trazados son los del prototipo, carácter por carácter. El botón de
 * ubicación parpadea en ámbar mientras el GPS busca, que es la única señal que
 * hay de que está pasando algo.
 *
 * El de capas lleva un contador cuando hay alguna encendida. Sin él, cerrar la
 * hoja deja el mapa lleno de senderos y guaguas sin nada que recuerde de dónde
 * salieron ni dónde se apagan.
 */

import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { color, font, radius } from '../theme'
import { Glass } from './Glass'

interface Props {
  locating: boolean
  /** Cuántas capas superpuestas hay encendidas. 0 = sin distintivo. */
  layerCount: number
  /** Senderos con algún aviso ahora mismo. 0 = sin distintivo. */
  alertCount: number
  onLayers: () => void
  onIsland: () => void
  onLocate: () => void
  onReset: () => void
}

export function Fabs({
  locating,
  layerCount,
  alertCount,
  onLayers,
  onIsland,
  onLocate,
  onReset,
}: Props) {
  const pulse = useSharedValue(1)

  useEffect(() => {
    if (locating) {
      pulse.value = withRepeat(withTiming(0.45, { duration: 550 }), -1, true)
    } else {
      cancelAnimation(pulse)
      pulse.value = withTiming(1, { duration: 150 })
    }
  }, [locating, pulse])

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }))
  const stroke = locating ? color.amber : color.fg

  return (
    <View style={styles.stack}>
      <Fab
        label="Capas del mapa"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onLayers()
        }}
        badge={layerCount}
      >
        {/* Tres láminas apiladas: el dibujo universal de «capas». */}
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 3.5l8 4.2-8 4.2-8-4.2zM4.4 12.2l7.6 4 7.6-4M4.4 16.3l7.6 4 7.6-4"
            stroke={layerCount > 0 ? color.amber : color.fg}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Fab>

      {/* Estado de la isla: mar de nubes, cumbre, senderos y agricultura. El
          contador son los senderos con aviso, que es lo único de ahí dentro
          que puede cambiar mientras nadie mira. */}
      <Fab
        label="Estado de la isla"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onIsland()
        }}
        badge={alertCount}
      >
        {/* Dos cumbres cruzadas por la manta de nubes: las dos cosas que esta
            hoja contesta de un vistazo. */}
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <Path
            d="M3.2 18.5l5.4-8.2 3 3.9M11 18.5l4.6-6.6 4.6 6.6z"
            stroke={alertCount > 0 ? color.amber : color.fg}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M2.6 13.2h7.2M14.6 13.2h6.8"
            stroke={alertCount > 0 ? color.amber : color.fg}
            strokeWidth={1.4}
            strokeLinecap="round"
            opacity={0.6}
          />
        </Svg>
      </Fab>

      <Fab
        label="Mi ubicación"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onLocate()
        }}
      >
        <Animated.View style={pulseStyle}>
          <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
            <Circle
              cx={12}
              cy={12}
              r={7}
              stroke={stroke}
              strokeWidth={1.7}
              strokeLinecap="round"
            />
            <Path
              d="M12 2v3M12 19v3M2 12h3M19 12h3"
              stroke={stroke}
              strokeWidth={1.7}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      </Fab>

      <Fab
        label="Ver toda la isla"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onReset()
        }}
      >
        <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4"
            stroke={color.fg}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Fab>
    </View>
  )
}

function Fab({
  label,
  onPress,
  badge = 0,
  children,
}: {
  label: string
  onPress: () => void
  badge?: number
  children: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} encendidas` : label}
      style={({ pressed }) => [pressed && styles.down]}
    >
      <Glass intensity={22} style={styles.fab} fallback={color.floatSolid}>
        {children}
      </Glass>
      {badge > 0 && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  stack: { gap: 9, alignItems: 'flex-end' },
  down: { transform: [{ scale: 0.94 }] },
  fab: {
    width: 46,
    height: 46,
    borderRadius: radius.fab,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: font.monoSemibold, fontSize: 10.5, color: color.onLight },
})
