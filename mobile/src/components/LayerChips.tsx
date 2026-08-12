/**
 * La fila de capas: una tira horizontal de chips de cristal, más el conmutador
 * de la malla al final, en ámbar para que se lea como lo que es —un
 * interruptor— y no como una capa más.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Pressable } from 'react-native'
import * as Haptics from 'expo-haptics'
import { t } from '@core/i18n'
import { LAYERS, type LayerId } from '../layers'
import { color, font, space } from '../theme'
import { Glass } from './Glass'

interface Props {
  active: LayerId
  gridOn: boolean
  onSelect: (layer: LayerId) => void
  onToggleGrid: () => void
}

export function LayerChips({ active, gridOn, onSelect, onToggleGrid }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {LAYERS.map((chip) => (
        <Chip
          key={chip.id}
          label={chip.label}
          pressed={chip.id === active}
          onPress={() => {
            if (chip.id === active) return
            Haptics.selectionAsync()
            onSelect(chip.id)
          }}
        />
      ))}
      <Chip
        label="Malla"
        pressed={gridOn}
        accent
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          onToggleGrid()
        }}
        accessibilityHint={t.layers.grid}
      />
    </ScrollView>
  )
}

function Chip({
  label,
  pressed,
  accent = false,
  onPress,
  accessibilityHint,
}: {
  label: string
  pressed: boolean
  accent?: boolean
  onPress: () => void
  accessibilityHint?: string
}) {
  const background = pressed ? (accent ? color.amber : color.fg) : undefined
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: pressed }}
      accessibilityHint={accessibilityHint}
      style={({ pressed: down }) => [styles.chipHit, down && styles.down]}
    >
      {pressed ? (
        <View style={[styles.chip, styles.chipOn, { backgroundColor: background }]}>
          <Text style={[styles.label, styles.labelOn]}>{label}</Text>
        </View>
      ) : (
        <Glass intensity={18} style={styles.chip}>
          <Text style={styles.label}>{label}</Text>
        </Glass>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: 7,
    paddingHorizontal: space.gutter,
    paddingTop: 2,
    paddingBottom: 8,
    alignItems: 'center',
  },
  chipHit: { borderRadius: 999 },
  down: { opacity: 0.7 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.line,
  },
  chipOn: { borderColor: 'transparent' },
  label: {
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 17,
    color: color.dim,
  },
  labelOn: { color: color.onLight, fontFamily: font.semibold },
})
