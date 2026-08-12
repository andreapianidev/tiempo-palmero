/**
 * La ficha del punto, a pantalla completa.
 *
 * Entra deslizándose desde la derecha con la curva de iOS y se puede cerrar
 * también arrastrando desde el borde izquierdo, que es el gesto que la gente
 * hace sin pensar. El contenido es el mismo que el panel del escritorio, en el
 * mismo orden y con las mismas advertencias: la cifra, de dónde sale, qué no se
 * ha interpolado, qué hay alrededor y cómo de fiable es el modelo.
 */

import { useEffect } from 'react'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
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
import type { Bundle, InterpolableVariable, Model } from '@core/lib/interpolate'
import type { Station, NetworkCensus } from '@core/lib/quality'
import type { DisplayVariable } from '@core/lib/interpolate'
import type { RgbStop } from '@core/lib/palette'
import { n, t } from '@core/i18n'
import { color, duration, easing, font } from '../theme'
import { Glass } from '../components/Glass'
import { Hero } from '../detail/Hero'
import { Contributors } from '../detail/Contributors'
import { Measured } from '../detail/Measured'
import { Nearby } from '../detail/Nearby'
import { Diagnostics } from '../detail/Diagnostics'
import { Row } from '../detail/Row'
import { Section } from '../detail/Section'

const CURVE = Easing.bezier(easing[0], easing[1], easing[2], easing[3])

const UNITS: Record<DisplayVariable, string> = {
  temperature: t.units.celsius,
  relativehumidity: t.units.percent,
  dewpoint: t.units.celsius,
}

const LABELS: Record<DisplayVariable, string> = {
  temperature: t.variables.temperature,
  relativehumidity: t.variables.relativehumidity,
  dewpoint: t.variables.dewpoint,
}

export interface DetailPoint {
  lon: number
  lat: number
  elevation: number
  municipality: string
  title: string
}

interface Props {
  open: boolean
  point: DetailPoint | null
  bundle: Bundle | null
  variable: DisplayVariable
  stops: RgbStop[]
  stations: Station[]
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  now: number
  onClose: () => void
}

export function DetailScreen(props: Props) {
  const { open, point, bundle, variable, stops, stations, models, census, validation, now, onClose } =
    props
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const shown = useSharedValue(0)
  const drag = useSharedValue(0)

  useEffect(() => {
    shown.value = withTiming(open ? 1 : 0, { duration: duration.screen, easing: CURVE })
    if (open) drag.value = 0
  }, [open, shown, drag])

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onClose()
  }

  // Arrastre desde el borde izquierdo. `activeOffsetX` evita que el gesto
  // robe el desplazamiento vertical de la lista.
  const swipe = Gesture.Pan()
    .activeOffsetX(12)
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      if (e.translationX > 0) drag.value = e.translationX
    })
    .onEnd((e) => {
      if (e.translationX > 90 || e.velocityX > 800) {
        runOnJS(close)()
      } else {
        drag.value = withTiming(0, { duration: 180, easing: CURVE })
      }
    })

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - shown.value) * width + drag.value }],
  }), [width])

  const estimate = bundle && point ? bundle[variable] : null
  const secondary =
    bundle && point
      ? (['temperature', 'relativehumidity', 'dewpoint'] as const)
          .filter((v) => v !== variable && bundle[v])
          .map((v) => ({ variable: v, est: bundle[v]! }))
      : []

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        style={[styles.screen, animated]}
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityViewIsModal={open}
      >
        <Glass intensity={40} style={[styles.nav, { paddingTop: insets.top + 8 }]} fallback={color.panel}>
          <Pressable
            onPress={close}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t.common.back}
            style={styles.back}
          >
            <Svg width={11} height={19} viewBox="0 0 12 20" fill="none">
              <Path
                d="M10 2L2 10l8 8"
                stroke={color.amber}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.backLabel}>Mapa</Text>
          </Pressable>
          <Text style={styles.navTitle} numberOfLines={1}>
            {point?.title ?? ''}
          </Text>
        </Glass>

        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          indicatorStyle="white"
        >
          {point && estimate && (
            <>
              <Hero
                estimate={estimate}
                unit={UNITS[variable]}
                decimals={variable === 'relativehumidity' ? 0 : 1}
                derived={variable === 'dewpoint'}
                stops={stops}
                lon={point.lon}
                lat={point.lat}
                elevation={point.elevation}
                municipality={point.municipality}
                now={now}
              />

              {secondary.length > 0 && (
                <Section title="Las otras dos variables">
                  <View style={{ marginTop: 10 }}>
                    {secondary.map(({ variable: v, est }, i) => (
                      <Row
                        key={v}
                        label={LABELS[v]}
                        value={`${n(est.value, v === 'relativehumidity' ? 0 : 1)} ${UNITS[v]}`}
                        valueSub={`± ${n(est.uncertainty, 1)}`}
                        last={i === secondary.length - 1}
                      />
                    ))}
                  </View>
                </Section>
              )}

              {variable === 'dewpoint' && (
                <Section title="Cómo se calcula" note={t.variables.derivedHint} />
              )}

              <Contributors
                estimate={estimate}
                note={contributorsNote(models, point.elevation, variable)}
                now={now}
              />

              <Measured
                stations={stations}
                lon={point.lon}
                lat={point.lat}
                elevation={point.elevation}
                now={now}
              />

              <Nearby lon={point.lon} lat={point.lat} />

              <Diagnostics
                models={models}
                census={census}
                validation={validation}
                neighbours={estimate.contributors.length}
              />
            </>
          )}

          {point && !estimate && (
            <Section title={t.point.title} note={t.errors.noStations} first />
          )}
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  )
}

/** La frase que explica el cálculo, con el gradiente real de este momento. */
function contributorsNote(
  models: Record<InterpolableVariable, Model | null>,
  elevation: number,
  variable: DisplayVariable,
): string {
  const model = variable === 'relativehumidity' ? models.relativehumidity : models.temperature
  if (!model) return t.model.explain
  const perKm = -model.b * 1000
  const unit = variable === 'relativehumidity' ? '%/km' : '°C/km'
  return (
    `Media ponderada por distancia inversa sobre los residuos del ajuste altitudinal, ` +
    `devuelta a ${Math.round(elevation)} m con el gradiente medido ahora mismo, ` +
    `${n(perKm, 2)} ${unit}. Las estaciones anómalas ya se han descartado.`
  )
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.ink,
    zIndex: 20,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backLabel: { fontFamily: font.regular, fontSize: 16, color: color.amber },
  navTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 16,
    color: color.fg,
    marginRight: Platform.OS === 'ios' ? 56 : 40,
  },
  body: { flex: 1 },
})
