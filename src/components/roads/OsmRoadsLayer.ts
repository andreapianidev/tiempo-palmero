/**
 * El viario completo de OpenStreetMap: cuatro capas de línea sobre una fuente.
 *
 * Es la respuesta a un agujero que se veía en cuanto se miraba fuera de una
 * carretera insular: la capa del Cabildo son 61 tramos, y en las medianías de
 * Tijarafe o de Puntagorda el mapa enseñaba paradas de guagua y sensores
 * flotando sobre un relieve sin una sola calle. Aquí hay 19.770 trazados y
 * 3.373 km, que es el viario que de verdad hay en la isla.
 *
 * Cuatro capas y no una porque una sola no puede tener cuatro grosores:
 *
 *   principal  la red que cruza la isla, visible desde el primer zoom.
 *   local      calles de pueblo, desde z11 — antes son una mancha, no un dato.
 *   pista      `track`, DISCONTINUA: pista agrícola o forestal, tierra.
 *   servicio   `service`, continua y más tenue: accesos y aparcamientos.
 *
 * Las dos últimas desde z13: son 14.003 trazados de los 19.770, y encendidas a
 * zoom de isla entera pintan una telaraña gris encima del tiempo, que es lo
 * contrario de lo que esta aplicación enseña. La discontinua es la única
 * distinción que se hace a ojo, y se hace porque en La Palma decide si se pasa
 * con un coche normal o no se pasa.
 *
 * NO se pincha. La ficha de una carretera —código, recorrido, titularidad,
 * longitud oficial— sale del dato del Cabildo, que es quien la publica; esto es
 * el fondo sobre el que se leen las demás capas, y una capa de toque de 19.770
 * líneas se comería el clic de todo lo que hay encima.
 */

import type { Map as MlMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl'
import { COLORS } from '../../lib/mapStyle'

const SRC = 'viario-osm'

export const OSM_ROADS_MAIN = 'viario-osm-principal'
export const OSM_ROADS_LOCAL = 'viario-osm-local'
export const OSM_ROADS_TRACK = 'viario-osm-pista'
export const OSM_ROADS_SERVICE = 'viario-osm-servicio'

/** Todas, de abajo arriba: la principal se pinta ENCIMA de las pistas. */
export const OSM_ROADS_LAYERS = [
  OSM_ROADS_SERVICE,
  OSM_ROADS_TRACK,
  OSM_ROADS_LOCAL,
  OSM_ROADS_MAIN,
] as const

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Zoom desde el que cada nivel deja de ser una mancha y pasa a ser un dato. */
export const OSM_ROADS_MIN_ZOOM = { local: 11, minor: 13 } as const

export const OSM_ROADS_LAYER_SPECS: LayerSpecification[] = [
  {
    id: OSM_ROADS_SERVICE,
    type: 'line',
    source: SRC,
    minzoom: OSM_ROADS_MIN_ZOOM.minor,
    // `t` es la jerarquía y `c` la etiqueta de OSM: el tercer nivel son las dos
    // clases de acceso, y lo que separa una de otra es justo `c`.
    filter: ['all', ['==', ['get', 't'], 3], ['!=', ['get', 'c'], 'track']],
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: {
      'line-color': COLORS.osmService,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 1.5],
    },
  },
  {
    id: OSM_ROADS_TRACK,
    type: 'line',
    source: SRC,
    minzoom: OSM_ROADS_MIN_ZOOM.minor,
    filter: ['all', ['==', ['get', 't'], 3], ['==', ['get', 'c'], 'track']],
    layout: { 'line-cap': 'butt', 'line-join': 'round', visibility: 'none' },
    paint: {
      'line-color': COLORS.osmTrack,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.6, 16, 1.8],
      // El patrón se mide en anchos de línea, así que se estira con el grosor:
      // a z13 son ~1,8 px de trazo y a z16 ~5,4 px, discontinua a los dos zooms.
      'line-dasharray': [3, 2],
    },
  },
  {
    id: OSM_ROADS_LOCAL,
    type: 'line',
    source: SRC,
    minzoom: OSM_ROADS_MIN_ZOOM.local,
    filter: ['==', ['get', 't'], 2],
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: {
      'line-color': COLORS.osmRoadLocal,
      'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 13, 1.1, 16, 2.6],
    },
  },
  {
    id: OSM_ROADS_MAIN,
    type: 'line',
    source: SRC,
    filter: ['==', ['get', 't'], 1],
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: {
      'line-color': COLORS.osmRoadMain,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.7, 12, 1.6, 16, 4],
    },
  },
]

export function addOsmRoadsLayers(map: MlMap, beforeId?: string): void {
  map.addSource(SRC, { type: 'geojson', data: EMPTY })
  for (const spec of OSM_ROADS_LAYER_SPECS) map.addLayer(spec, beforeId)
}

export function setOsmRoadsData(map: MlMap, roads: GeoJSON.FeatureCollection | null): void {
  // Sin `?? EMPTY`: mientras el fichero se descarga, `null` significa «todavía
  // no», y vaciar la fuente haría parpadear lo que ya estuviera pintado.
  if (roads) (map.getSource(SRC) as GeoJSONSource | undefined)?.setData(roads)
}

export function setOsmRoadsVisible(map: MlMap, visible: boolean): void {
  for (const id of OSM_ROADS_LAYERS) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    }
  }
}
