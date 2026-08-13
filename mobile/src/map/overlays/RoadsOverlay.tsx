/**
 * Las carreteras insulares: una fuente, una capa y un toque.
 *
 * La web dibuja DOS capas —la que se ve, de 1 a 3 px, y una gemela transparente
 * de 14 px que recoge el clic—, porque acertar un trazo de un píxel con el ratón
 * es imposible y engordar el visible convertiría el mapa del tiempo en un plano
 * de carreteras. Aquí la gemela sobra: `GeoJSONSource` de MapLibre nativo trae
 * una caja de toque de 44×44 puntos, que es justamente lo que hacía falta y lo
 * que Apple pide para cualquier cosa que se toque con el dedo.
 *
 * Van las primeras de todas las capas superpuestas: son el fondo sobre el que
 * se leen las demás, no contenido. Una parada de guagua encima de una carretera
 * tiene que abrir la parada, y eso lo resuelve el orden.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { COLORS } from '@core/lib/mapStyle'
import { readRoad, type RoadRecord } from '@core/lib/roads'

interface Props {
  roads: GeoJSON.FeatureCollection | null
  visible: boolean
  onRoad: (road: RoadRecord, lon: number, lat: number) => void
}

export function RoadsOverlay({ roads, visible, onRoad }: Props) {
  if (!visible || !roads) return null
  return (
    <GeoJSONSource
      id="carreteras"
      data={roads}
      onPress={(e) => {
        const f = e.nativeEvent.features[0]
        if (!f) return
        const [lon, lat] = e.nativeEvent.lngLat
        onRoad(readRoad({ ...(f.properties ?? {}) }), lon, lat)
      }}
    >
      <Layer
        id="carreteras-linea"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': COLORS.road,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 12, 1.4, 16, 3.2],
        }}
      />
    </GeoJSONSource>
  )
}
