/**
 * La mancha de cobertura simulada de TDT sobre el mapa.
 *
 * Es una fuente `image` y no `geojson` porque el dato ES una imagen: 49
 * simulaciones georreferenciadas que se funden en build en un PNG del tamaño
 * exacto del bbox insular (`lib/tdt/mask.ts`). Vectorizar esa mancha sería
 * convertir un ráster en polígonos para volver a rasterizarlo en pantalla.
 *
 * Va justo ENCIMA de la malla interpolada y por debajo de todo lo demás: es un
 * fondo temático, igual que la malla, y compite con ella por el mismo sitio. Que
 * las dos se puedan encender a la vez es a propósito —«¿qué temperatura hace
 * donde no llega el repetidor?» es una pregunta legítima— pero el violeta y la
 * rampa térmica se distinguen sin esfuerzo.
 *
 * `raster-resampling: nearest` y no `linear`: las celdas son de 92 m y sus
 * bordes son sombras de radio, no un degradado. Suavizarlas dibujaría cobertura
 * donde el cálculo dice que no la hay.
 */

import type { Map as MlMap, LayerSpecification } from 'maplibre-gl'
import { ISLAND_BBOX } from '../../lib/geo'
import { dataUrl } from '../../lib/endpoints'

const SRC = 'tdt'
export const TDT_LAYER = 'tdt-raster'

export const TDT_FILE = '/layers/tdt-cobertura.png'

/**
 * Opacidad de la capa entera.
 *
 * El PNG ya trae tres alfas —35 %, 63 % y 90 % según cuántos repetidores
 * alcancen la celda—, así que esto multiplica: el escalón más fuerte queda al
 * 50 % sobre el relieve y el más débil al 19 %, que sigue leyéndose sin tapar el
 * sombreado ni los topónimos.
 */
export const TDT_OPACITY = 0.55

export const TDT_LAYER_SPEC: LayerSpecification = {
  id: TDT_LAYER,
  type: 'raster',
  source: SRC,
  layout: { visibility: 'none' },
  paint: {
    'raster-opacity': TDT_OPACITY,
    'raster-resampling': 'nearest',
    'raster-fade-duration': 0,
  },
}

type Corner = [number, number]

/** Las cuatro esquinas, en el orden que pide MapLibre: NO, NE, SE, SO. */
export function tdtCoordinates(): [Corner, Corner, Corner, Corner] {
  const { west, east, south, north } = ISLAND_BBOX
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ]
}

export function addTdtLayer(map: MlMap, beforeId?: string): void {
  map.addSource(SRC, {
    type: 'image',
    url: dataUrl(TDT_FILE),
    coordinates: tdtCoordinates(),
  })
  map.addLayer(TDT_LAYER_SPEC, beforeId)
}

export function setTdtVisible(map: MlMap, visible: boolean): void {
  if (map.getLayer(TDT_LAYER)) {
    map.setLayoutProperty(TDT_LAYER, 'visibility', visible ? 'visible' : 'none')
  }
}
