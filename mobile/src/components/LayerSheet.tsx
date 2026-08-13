/**
 * La hoja de capas: lo que la web resuelve con una barra lateral siempre a la
 * vista.
 *
 * En un escritorio los interruptores caben al lado del mapa y no estorban. En
 * 393 px no cabe nada al lado, y ponerlos como chips arriba mentiría sobre lo
 * que son: los chips son excluyentes —una forma de mirar— y esto son cosas que
 * se superponen, varias a la vez. Así que van en una hoja que sube desde abajo,
 * se usa, y se va.
 *
 * Los avisos de la red de guaguas son los mismos que la barra lateral: mientras
 * bajan 1,5 MB lo dice, y si el zoom todavía no da para ver las paradas también,
 * porque una casilla marcada sobre un mapa que no cambia se lee como una capa
 * rota.
 */

import { useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { t } from '@core/i18n'
import type { PlaceKind } from '@core/lib/places'
import { OVERLAYS, PLACE_SWITCHES, type OverlayId } from '../overlays'
import { color, duration, easing, font, space } from '../theme'
import { Glass } from './Glass'
import { SwitchRow } from './SwitchRow'

const CURVE = Easing.bezier(easing[0], easing[1], easing[2], easing[3])

interface Props {
  open: boolean
  visible: Record<OverlayId, boolean>
  places: Record<PlaceKind, boolean>
  guaguaLoading: boolean
  /** El zoom actual ya da para ver las paradas. */
  stopsZoomReached: boolean
  placesLoading: boolean
  countersError: boolean
  onToggle: (id: OverlayId) => void
  onTogglePlace: (kind: PlaceKind) => void
  onClose: () => void
}

export function LayerSheet(props: Props) {
  const { open, visible, places, onToggle, onTogglePlace, onClose } = props
  const insets = useSafeAreaInsets()
  const shown = useSharedValue(0)

  useEffect(() => {
    shown.value = withTiming(open ? 1 : 0, { duration: duration.peek, easing: CURVE })
  }, [open, shown])

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value * 0.55 }))
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - shown.value) * 620 }],
  }))

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose()
  }

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

      <Animated.View style={[styles.wrap, sheet]}>
        <Glass intensity={40} style={styles.sheet} fallback={color.panel}>
          <View style={styles.grab} />
          <Text style={styles.title}>Capas del mapa</Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + 18 }}
            showsVerticalScrollIndicator={false}
            indicatorStyle="white"
          >
            {OVERLAYS.map((layer) => (
              <SwitchRow
                key={layer.id}
                label={layer.label}
                value={visible[layer.id]}
                onChange={() => onToggle(layer.id)}
                note={noteFor(layer.id, props)}
              />
            ))}

            <Text style={styles.group}>{t.places.title.toUpperCase()}</Text>
            <Text style={styles.groupNote}>{t.places.hint}</Text>

            {PLACE_SWITCHES.map((place) => (
              <SwitchRow
                key={place.kind}
                label={place.label}
                value={places[place.kind]}
                onChange={() => onTogglePlace(place.kind)}
              />
            ))}

            {props.placesLoading && <Text style={styles.hint}>Descargando la capa…</Text>}
          </ScrollView>
        </Glass>
      </Animated.View>
    </View>
  )
}

/** El aviso que le toca a cada capa ahora mismo, o ninguno. */
function noteFor(id: OverlayId, props: Props): string | undefined {
  if (id === 'guagua' && props.visible.guagua) {
    if (props.guaguaLoading) return t.guagua.loading
    if (!props.stopsZoomReached) return t.guagua.zoomForStops
  }
  if (id === 'counters' && props.visible.counters && props.countersError) {
    return t.errors.upstreamDown
  }
  return undefined
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
    maxHeight: 560,
  },
  grab: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.line,
    marginBottom: 12,
  },
  title: { fontFamily: font.semibold, fontSize: 17, color: color.fg, marginBottom: 4 },
  list: { flexGrow: 0 },
  group: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    color: color.faint,
    marginTop: 20,
  },
  groupNote: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 19,
    color: color.dim,
    marginTop: 6,
    marginBottom: 4,
  },
  hint: { fontFamily: font.mono, fontSize: 10.5, color: color.faint, marginTop: 12 },
})
