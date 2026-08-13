/**
 * Los sitios del Cabildo: miradores, interés turístico, cultural e histórico,
 * zonas recreativas y recarga eléctrica.
 *
 * Las seis capas comparten UNA fuente con un campo `kind` dentro, igual que en
 * la web: así el motor resuelve los solapamientos entre todas a la vez —
 * encender miradores y patrimonio no amontona dos rejillas de iconos que se
 * ignoran— y apagar una es quitar sus puntos, no tocar el estilo.
 *
 * Los iconos no se declaran aquí: llegan ya rasterizados en `icons`, que los
 * dibuja con Skia a partir de los mismos trazos que la web. La capa no se monta
 * hasta que están, porque una capa de símbolos cuyas imágenes no existen se
 * pinta vacía.
 *
 * El tamaño es el de la web dividido por `ICON_SCALE`: allí el bitmap se
 * registra a ×2 y MapLibre lo sabe; aquí llega como PNG suelto y el motor lo
 * mide en puntos de pantalla, así que la reducción va en la expresión.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { readPlace, type PlaceRecord } from '@core/lib/places'
import { ICON_SCALE } from '../icons'

interface Props {
  places: GeoJSON.FeatureCollection
  icons: Record<string, string> | null
  onPlace: (place: PlaceRecord) => void
}

const S = ICON_SCALE

export function PlacesOverlay({ places, icons, onPlace }: Props) {
  if (!icons || !places.features.length) return null
  return (
    <GeoJSONSource
      id="places"
      data={places}
      onPress={(e) => {
        const f = e.nativeEvent.features[0]
        if (!f || f.geometry.type !== 'Point') return
        const [lon, lat] = f.geometry.coordinates as [number, number]
        onPlace(readPlace({ ...(f.properties ?? {}) }, lon, lat))
      }}
    >
      <Layer
        id="places-punto"
        type="symbol"
        layout={{
          'icon-image': ['get', 'icon'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.55 / S, 12, 0.75 / S, 16, 1 / S],
          // El motor esconde los que no caben en vez de amontonar 600 discos.
          'icon-allow-overlap': false,
          'icon-padding': 2,
        }}
      />
    </GeoJSONSource>
  )
}
