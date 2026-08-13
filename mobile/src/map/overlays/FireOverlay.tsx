/**
 * Las cuatro cámaras de incendios.
 *
 * Cuatro: el triángulo relleno cuando la cámara declara alerta y hueco cuando
 * no. La ausencia de alerta no prueba que no haya fuego, y eso lo dice la ficha
 * —aquí solo se dibuja lo que la red publica.
 *
 * Esta red no lleva ninguna marca de tiempo, así que un pin no puede envejecer:
 * lo único que se sabe es cuándo lo preguntamos nosotros, y eso también va en
 * la ficha, no en el mapa.
 */

import { Marker } from '@maplibre/maplibre-react-native'
import { Pressable, StyleSheet, Text } from 'react-native'
import type { FireCamera } from '@core/hooks/useIslandData'
import { t } from '@core/i18n'
import { color, font, pillShadow } from '../../theme'

interface Props {
  cameras: FireCamera[]
  visible: boolean
  onCamera: (camera: FireCamera) => void
}

export function FireOverlay({ cameras, visible, onCamera }: Props) {
  if (!visible) return null
  return (
    <>
      {cameras.map((camera) => (
        <Marker key={`fuego-${camera.name}`} lngLat={[camera.lon, camera.lat]}>
          <Pressable
            onPress={() => onCamera(camera)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`${camera.name}: ${
              camera.hasAlert ? t.fire.alert : t.fire.noAlert
            }`}
          >
            <Text
              style={[styles.glyph, pillShadow, camera.hasAlert ? styles.alert : styles.calm]}
            >
              {camera.hasAlert ? '▲' : '△'}
            </Text>
          </Pressable>
        </Marker>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  glyph: { fontFamily: font.semibold, fontSize: 15, lineHeight: 19 },
  alert: { color: color.bad },
  calm: { color: color.dim },
})
