/**
 * El cristal esmerilado de los paneles flotantes.
 *
 * En iOS es un `UIVisualEffectView` de verdad: el mapa se ve moverse detrás del
 * chip mientras se arrastra, que es la mitad de por qué el prototipo se ve como
 * se ve. Android también lo soporta desde `expo-blur`, pero cuesta caro en
 * fotogramas sobre un mapa animado, así que allí se cae a un color sólido —el
 * mismo que el prototipo pone bajo el desenfoque— y nadie echa nada de menos.
 */

import type { ReactNode } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { color } from '../theme'

interface Props {
  intensity?: number
  style?: StyleProp<ViewStyle>
  /** Color de respaldo. Por defecto, el de los chips del prototipo. */
  fallback?: string
  children: ReactNode
}

export function Glass({ intensity = 24, style, fallback = color.float, children }: Props) {
  if (Platform.OS !== 'ios') {
    return <View style={[styles.base, { backgroundColor: fallback }, style]}>{children}</View>
  }
  return (
    <BlurView intensity={intensity} tint="dark" style={[styles.base, style]}>
      {/* El desenfoque solo mezcla; el tono oscuro del panel lo pone esta capa,
          igual que el `background` del CSS bajo el `backdrop-filter`. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]} pointerEvents="none" />
      {children}
    </BlurView>
  )
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
})
