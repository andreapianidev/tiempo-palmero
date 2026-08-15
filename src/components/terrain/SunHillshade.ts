/**
 * El sombreado del relieve, otra vez, pero ENCIMA del fondo fotográfico.
 *
 * QUÉ PROBLEMA RESUELVE. La capa `hillshade` del estilo va debajo de los fondos
 * de GRAFCAN y la ortofoto es opaca: con el fondo «Satélite» puesto, el
 * interruptor de luz solar no cambiaba un solo píxel. Las sombras arrojadas sí
 * se veían —van encima de los fondos, ver `shadow/ShadowLayer.ts`—, así que la
 * mitad de la función funcionaba sobre la foto y la otra mitad no.
 *
 * NO ES OTRA LUZ NI OTRO CÁLCULO. Es la misma capa `hillshade`, sobre la misma
 * fuente `raster-dem` que ya está cargada —cero teselas nuevas, cero peticiones,
 * cero shaders— con la misma dirección y la misma exageración que la de abajo.
 * Lo único que cambia es la opacidad de sus tres colores, medida en
 * `lib/terrain-light-photo.ts` contra teselas reales.
 *
 * SE DIBUJA SOLA EN 3D. `hillshade` es uno de los tipos que MapLibre drapea
 * sobre el terreno (ver la cabecera de `Terrain3D.ts`), así que esta capa se
 * pega al relieve inclinado igual que la de abajo, sin hacer nada.
 *
 * DÓNDE VA: después de los fondos y ANTES de las sombras arrojadas. Primero lo
 * que la ladera recibe por su orientación, después lo que le quita lo que tiene
 * delante — el mismo orden en que ocurren.
 */

import type { Map as MlMap, HillshadeLayerSpecification } from 'maplibre-gl'
import type { BasemapId } from '../../lib/basemaps'
import { BASEMAPS } from '../../lib/basemaps'
import type { TerrainLight } from '../../lib/terrain-light'
import { photoLight } from '../../lib/terrain-light-photo'

export const SUN_HILLSHADE_LAYER_ID = 'hillshade-sobre-fondo'

/**
 * La capa, apagada. La fuente es la misma `terrain` del estilo: si algún día
 * deja de llamarse así, esto se queda sin dibujar y el mapa no dice nada.
 */
export function sunHillshadeLayer(): HillshadeLayerSpecification {
  return {
    id: SUN_HILLSHADE_LAYER_ID,
    type: 'hillshade',
    source: 'terrain',
    layout: { visibility: 'none' },
  }
}

/**
 * Enciende, apaga y repinta la capa.
 *
 * Se apaga cuando el interruptor está quitado Y cuando el fondo no la necesita
 * —el relieve la lleva debajo, la carta topográfica no la quiere—, y en ese caso
 * ni se calculan los colores.
 */
export function applySunHillshade(
  map: MlMap,
  options: { on: boolean; basemap: BasemapId; light: TerrainLight },
): void {
  if (!map.getLayer(SUN_HILLSHADE_LAYER_ID)) return
  const wanted = options.on && BASEMAPS[options.basemap].sunShading
  map.setLayoutProperty(SUN_HILLSHADE_LAYER_ID, 'visibility', wanted ? 'visible' : 'none')
  if (!wanted) return
  const light = photoLight(options.light)
  map.setPaintProperty(SUN_HILLSHADE_LAYER_ID, 'hillshade-illumination-direction', light.direction)
  map.setPaintProperty(SUN_HILLSHADE_LAYER_ID, 'hillshade-exaggeration', light.exaggeration)
  map.setPaintProperty(SUN_HILLSHADE_LAYER_ID, 'hillshade-highlight-color', light.highlight)
  map.setPaintProperty(SUN_HILLSHADE_LAYER_ID, 'hillshade-shadow-color', light.shadow)
  map.setPaintProperty(SUN_HILLSHADE_LAYER_ID, 'hillshade-accent-color', light.accent)
}
