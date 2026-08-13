/**
 * El armazón de las fichas de las capas: parada, línea, sitio, carretera,
 * aforo, punto de sendero y cámara.
 *
 * No es la ficha del punto. Esa es una pantalla entera —`DetailScreen`— porque
 * lo que enseña es una estimación con su procedencia, sus vecinos y su
 * diagnóstico, y eso ocupa una pantalla. Estas otras son lecturas de un dato ya
 * publicado: media hoja basta, y media hoja deja el mapa visible detrás, que es
 * justo lo que hace falta cuando lo que se está leyendo ES un punto del mapa.
 *
 * Se cierra tocando fuera, arrastrando hacia abajo o con el botón. Las tres,
 * porque las tres son gestos que la gente hace sin pensar.
 */

import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { t } from '@core/i18n'
import { color, duration, easing, font, space } from '../theme'
import { Glass } from '../components/Glass'

const CURVE = Easing.bezier(easing[0], easing[1], easing[2], easing[3])

/** Cuánto hay que arrastrar para que se cierre en vez de volver a su sitio. */
const DISMISS = 110

interface Props {
  open: boolean
  title: string
  /** La línea pequeña bajo el título: qué clase de cosa es esto. */
  kind: string
  onClose: () => void
  children: ReactNode
}

export function InfoSheet({ open, title, kind, onClose, children }: Props) {
  const insets = useSafeAreaInsets()
  const shown = useSharedValue(0)
  const drag = useSharedValue(0)

  useEffect(() => {
    shown.value = withTiming(open ? 1 : 0, { duration: duration.peek, easing: CURVE })
    if (open) drag.value = 0
  }, [open, shown, drag])

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose()
  }

  // `failOffsetY(-8)` para que un arrastre hacia arriba sea de la lista y no de
  // la hoja: si no, leer una ficha larga la cierra.
  const swipe = Gesture.Pan()
    .activeOffsetY(14)
    .failOffsetY(-8)
    .onUpdate((e) => {
      if (e.translationY > 0) drag.value = e.translationY
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS || e.velocityY > 900) runOnJS(close)()
      else drag.value = withTiming(0, { duration: 180, easing: CURVE })
    })

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value * 0.55 }))
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * 680 + drag.value }],
  }))

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[styles.scrim, scrim]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t.common.back}
        />
      </Animated.View>

      <GestureDetector gesture={swipe}>
        <Animated.View style={[styles.wrap, sheet]} accessibilityViewIsModal={open}>
          <Glass intensity={40} style={styles.sheet} fallback={color.panel}>
            <View style={styles.grab} />
            <Text style={styles.kind}>{kind.toUpperCase()}</Text>
            <Text style={styles.title}>{title}</Text>
            <ScrollView
              style={styles.body}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              showsVerticalScrollIndicator={false}
              indicatorStyle="white"
            >
              {children}
            </ScrollView>
          </Glass>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingHorizontal: space.sheet,
    paddingTop: 8,
    maxHeight: 600,
  },
  grab: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.line,
    marginBottom: 12,
  },
  kind: { fontFamily: font.monoMedium, fontSize: 10, letterSpacing: 1.1, color: color.faint },
  title: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, color: color.fg, marginTop: 3 },
  body: { flexGrow: 0, marginTop: 12 },
})
