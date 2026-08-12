/**
 * El pin de una estación, con los tres estados del prototipo: píldora de color,
 * punto, y nada.
 *
 * El anillo de frescura es el mismo recurso que en la web —un borde de color
 * alrededor de la píldora— y sale de `FRESHNESS_COLOR`, así que una estación
 * muda se ve igual de muda en las tres plataformas.
 */

import { memo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { FRESHNESS_COLOR } from '@core/lib/palette'
import { freshness } from '@core/lib/quality'
import { color, font, pillShadow } from '../theme'
import type { PinState } from './declutter'

/** Aquí no llega el estado `hidden`: ese pin no se monta siquiera. */
type VisibleState = Exclude<PinState, 'hidden'>

interface Props {
  label: string
  /** Fondo de la píldora. Gris cuando el valor está descartado o no existe. */
  background: string
  text: string
  ageHours: number
  state: VisibleState
  onPress: () => void
  accessibilityLabel: string
}

export const StationPin = memo(function StationPin({
  label,
  background,
  text,
  ageHours,
  state,
  onPress,
  accessibilityLabel,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {state === 'dot' ? (
        <View style={styles.dot} />
      ) : (
        <View
          style={[
            styles.pill,
            pillShadow,
            { backgroundColor: background, borderColor: FRESHNESS_COLOR[freshness(ageHours)] },
          ]}
        >
          <Text style={[styles.pillText, { color: text }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pillText: {
    fontFamily: font.monoSemibold,
    fontSize: 12,
    lineHeight: 15,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color.dot,
    opacity: 0.7,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.6)',
  },
})
