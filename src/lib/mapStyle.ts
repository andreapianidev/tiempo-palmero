/**
 * Estilo del mapa base, generado aquí mismo.
 *
 * No hay proveedor de teselas de terceros ni ninguna clave de API en tiempo de
 * ejecución: el fondo se dibuja con el relieve sombreado que sale de las
 * teselas DEM que ya están en `public/dem/`, más los contornos que publica el
 * propio Cabildo. La isla es un volcán — el sombreado es lo que la hace
 * legible, y ya lo tenemos en casa.
 *
 * El estilo NO declara `glyphs` y no usa ninguna capa `symbol`. Es a propósito:
 * las etiquetas de texto de MapLibre exigen un servidor de glifos, que sería
 * otra dependencia externa en runtime. Los topónimos se pintan como marcadores
 * del DOM a partir de `public/gazetteer.json`, filtrados por zoom.
 */

import type { StyleSpecification } from 'maplibre-gl'
import { pixelXToLon, pixelYToLat } from './geo'
import type { DemManifest } from './dem'

export const COLORS = {
  sea: '#080b10',
  land: '#191714',
  outline: '#4a443d',
  boundary: 'rgba(255,255,255,0.11)',
  trail: 'rgba(226,197,106,0.5)',
  // Frío, para que la red de guaguas no se confunda con el ámbar de los
  // senderos: en esta isla las dos redes se cruzan constantemente.
  guagua: 'rgba(127,178,217,0.45)',
  guaguaBright: '#a8d2ef',
  // Las carreteras son referencia, no contenido: gris cálido, por debajo de
  // todo lo que sí es un dato. Sin ellas, una parada de guagua flotaba sobre un
  // relieve sin una sola vía y no había forma de situarla.
  road: 'rgba(214,201,183,0.42)',
} as const

export function buildStyle(dem: DemManifest): StyleSpecification {
  // Límites exactos de la cobertura descargada. Sin esto MapLibre pide las
  // teselas que cubren la ventana, incluidas las de mar abierto que no
  // existen: en producción son 404 y en desarrollo el servidor devuelve el
  // index.html, que el decodificador de imágenes rechaza con un error.
  const west = pixelXToLon(dem.x0 * dem.tileSize, dem.zoom)
  const east = pixelXToLon((dem.x0 + dem.cols) * dem.tileSize, dem.zoom)
  const north = pixelYToLat(dem.y0 * dem.tileSize, dem.zoom)
  const south = pixelYToLat((dem.y0 + dem.rows) * dem.tileSize, dem.zoom)

  return {
    version: 8,
    name: 'Tiempo Palmero',
    sources: {
      terrain: {
        type: 'raster-dem',
        tiles: [`${window.location.origin}/dem/{z}/{x}/{y}.png`],
        encoding: 'terrarium',
        tileSize: 256,
        // Hay teselas de z9 a z12. Declarar solo z12 dejaba el relieve invisible
        // por debajo de ese nivel, que es justo la vista inicial de toda la isla.
        minzoom: dem.minZoom,
        maxzoom: dem.zoom,
        bounds: [west, south, east, north],
        attribution:
          'Relieve: Mapzen Terrain Tiles (AWS Open Data) · ' +
          'Datos: <a href="https://www.opendatalapalma.es" target="_blank" rel="noreferrer">Cabildo Insular de La Palma</a> (CC-BY) · ' +
          'Topónimos: © OpenStreetMap contributors (ODbL)',
      },
      island: { type: 'geojson', data: '/layers/limite-insular.geojson' },
      municipios: { type: 'geojson', data: '/layers/municipios.geojson' },
    },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': COLORS.sea } },
      {
        id: 'island-fill',
        type: 'fill',
        source: 'island',
        paint: { 'fill-color': COLORS.land },
      },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'terrain',
        paint: {
          'hillshade-shadow-color': '#000000',
          'hillshade-highlight-color': '#8a8274',
          'hillshade-accent-color': '#2a2622',
          'hillshade-exaggeration': 0.5,
          'hillshade-illumination-direction': 315,
        },
      },
      {
        id: 'municipal-boundaries',
        type: 'line',
        source: 'municipios',
        paint: {
          'line-color': COLORS.boundary,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.4, 14, 1.1],
        },
      },
      {
        id: 'island-outline',
        type: 'line',
        source: 'island',
        paint: {
          'line-color': COLORS.outline,
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 1.8],
        },
      },
    ],
  }
}
