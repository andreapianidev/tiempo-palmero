/**
 * El degradado de arriba.
 *
 * Sin él, el título blanco sobre la malla amarilla de Los Llanos es ilegible.
 * Son los tres cortes del prototipo —opaco hasta el 18 %, medio hasta el 55 %,
 * transparente— sobre 190 px de alto.
 */

import { StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

export function TopFade() {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(13,12,11,0.93)', 'rgba(13,12,11,0.60)', 'rgba(13,12,11,0)']}
      locations={[0.18, 0.55, 1]}
      style={styles.fade}
    />
  )
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 190 },
})
