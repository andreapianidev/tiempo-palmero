/**
 * La hoja del detalle: siempre en pantalla, y se sube arrastrándola.
 *
 * Sustituye a las dos cosas que había antes —una tarjeta que asomaba y una
 * pantalla entera que entraba desde la derecha— porque eran dos y contaban lo
 * mismo. Al abrir el detalle, el mapa desaparecía: se perdía de vista el punto
 * cuya temperatura se estaba leyendo, que es la mitad de la información.
 *
 * Ahora es una sola superficie con tres alturas (ver `snaps.ts`). Nunca se
 * cierra, así que la cifra del último punto tocado sigue ahí mientras se mueve
 * el mapa, y subirla es el gesto que ya hace todo el mundo sin que nadie se lo
 * explique.
 *
 * El reparto entre arrastrar y desplazar es la única parte delicada, y son dos
 * gestos separados a propósito:
 *
 * - En la cabecera se arrastra siempre. Es el asa; no hay nada que desplazar.
 * - En el cuerpo se arrastra SOLO si la lista está arriba del todo, y no hacia
 *   arriba cuando la hoja ya está abierta del todo. Con una sola regla para las
 *   dos zonas, tirar de la cabecera con la lista a media altura no hacía nada.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { color, duration, easing } from '../../theme'
import { Glass } from '../Glass'
import { SheetHead, type HeadContent } from './SheetHead'
import { SNAP, nearestSnap, nextSnap, snapOffsets, type SnapIndex } from './snaps'

const CURVE = Easing.bezier(easing[0], easing[1], easing[2], easing[3])
const TIMING = { duration: duration.screen, easing: CURVE }

/** Velocidad a partir de la cual el gesto es un lanzamiento y no un arrastre. */
const FLICK = 550

interface Props {
  head: HeadContent
  /** A qué escalón saltar cuando cambia lo elegido. */
  openTo?: SnapIndex
  /** Cambia cuando se elige otra cosa: reinicia el desplazamiento del cuerpo. */
  contentKey: string
  /** Cuánto asoma la hoja en reposo. Los FABs se apoyan encima. */
  onPeekHeight?: (height: number) => void
  children: ReactNode
}

export function DetailSheet({ head, openTo, contentKey, onPeekHeight, children }: Props) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [headHeight, setHeadHeight] = useState(72)
  const [snap, setSnap] = useState<SnapIndex>(SNAP.peek)

  const offsets = snapOffsets({
    height,
    headHeight,
    safeTop: insets.top,
    safeBottom: insets.bottom,
  })

  const y = useSharedValue(offsets[SNAP.peek])
  const start = useSharedValue(0)
  const scrollY = useSharedValue(0)
  const snapV = useSharedValue<number>(SNAP.peek)
  // Las alturas viven también en el hilo de UI: los gestos corren allí y no
  // pueden leer un array de JavaScript sin cruzar el puente en cada dedo.
  const offsetsV = useSharedValue<number[]>([...offsets])

  const settle = useCallback((next: SnapIndex) => {
    setSnap(next)
    Haptics.selectionAsync()
  }, [])

  useEffect(() => {
    onPeekHeight?.(height - offsets[SNAP.peek])
    offsetsV.value = [...offsets]
    y.value = withTiming(offsets[snapV.value as SnapIndex], TIMING)
    // Solo cuando cambian las medidas: mover la hoja al recalcularlas es lo que
    // la deja en su sitio al girar el teléfono o al medir la cabecera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offsets[0], offsets[1], offsets[2]])

  // Elegir algo en el mapa sube la hoja, pero solo si estaba en reposo: quien
  // la ha subido a pantalla completa no quiere que un toque se la baje.
  useEffect(() => {
    if (openTo === undefined) return
    if (snapV.value >= openTo) return
    snapV.value = openTo
    y.value = withTiming(offsetsV.value[openTo], TIMING)
    setSnap(openTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, openTo])

  const goTo = useCallback(
    (next: SnapIndex) => {
      snapV.value = next
      y.value = withTiming(offsetsV.value[next], TIMING)
      settle(next)
    },
    [offsetsV, settle, snapV, y],
  )

  const onDragUpdate = (translationY: number) => {
    'worklet'
    const list = offsetsV.value
    const at = start.value + translationY
    // Un poco de goma por los dos extremos, sin dejar salir la hoja.
    y.value = Math.max(list[SNAP.full] - 24, Math.min(list[SNAP.peek] + 28, at))
  }

  const onDragEnd = (velocityY: number) => {
    'worklet'
    const list = offsetsV.value
    const current = snapV.value as SnapIndex
    let next: SnapIndex
    if (Math.abs(velocityY) > FLICK) {
      // Hacia arriba sube un escalón, hacia abajo baja uno. Un lanzamiento es
      // una intención, no una posición.
      next = Math.max(0, Math.min(2, current + (velocityY < 0 ? 1 : -1))) as SnapIndex
    } else {
      next = nearestSnap([list[0], list[1], list[2]] as const, y.value)
    }
    snapV.value = next
    y.value = withTiming(list[next], TIMING)
    runOnJS(settle)(next)
  }

  const headPan = Gesture.Pan()
    .onBegin(() => {
      start.value = y.value
    })
    .onUpdate((e) => onDragUpdate(e.translationY))
    .onEnd((e) => onDragEnd(e.velocityY))

  const headTap = Gesture.Tap().onEnd((_e, ok) => {
    if (ok) runOnJS(goTo)(nextSnap(snapV.value as SnapIndex))
  })

  /** Dónde empezó el dedo, para saber hacia dónde va antes de decidir. */
  const touchOrigin = useSharedValue(0)

  const bodyPan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      touchOrigin.value = e.allTouches[0]?.absoluteY ?? 0
    })
    .onTouchesMove((e, state) => {
      const at = e.allTouches[0]?.absoluteY
      if (at === undefined) return
      const dy = at - touchOrigin.value
      // Antes de moverse de verdad no se decide nada: un roce no es ni un
      // arrastre ni un desplazamiento.
      if (Math.abs(dy) < 8) return
      // La lista no está en su origen: primero se termina de desplazar.
      if (scrollY.value > 0) state.fail()
      // Abierta del todo y el dedo sube: eso es leer, no arrastrar.
      else if (snapV.value === SNAP.full && dy < 0) state.fail()
      else state.activate()
    })
    .onStart(() => {
      start.value = y.value
    })
    .onUpdate((e) => onDragUpdate(e.translationY))
    .onEnd((e) => onDragEnd(e.velocityY))

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y
  })

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }))
  // En reposo el cuerpo no se ve: la cabecera ya lo cuenta, y una ficha entera
  // asomando por debajo del asa se lee como un corte, no como un resumen.
  const bodyStyle = useAnimatedStyle(() => {
    const list = offsetsV.value
    const span = Math.max(1, list[SNAP.peek] - list[SNAP.half])
    return { opacity: Math.max(0, Math.min(1, (list[SNAP.peek] - y.value) / span)) }
  })

  return (
    <Animated.View style={[styles.sheet, sheetStyle]}>
      <Glass intensity={40} style={styles.glass} fallback={color.panel}>
        <GestureDetector gesture={Gesture.Race(headPan, headTap)}>
          <View onLayout={(e) => setHeadHeight(Math.round(e.nativeEvent.layout.height))}>
            <SheetHead {...head} />
          </View>
        </GestureDetector>

        <GestureDetector gesture={bodyPan}>
          <Animated.View style={[styles.body, bodyStyle]}>
            <ScrollView
              key={contentKey}
              onScroll={onScroll}
              scrollEventThrottle={16}
              scrollEnabled={snap !== SNAP.peek}
              showsVerticalScrollIndicator={false}
              indicatorStyle="white"
              contentContainerStyle={{ paddingBottom: insets.bottom + 44 }}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </Glass>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 700,
  },
  glass: {
    flex: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.line,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    minHeight: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
})

export { SNAP, type SnapIndex }
export type { HeadContent }
