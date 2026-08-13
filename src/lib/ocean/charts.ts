/**
 * Cartas náuticas: lo que un marino necesita ver sobre el agua.
 *
 * SON DOS CAPAS Y CADA UNA DICE UNA COSA DISTINTA:
 *
 *  1. LA PROFUNDIDAD, en color, de EMODnet Bathymetry. Es el mismo dato con el
 *     que el sombreador decide dónde rompe la ola y de qué color es el agua
 *     —la misma malla de 1/16 de minuto—, pero aquí dibujado con su escala de
 *     color, que es lo que permite LEER la profundidad en vez de intuirla. El
 *     talud de La Palma cae de 0 a 4.000 m en veinte kilómetros y con esta capa
 *     se ve como lo que es: un cono volcánico de 6,4 km de altura del que la
 *     isla es solo la punta.
 *
 *  2. LAS BALIZAS, de OpenSeaMap: faros con su característica, boyas
 *     cardinales y laterales, puertos y zonas restringidas. Es cartografía
 *     hecha por navegantes.
 *
 * NINGUNA DE LAS DOS LLEVA `bounds`, y eso es a propósito: las de GRAFCAN sí lo
 * llevan porque son cartografía de las islas y pedirles mar abierto sería pedir
 * teselas vacías a un servicio que prohíbe la descarga masiva. Aquí es al revés
 * —el mar abierto ES el contenido—, así que la capa cubre la pantalla entera
 * hasta el borde de lo que el mapa deja arrastrar.
 *
 * Se piden mientras se miran, como los fondos de GRAFCAN. Sin conexión no se
 * dibujan, y el mar simulado sigue estando: ver `OceanLayer`.
 */

import type { RasterSourceSpecification } from 'maplibre-gl'

export const CHART_SOURCES = {
  depth: 'ocean-chart-depth',
  seamarks: 'ocean-chart-seamarks',
} as const

export const CHART_LAYERS = {
  depth: 'ocean-chart-depth-raster',
  seamarks: 'ocean-chart-seamarks-raster',
} as const

/**
 * Batimetría en color de EMODnet, por WMS.
 *
 * `mean_multicolour` y no `mean_atlas_land`: el primero pinta SOLO el mar y
 * deja la tierra transparente, que es justo lo que hace falta aquí —la isla ya
 * está dibujada debajo, con su ortofoto o su relieve—. El segundo trae su
 * propio relleno de tierra y taparía el mapa.
 *
 * WMS 1.1.1 por lo mismo que los fondos de GRAFCAN: en 1.3.0 el orden de los
 * ejes del bbox depende del CRS y la plantilla `{bbox-epsg-3857}` de MapLibre
 * siempre escribe `minx,miny,maxx,maxy`.
 *
 * Comprobado contra el servicio el 13 de agosto de 2026: responde PNG con
 * transparencia, `Access-Control-Allow-Origin: *`, y dibuja a cualquier escala
 * de las que usa la aplicación.
 */
export const DEPTH_SOURCE: RasterSourceSpecification = (() => {
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: 'emodnet:mean_multicolour',
    styles: '',
    srs: 'EPSG:3857',
    format: 'image/png',
    transparent: 'true',
    width: '512',
    height: '512',
  })
  return {
    type: 'raster',
    tiles: [`https://ows.emodnet-bathymetry.eu/wms?${q}&bbox={bbox-epsg-3857}`],
    tileSize: 512,
    minzoom: 0,
    maxzoom: 14,
    attribution:
      'Batimetría: <a href="https://emodnet.ec.europa.eu/en/bathymetry" target="_blank" rel="noreferrer">EMODnet Bathymetry</a> (CC-BY 4.0)',
  }
})()

/**
 * Balizamiento de OpenSeaMap.
 *
 * Teselas de 256 —es lo único que sirve ese servicio— y transparentes: van
 * encima de todo lo demás. Por debajo de z9 no hay balizas dibujadas, así que
 * pedirlas sería pedir teselas en blanco.
 */
export const SEAMARK_SOURCE: RasterSourceSpecification = {
  type: 'raster',
  tiles: ['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'],
  tileSize: 256,
  minzoom: 9,
  maxzoom: 18,
  attribution:
    'Balizas: <a href="https://www.openseamap.org" target="_blank" rel="noreferrer">OpenSeaMap</a> · © OpenStreetMap contributors (ODbL)',
}

/**
 * Opacidad de la capa de profundidad.
 *
 * 0,62 y no 1: por debajo está el mar simulado, moviéndose con el oleaje de
 * hoy, y taparlo del todo para pintar encima una lámina de color plano sería
 * cambiar una cosa que se mueve por otra que no. Con esta opacidad se leen las
 * bandas de profundidad Y se ve el agua viva por debajo.
 */
export const DEPTH_OPACITY = 0.62
