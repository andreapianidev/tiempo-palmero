/**
 * La red de senderos y sus 1.190 puntos de interés.
 *
 * Los dos van juntos en una casilla porque son una sola cosa: un sendero sin
 * sus fuentes, refugios y miradores es una línea, y los puntos sueltos sin el
 * trazado no se sabe a qué ruta pertenecen.
 *
 * Los puntos van agrupados —`cluster`— hasta z14. Sin agrupar, a la escala de
 * la isla son 1.190 discos de 22 px sobre un mapa de 393 de ancho: no es un
 * mapa de puntos de interés, es un mapa tapado. Agrupados se lee dónde se
 * concentran, y al acercarse se abren solos.
 *
 * Los datos vienen de `useIslandData()`, ya cargados desde el arranque, así que
 * encender esta casilla no descarga nada.
 */

import { useMemo } from 'react'
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { COLORS } from '@core/lib/mapStyle'
import { decoratePoiCollection, readPoi, type PoiRecord } from '@core/lib/poi'
import { ICON_SCALE } from '../icons'

interface Props {
  /** Tal cual salen de `useIslandData()`, sin tipar: son ficheros de la fuente. */
  trails: unknown | null
  pois: unknown | null
  icons: Record<string, string> | null
  visible: boolean
  onPoi: (poi: PoiRecord) => void
}

const S = ICON_SCALE

export function TrailsOverlay({ trails, pois, icons, visible, onPoi }: Props) {
  // Cada punto lleva su icono y su familia según el `subtipo`, que es lo único
  // que distingue un restaurante de un barranco. Se hace una vez, no en cada
  // fotograma: son 1.190.
  const decorated = useMemo(
    () => (pois ? decoratePoiCollection(pois as GeoJSON.FeatureCollection) : null),
    [pois],
  )

  if (!visible) return null
  return (
    <>
      {trails ? (
        <GeoJSONSource id="trails" data={trails as GeoJSON.FeatureCollection}>
          <Layer
            id="trails-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': COLORS.trail,
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 2.2],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {decorated && icons ? (
        <GeoJSONSource
          id="trail-pois"
          data={decorated}
          cluster
          clusterRadius={45}
          clusterMaxZoom={14}
          onPress={(e) => {
            const f = e.nativeEvent.features[0]
            // Un grupo no tiene ficha: se abre acercándose, que es lo que hace
            // el propio mapa. Tocarlo no debe abrir la ficha de uno cualquiera
            // de los puntos que hay debajo.
            if (!f || f.properties?.point_count || f.geometry.type !== 'Point') return
            const [lon, lat] = f.geometry.coordinates as [number, number]
            onPoi(readPoi({ ...(f.properties ?? {}) }, lon, lat))
          }}
        >
          <Layer
            id="trail-pois-cluster"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': 'rgba(226,197,106,0.28)',
              'circle-stroke-color': 'rgba(226,197,106,0.65)',
              'circle-stroke-width': 1,
              'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 9, 200, 22],
            }}
          />
          <Layer
            id="trail-pois-point"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'icon-image': ['get', 'icon'],
              'icon-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                12,
                0.62 / S,
                14,
                0.85 / S,
                16,
                1 / S,
              ],
              'icon-allow-overlap': false,
              'icon-padding': 1,
            }}
          />
        </GeoJSONSource>
      ) : null}
    </>
  )
}
