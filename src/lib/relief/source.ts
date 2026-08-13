/**
 * Cómo se declara el relieve en el estilo: una fuente raster y una capa.
 *
 * Está aparte del estilo porque `mapStyle.ts` es el armazón del mapa y esto es
 * una capa concreta con sus propias reglas — el mismo criterio por el que los
 * fondos de GRAFCAN viven en `basemaps.ts`.
 *
 * TESELAS DE 512 Y NO DE 256. En el retículo de MapLibre el tamaño de tesela
 * decide qué nivel se pide: con 256 se pide `round(zoom) + 1` y con 512 se pide
 * `round(zoom)`. O sea que declarando 512 cada tesela cubre el mismo trozo de
 * isla que la del modelo pero con el doble de píxeles por lado — el sombreado
 * se calcula a 16,8 m/px sobre un modelo de 33,54, que es exactamente para lo
 * que sirve reconstruir la superficie con una bicúbica.
 *
 * EL `hillshade` DE MAPLIBRE SE QUEDA DEBAJO. No es duplicar trabajo: es la red
 * de seguridad. Sin WebGL2, con un shader que no compile o con las teselas del
 * modelo caídas, esta capa sale transparente y lo que se ve es el relieve de
 * antes. Un fondo peor es un problema; un fondo negro es una aplicación rota.
 */

import type { LayerSpecification, RasterSourceSpecification } from 'maplibre-gl'
import type { DemManifest } from '../dem'
import { coverageBounds } from './coverage'
import { RELIEF_TILE_PX } from './params'
import { RELIEF_TILE_URL } from './protocol'
import { OVERZOOM } from './window'

export const RELIEF_SOURCE = 'relieve'
export const RELIEF_LAYER = 'relieve-sombreado'

export function reliefSource(manifest: DemManifest): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: [RELIEF_TILE_URL],
    tileSize: RELIEF_TILE_PX,
    minzoom: manifest.minZoom,
    maxzoom: manifest.zoom + OVERZOOM,
    bounds: coverageBounds(manifest),
  }
}

export function reliefLayer(): LayerSpecification {
  return {
    id: RELIEF_LAYER,
    type: 'raster',
    source: RELIEF_SOURCE,
    paint: {
      // Sin desvanecido: estas teselas se calculan aquí mismo y llegan en
      // milisegundos, así que la transición de MapLibre solo se vería como un
      // parpadeo al cambiar de nivel.
      'raster-fade-duration': 0,
      'raster-resampling': 'linear',
    },
  }
}
