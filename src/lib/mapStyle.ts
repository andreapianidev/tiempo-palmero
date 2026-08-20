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
import { HILLSHADE_DEFAULT } from './terrain-light'
import { dataUrl } from './endpoints'
import { pixelXToLon, pixelYToLat } from './geo'
import { HILLSHADE_SOURCE, SKY, TERRAIN_SOURCE } from './terrain'
import { demVersion, type DemManifest } from './dem'
import { roleCss } from './contrast/roles'

/**
 * Los colores del mapa.
 *
 * Los de las líneas de referencia YA NO son literales: salen de
 * `contrast/roles.ts`, con exactamente los mismos valores que tenían. El motivo
 * es que además de pintarse hay que poder recalcularlos —sobre la carta
 * topográfica, que es papel blanco, este mismo gris cálido tiene que volverse
 * oscuro para seguir viéndose—, y para eso hacen falta como tono más
 * transparencia, no como cadena.
 */
export const COLORS = {
  sea: '#080b10',
  land: '#191714',
  outline: '#4a443d',
  boundary: roleCss('boundary'),
  trail: roleCss('trail'),
  // Un sendero con aviso se pinta con el mismo color que su fila en el panel.
  // Opacos y más gruesos que `trail`: si el aviso se viera igual de tenue que
  // el trazado normal, no sería un aviso.
  trailNotice: roleCss('trailNotice'),
  trailWarning: roleCss('trailWarning'),
  // Frío, para que la red de guaguas no se confunda con el ámbar de los
  // senderos: en esta isla las dos redes se cruzan constantemente.
  guagua: roleCss('guagua'),
  guaguaBright: roleCss('guaguaBright'),
  // Las carreteras son referencia, no contenido: gris cálido, por debajo de
  // todo lo que sí es un dato. Sin ellas, una parada de guagua flotaba sobre un
  // relieve sin una sola vía y no había forma de situarla.
  road: roleCss('road'),
  // El viario de OSM va por DEBAJO de esas carreteras y más apagado: son 19.770
  // trazados contra 61, y pintados con la misma fuerza convertirían el mapa en
  // un callejero con el tiempo de fondo. Tres tonos del mismo gris cálido —no
  // tres colores— porque lo que separa un nivel de otro es la importancia de la
  // vía, no de qué tipo de cosa se trata.
  osmRoadMain: roleCss('osmMain'),
  osmRoadLocal: roleCss('osmLocal'),
  // La pista de tierra, discontinua: en las medianías la diferencia entre una
  // pista agrícola y un acceso asfaltado decide si se pasa o no se pasa.
  osmTrack: roleCss('osmTrack'),
  osmService: roleCss('osmService'),
  // Los canales de riego, discontinuos y en azul frío: infraestructura de
  // fondo, por debajo de los senderos, y sin confundirse con el ámbar de éstos
  // ni con el azul claro de las guaguas.
  canal: roleCss('canal'),
} as const

/**
 * ESTE FICHERO TIENE QUE PODER LEERSE SIN NAVEGADOR. Lo importan los scripts
 * de `scripts/`, que corren en Node y no tienen DOM. De aquí solo pueden salir
 * tipos e importaciones que no arrastren `maplibre-gl` en tiempo de ejecución:
 * si una lo hace, el núcleo deja de cargar fuera del navegador sin que ninguna
 * prueba de la web se entere.
 *
 * Por eso los fondos de GRAFCAN no se declaran aquí: sus fuentes y sus capas las
 * añade `MapView` al cargar, que es solo de la web. Y por eso la caché de
 * teselas registra su protocolo en `tiles/protocol.ts`, fuera de esta cadena.
 */
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
    // El cielo está siempre declarado y nunca se apaga: con la cámara a cero el
    // horizonte cae en el infinito y su sombreador no pinta un solo píxel. Solo
    // aparece cuando la vista 3D inclina la cámara. Ver `terrain.ts`.
    sky: SKY,
    sources: {
      [HILLSHADE_SOURCE]: {
        type: 'raster-dem',
        // La versión va colgada de la URL a propósito: ver `demVersion` en
        // `dem.ts`. Sin ella, una tesela corregida no le llega jamás a quien ya
        // tenga la anterior en la caché del navegador.
        tiles: [dataUrl(`/dem/{z}/{x}/{y}.png?v=${demVersion(dem)}`)],
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
          'Topónimos y viario: © OpenStreetMap contributors (ODbL)',
      },
      // La gemela, solo para `setTerrain`: mismas teselas, misma versión, caché
      // aparte —por qué eso importa está en `TERRAIN_SOURCE`—. Lo único que no
      // repite es la `attribution`: la de arriba está siempre en el estilo y
      // MapLibre la enseñaría igual, así que copiarla aquí solo sería una cadena
      // más que mantener en dos sitios.
      [TERRAIN_SOURCE]: {
        type: 'raster-dem',
        tiles: [dataUrl(`/dem/{z}/{x}/{y}.png?v=${demVersion(dem)}`)],
        encoding: 'terrarium',
        tileSize: 256,
        minzoom: dem.minZoom,
        maxzoom: dem.zoom,
        bounds: [west, south, east, north],
      },
      island: { type: 'geojson', data: dataUrl('/layers/limite-insular.geojson') },
      municipios: { type: 'geojson', data: dataUrl('/layers/municipios.geojson') },
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
        source: HILLSHADE_SOURCE,
        // Los valores salen de `terrain-light.ts` y no escritos aquí: el
        // interruptor de luz solar los sustituye y tiene que poder devolverlos.
        // Con una copia en cada sitio, cambiar el sombreado por defecto dejaría
        // el «apagado» restituyendo un sombreado que ya no es el de nadie.
        paint: {
          'hillshade-shadow-color': HILLSHADE_DEFAULT.shadow,
          'hillshade-highlight-color': HILLSHADE_DEFAULT.highlight,
          'hillshade-accent-color': HILLSHADE_DEFAULT.accent,
          'hillshade-exaggeration': HILLSHADE_DEFAULT.exaggeration,
          'hillshade-illumination-direction': HILLSHADE_DEFAULT.direction,
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
