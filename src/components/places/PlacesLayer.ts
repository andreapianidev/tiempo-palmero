/**
 * Los sitios del Cabildo sobre el mapa: una fuente, una capa y un clic.
 *
 * Las cinco capas van juntas en la MISMA fuente, con un campo `kind` que dice
 * de cuál es cada punto, en vez de cinco fuentes y cinco capas. Así el motor
 * resuelve los solapamientos entre todas a la vez —encender miradores y
 * patrimonio no amontona dos rejillas de iconos que se ignoran entre sí— y
 * encender o apagar una es cambiar los datos, no tocar el estilo.
 *
 * Las carreteras son otra cosa y por eso están aquí también pero aparte: son
 * líneas, van por debajo de todo lo demás y no se pinchan. Sirven para situar,
 * que es justo lo que faltaba cuando las paradas de guagua flotaban sobre un
 * relieve sin una sola vía.
 */

import type { Map as MlMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl'
import { COLORS } from '../../lib/mapStyle'

const SRC_PLACES = 'places'
const SRC_ROADS = 'carreteras'

export const PLACES_LAYER = 'places-punto'
export const ROADS_LAYER = 'carreteras-linea'

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Las capas como datos, para poder validarlas contra la especificación. */
export const PLACES_LAYER_SPECS: LayerSpecification[] = [
  {
    id: ROADS_LAYER,
    type: 'line',
    source: SRC_ROADS,
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: {
      'line-color': COLORS.road,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 12, 1.4, 16, 3.2],
    },
  },
  {
    id: PLACES_LAYER,
    type: 'symbol',
    source: SRC_PLACES,
    layout: {
      visibility: 'none',
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.55, 12, 0.75, 16, 1],
      // El propio motor resuelve los solapamientos: a zoom bajo enseña los que
      // caben y esconde el resto, en vez de amontonar 600 discos.
      'icon-allow-overlap': false,
      'icon-padding': 2,
    },
  },
]

interface Handlers {
  onPlace: (props: Record<string, unknown>, lon: number, lat: number) => void
}

export function addPlacesLayers(map: MlMap, handlers: Handlers, beforeId?: string): void {
  map.addSource(SRC_PLACES, { type: 'geojson', data: EMPTY })
  map.addSource(SRC_ROADS, { type: 'geojson', data: EMPTY })
  for (const spec of PLACES_LAYER_SPECS) map.addLayer(spec, beforeId)

  map.on('click', PLACES_LAYER, (e) => {
    const f = e.features?.[0]
    if (!f || f.geometry.type !== 'Point') return
    const [lon, lat] = f.geometry.coordinates as [number, number]
    handlers.onPlace({ ...(f.properties ?? {}) }, lon, lat)
  })
  map.on('mouseenter', PLACES_LAYER, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', PLACES_LAYER, () => {
    map.getCanvas().style.cursor = 'crosshair'
  })
}

export function setPlacesData(map: MlMap, places: GeoJSON.FeatureCollection | null): void {
  ;(map.getSource(SRC_PLACES) as GeoJSONSource | undefined)?.setData(places ?? EMPTY)
}

export function setRoadsData(map: MlMap, roads: GeoJSON.FeatureCollection | null): void {
  if (roads) (map.getSource(SRC_ROADS) as GeoJSONSource | undefined)?.setData(roads)
}

export function setPlacesVisible(map: MlMap, visible: boolean): void {
  if (map.getLayer(PLACES_LAYER)) {
    map.setLayoutProperty(PLACES_LAYER, 'visibility', visible ? 'visible' : 'none')
  }
}

export function setRoadsVisible(map: MlMap, visible: boolean): void {
  if (map.getLayer(ROADS_LAYER)) {
    map.setLayoutProperty(ROADS_LAYER, 'visibility', visible ? 'visible' : 'none')
  }
}
