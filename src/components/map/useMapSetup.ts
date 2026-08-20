/**
 * Crear el mapa: el estilo, las fuentes, las capas y los manejadores.
 *
 * ES EL BLOQUE MÁS GRANDE QUE HABÍA EN `MapView.tsx` —510 líneas de un fichero
 * de 2203— y el que hacía imposible leer el resto: entre la primera línea del
 * componente y el segundo efecto había medio millar de líneas de construcción.
 *
 * QUÉ HACE Y EN QUÉ ORDEN, que aquí el orden ES la funcionalidad: MapLibre pinta
 * las capas en el orden en que se añaden, así que la secuencia de este fichero
 * es la profundidad de la escena. Fondo, relieve sombreado, malla interpolada,
 * mar, capas temáticas, vías, guaguas, y encima de todo el cielo. Cambiar dos
 * llamadas de sitio no da un error: da una carretera por encima de una nube.
 *
 * CORRE UNA SOLA VEZ POR DEM. La dependencia es `dem` y nada más, a propósito:
 * el mapa no se recrea cuando cambian los datos —para eso están los efectos que
 * quedan en `MapView`, que le pasan los datos a las capas ya creadas— sino solo
 * si cambia el modelo de elevación, que es lo único de lo que depende el estilo.
 * Recrearlo por cualquier otra cosa recompilaría todos los sombreadores y
 * reiniciaría las partículas del viento y las olas del mar.
 *
 * LOS CALLBACKS SE LEEN DE UNA REF y no de las propiedades. Los manejadores del
 * mapa se registran aquí una vez y viven mientras vive el mapa; si capturaran
 * las propiedades del render en que se crearon, un clic de dentro de una hora
 * llamaría a la función de hace una hora, con el estado de entonces.
 */

import { useEffect, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { buildStyle, COLORS } from '../../lib/mapStyle'
import { EXTERNAL_BASEMAPS, basemapLayerId, basemapSourceId } from '../../lib/basemaps'
import { BASEMAP_LEVELS } from '../../lib/realce/levels'
import { pendingWarmups } from '../../lib/tiles/warm'
import { FLAT_MAX_PITCH } from '../../lib/terrain'
import { MOBILE_QUERY } from '../../hooks/useIsMobile'
import { ISLAND_CENTER } from '../MapView'
import { cachedSource } from '../../lib/tiles/key'
import { registerTileCache } from '../../lib/tiles/protocol'
import { WindLayer } from '../wind/WindLayer'
import { OceanLayer } from '../ocean/OceanLayer'
import {
  CHART_LAYERS,
  CHART_SOURCES,
  DEPTH_OPACITY,
  DEPTH_SOURCE,
  SEAMARK_SOURCE,
} from '../../lib/ocean/charts'
import { VaporLayer } from '../vapor/VaporLayer'
import { CloudLayer } from '../sky/CloudLayer'
import { SunLayer } from '../sky/SunLayer'
import { MilkyWayLayer } from '../milkyway/MilkyWayLayer'
import { StarLayer } from '../stars/StarLayer'
import { MoonLayer } from '../moon/MoonLayer'
import { PlanetLayer } from '../planets/PlanetLayer'
import { SunPathLayer } from '../sky/SunPathLayer'
import { RainLayer } from '../sky/RainLayer'
import { Terrain3D } from '../terrain/Terrain3D'
import { sunHillshadeLayer } from '../terrain/SunHillshade'
import { SHADOW_LAYER_ID, SHADOW_SOURCE_ID, TRANSPARENT_PIXEL } from '../shadow/ShadowLayer'
import { CLOUD_SHADOW_LAYER_ID, CLOUD_SHADOW_SOURCE_ID } from '../shadow/CloudShadowLayer'
import { addGuaguaLayers, GUAGUA_CLICK_LAYERS } from '../guagua/GuaguaLayer'
import { readStop } from '../../lib/guagua/network'
import { addPlacesLayers, PLACES_LAYER, ROADS_HIT_LAYER } from '../places/PlacesLayer'
import { addTdtLayer } from '../tdt/TdtLayer'
import { addOsmRoadsLayers } from '../roads/OsmRoadsLayer'
import { readPlace } from '../../lib/places'
import { addPlaceIcons, addPoiIcons } from '../MapIcons'
import { readRoad } from '../../lib/roads'
import { readPoi } from '../../lib/poi'
import type { Dem } from '../../lib/dem'
import type { Props } from './types'

export interface MapSetupRefs {
  container: MutableRefObject<HTMLDivElement | null>
  map: MutableRefObject<MlMap | null>
  wind: MutableRefObject<WindLayer | null>
  ocean: MutableRefObject<OceanLayer | null>
  vapor: MutableRefObject<VaporLayer | null>
  cloud: MutableRefObject<CloudLayer | null>
  sun: MutableRefObject<SunLayer | null>
  milkyWay: MutableRefObject<MilkyWayLayer | null>
  star: MutableRefObject<StarLayer | null>
  moon: MutableRefObject<MoonLayer | null>
  planet: MutableRefObject<PlanetLayer | null>
  sunPath: MutableRefObject<SunPathLayer | null>
  rain: MutableRefObject<RainLayer | null>
  terrain: MutableRefObject<Terrain3D | null>
  /** Las devoluciones de llamada de ahora mismo. Ver la cabecera. */
  handlers: MutableRefObject<Props>
}

export function useMapSetup(
  dem: Dem | null,
  setReady: Dispatch<SetStateAction<boolean>>,
  refs: MapSetupRefs,
): void {
  const {
    container: containerRef,
    map: mapRef,
    wind: windLayerRef,
    ocean: oceanLayerRef,
    vapor: vaporLayerRef,
    cloud: cloudLayerRef,
    sun: sunLayerRef,
    milkyWay: milkyWayLayerRef,
    star: starLayerRef,
    moon: moonLayerRef,
    planet: planetLayerRef,
    sunPath: sunPathLayerRef,
    rain: rainLayerRef,
    terrain: terrainRef,
    handlers,
  } = refs

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !dem) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dem.manifest),
      center: ISLAND_CENTER,
      zoom: 9.6,
      minZoom: 8.5,
      // Un nivel más que el techo de las fuentes de fondo: es lo que deja
      // alcanzar las teselas z17 de la ortofoto (ver `basemaps.ts` y
      // `scripts/checks/detalle-tiles.ts`). Los demás fondos se magnifican a
      // este nivel, como ya hacían desde el 16 hacia abajo.
      maxZoom: 17,
      // El plano arranca plano. MapLibre trae el arrastre con el botón derecho
      // activado de fábrica y hasta ahora eso permitía inclinar la vista sin
      // querer, sin relieve debajo: un mapa torcido, que no enseña nada que el
      // mapa recto no enseñara mejor. Lo desbloquea `Terrain3D` al encender la
      // vista 3D, y lo vuelve a bloquear al apagarla.
      maxPitch: FLAT_MAX_PITCH,
      maxBounds: [
        [-18.35, 28.15],
        [-17.4, 29.15],
      ],
      attributionControl: false,
    })
    mapRef.current = map
    // Solo en desarrollo, y no es una comodidad: es lo que hace MEDIBLE el
    // umbral de `lib/occlusion.ts`. `scripts/checks/occlusion-margin.mjs`
    // necesita preguntarle a MapLibre, desde fuera, qué considera él tapado
    // para poder comparar con lo que dice el DEM. En el paquete de producción
    // esta línea no existe.
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__map = map
      // Y la fila de la precarga, por lo mismo: sin ella,
      // `scripts/checks/precarga-intencion.ts` no puede saber si la precarga ha
      // terminado o solo está entre dos teselas. Su primera versión lo deducía
      // de «no salen peticiones nuevas», y eso confunde una fila vacía con dos
      // obreros esperando a IndexedDB: contaba 2 teselas donde había 12 y
      // acusaba al código de un fallo que no existía.
      ;(window as unknown as Record<string, unknown>).__precarga = pendingWarmups
    }

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    // La atribución compacta nace DESPLEGADA, y desplegada son dos líneas de
    // ancho completo: en un teléfono, media isla tapada por una licencia que en
    // ese momento no está leyendo nadie. Se arranca plegada, con su ⓘ, que es
    // lo que hace cualquier mapa en pantalla estrecha —y lo que MapLibre hace
    // él solo en cuanto arrastras el mapa.
    //
    // Lo que la despliega es la clase, no el atributo `open` del `<details>`:
    // quitar `open` no cerraba nada. Quitar la clase es exactamente lo que hace
    // su propio botón. En pantalla ancha la clase no existe y esto no hace nada.
    //
    // Y va en el primer `idle`, no aquí mismo: cuando se añade el control
    // todavía no hay ninguna fuente cargada, así que la atribución está vacía y
    // ni siquiera se ha puesto compacta. Se despliega DESPUÉS, al llegar la
    // primera atribución, y una llamada anterior a ese momento no toca nada.
    //
    // Y solo en la pantalla estrecha: en el escritorio la atribución cabe
    // entera en su esquina y ahí se queda como estaba, desplegada.
    map.once('idle', () => {
      if (!window.matchMedia(MOBILE_QUERY).matches) return
      map
        .getContainer()
        .querySelector('.maplibregl-ctrl-attrib')
        ?.classList.remove('maplibregl-compact-show')
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }),
      'bottom-left',
    )

    map.on('load', async () => {
      // Los fondos externos van los primeros: quedan justo encima del relieve
      // de casa y por debajo de todo lo demás, que es lo que son —fondo—. Se
      // declaran los tres a la vez y apagados; MapLibre no pide una sola
      // tesela de una fuente sin capa visible, así que declararlos no cuesta
      // nada mientras nadie los encienda.
      //
      // El relieve de casa NO se apaga al encender uno: mientras las teselas
      // del servicio llegan, lo que se ve por los huecos es la isla, no un
      // rectángulo negro.
      //
      // Se insertan delante de `municipal-boundaries`. Orden final: relleno
      // insular, hillshade, GRAFCAN, líneas.
      // La caché de teselas se registra ANTES de declarar las fuentes: es un
      // protocolo global de MapLibre y tiene que estar puesto antes de la
      // primera petición. `cachedSource` es lo que antepone `palmero://` a la
      // plantilla; `basemaps.ts` no lo sabe, porque ese fichero es del núcleo y
      // el núcleo tiene que poder leerse sin MapLibre — ver `mapStyle.ts`.
      registerTileCache()
      for (const b of EXTERNAL_BASEMAPS) {
        const realce = BASEMAP_LEVELS[b.id]
        map.addSource(basemapSourceId(b.id), cachedSource(b.source))
        map.addLayer(
          {
            id: basemapLayerId(b.id),
            type: 'raster',
            source: basemapSourceId(b.id),
            layout: { visibility: 'none' },
            paint: {
              'raster-fade-duration': 0,
              // El realce del fondo son estos cuatro números y nada más: no hay
              // shader propio ni teselas reprocesadas. Están medidos en
              // `realce/levels.ts`, junto con el ensayo que descartó el enfoque.
              'raster-contrast': realce.contrast,
              'raster-brightness-min': realce.brightnessMin,
              'raster-brightness-max': realce.brightnessMax,
              'raster-saturation': realce.saturation,
              // Interpolar en vez de repetir el píxel más cercano: entre dos
              // niveles de zoom la tesela se dibuja escalada siempre.
              'raster-resampling': 'linear',
            },
          },
          'municipal-boundaries',
        )
      }

      // Y LA LUZ DEL SOL SOBRE EL FONDO FOTOGRÁFICO, por el mismo motivo por el
      // que la sombra va aquí abajo: la ortofoto es opaca y tapa el `hillshade`
      // del estilo entero. Es esa misma capa repetida encima y translúcida, sin
      // fuente nueva ni petición nueva. Ver `terrain/SunHillshade.ts`.
      map.addLayer(sunHillshadeLayer(), 'municipal-boundaries')

      // LA SOMBRA PROPIA DEL RELIEVE, justo encima de los fondos y de la luz que
      // acaba de ponerse, y debajo de todo lo demás. Primero lo que la ladera
      // recibe por su orientación, después lo que le quita lo que tiene delante.
      // Ver la cabecera de `shadow/ShadowLayer.ts`.
      //
      // Se crea con un píxel transparente y apagada, como la malla: la imagen
      // se sustituye en cada barrido y recrear la fuente hace parpadear el mapa.
      map.addSource(SHADOW_SOURCE_ID, {
        type: 'image',
        url: TRANSPARENT_PIXEL,
        coordinates: [
          [-18.05, 28.9],
          [-17.7, 28.9],
          [-17.7, 28.4],
          [-18.05, 28.4],
        ],
      })
      map.addLayer(
        {
          id: SHADOW_LAYER_ID,
          type: 'raster',
          source: SHADOW_SOURCE_ID,
          layout: { visibility: 'none' },
          paint: {
            'raster-opacity': 1,
            'raster-resampling': 'linear',
            'raster-fade-duration': 0,
          },
        },
        'municipal-boundaries',
      )

      // Y encima, las manchas de las nubes. Van después de las del relieve
      // porque una nube tapa el sol pase lo que pase debajo, y porque así las
      // dos se componen en el mismo orden en que ocurren: primero lo que quita
      // la montaña, después lo que quita la nube.
      map.addSource(CLOUD_SHADOW_SOURCE_ID, {
        type: 'image',
        url: TRANSPARENT_PIXEL,
        coordinates: [
          [-18.05, 28.9],
          [-17.7, 28.9],
          [-17.7, 28.4],
          [-18.05, 28.4],
        ],
      })
      map.addLayer(
        {
          id: CLOUD_SHADOW_LAYER_ID,
          type: 'raster',
          source: CLOUD_SHADOW_SOURCE_ID,
          layout: { visibility: 'none' },
          paint: {
            'raster-opacity': 1,
            'raster-resampling': 'linear',
            'raster-fade-duration': 0,
          },
        },
        'municipal-boundaries',
      )

      // EL MAR VA AQUÍ: encima de los tres fondos y del sombreado, debajo de
      // todo lo que es un dato. Es lo que hace que el océano se vea igual con el
      // relieve de casa, con la carta topográfica y con la ortofoto —en las tres
      // el agua es lo mismo, y en las tres tiene que fundirse con la misma
      // costa—, y que no tape ni la malla de temperatura ni los marcadores.
      //
      // Y va ANTES de crear la malla en el código, no después: el orden de
      // inserción con el mismo `beforeId` es el orden de dibujo.
      const oceanLayer = new OceanLayer()
      oceanLayerRef.current = oceanLayer
      map.addLayer(oceanLayer, 'municipal-boundaries')

      // Las cartas náuticas, encima del agua: son información que se lee, y
      // debajo del oleaje no se leería. Declaradas y apagadas; MapLibre no pide
      // una sola tesela de una fuente sin capa visible.
      map.addSource(CHART_SOURCES.depth, DEPTH_SOURCE)
      map.addLayer(
        {
          id: CHART_LAYERS.depth,
          type: 'raster',
          source: CHART_SOURCES.depth,
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': DEPTH_OPACITY, 'raster-fade-duration': 0 },
        },
        'municipal-boundaries',
      )
      map.addSource(CHART_SOURCES.seamarks, SEAMARK_SOURCE)
      map.addLayer(
        {
          id: CHART_LAYERS.seamarks,
          type: 'raster',
          source: CHART_SOURCES.seamarks,
          layout: { visibility: 'none' },
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
        },
        'municipal-boundaries',
      )

      // Fuente de la malla interpolada. Se crea con un píxel transparente y se
      // reemplaza la imagen en cada recálculo: recrear la fuente entera hace
      // parpadear el mapa.
      map.addSource('grid', {
        type: 'image',
        url:
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        coordinates: [
          [-18.05, 28.9],
          [-17.7, 28.9],
          [-17.7, 28.4],
          [-18.05, 28.4],
        ],
      })
      map.addLayer(
        {
          id: 'grid-raster',
          type: 'raster',
          source: 'grid',
          paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
        },
        'municipal-boundaries',
      )

      // La cobertura de TDT, justo encima de la malla y por debajo de todo lo
      // demás: es otro fondo temático, y compite con la malla por el mismo
      // sitio. Por debajo del viento a propósito —las partículas tienen que
      // leerse sobre ella— y muy por debajo de senderos, guaguas y viario.
      addTdtLayer(map, 'municipal-boundaries')

      // El viento va POR ENCIMA de la malla interpolada y por debajo de los
      // contornos: se lee sobre el color de fondo sin tapar los límites ni las
      // etiquetas, que son las que sitúan lo que se está mirando.
      const windLayer = new WindLayer()
      windLayerRef.current = windLayer
      map.addLayer(windLayer, 'municipal-boundaries')

      // El vapor va POR ENCIMA de todo lo que se dibuja sobre el terreno, y no
      // es una preferencia estética: es una capa con profundidad, y lo que la
      // hace legible es que el relieve la tape cuando queda detrás. Puesta
      // debajo de los contornos, MapLibre la drapearía junto con ellos y
      // perdería justamente la altura que la distingue de una mancha.
      const vaporLayer = new VaporLayer()
      vaporLayerRef.current = vaporLayer
      map.addLayer(vaporLayer)

      // Las nubes van ENCIMA del vapor, que es el orden en que están en el
      // aire: el vapor sube desde el suelo y deja de dibujarse justo en el
      // nivel de condensación, que es donde empieza la nube. Las dos capas
      // comparten esa cota —`decks.ts` usa el mismo nivel que `vapor/field.ts`—
      // así que la columna de bruma entrega el relevo a la nube sin solaparse.
      //
      // Y la lluvia después de las nubes: cuelga por debajo de la base de la
      // suya, así que casi nunca compiten por el mismo píxel, y donde compiten
      // —una cortina vista de frente con su nube detrás— lo correcto es que el
      // agua se vea delante.
      // EL SOL VA ANTES QUE LAS NUBES, y no es un detalle de orden: se dibuja a
      // profundidad 1 —el fondo de la escena— así que lo tapa todo lo que tenga
      // profundidad escrita, y con la mezcla aditiva lo que se dibuje después
      // se suma encima. Puesto al final, se comería el ribete de las nubes.
      // Y EL CAMINO ANTES QUE EL SOL, que es el único orden que no miente: el
      // disco es el sol de ahora y está EN el camino, así que cuando los dos
      // caen en el mismo píxel el que tiene que verse es el disco.
      const sunPathLayer = new SunPathLayer()
      sunPathLayerRef.current = sunPathLayer
      map.addLayer(sunPathLayer)

      const sunLayer = new SunLayer()
      sunLayerRef.current = sunLayer
      map.addLayer(sunLayer)

      // LA VÍA LÁCTEA ANTES QUE LAS ESTRELLAS, y este orden sí importa. Es
      // fondo: las estrellas se dibujan con mezcla aditiva, así que puestas
      // encima SE SUMAN a ella, que es lo que pasa de verdad —la banda es luz
      // de estrellas que no se resuelven, y las que sí se resuelven están
      // dentro—. Al revés, un velo del 55 % de blanco taparía las más débiles
      // justo en la región del cielo donde más hay.
      const milkyWayLayer = new MilkyWayLayer()
      milkyWayLayerRef.current = milkyWayLayer
      map.addLayer(milkyWayLayer)

      // Las estrellas van DESPUÉS del sol en el orden de capas y da igual: las
      // dos escriben a profundidad 1 y no coinciden nunca en pantalla —una se
      // dibuja con el sol arriba y la otra con el cielo por debajo de la
      // magnitud de Sirio—.
      const starLayer = new StarLayer()
      starLayerRef.current = starLayer
      map.addLayer(starLayer)

      // La luna DESPUÉS de las estrellas, y esto sí importa: las dos escriben a
      // profundidad 1, así que quien se dibuja después gana, y la luna tapa las
      // estrellas que tiene detrás. Es lo que hace de verdad — una ocultación
      // lunar —, y al revés se vería Aldebarán a través del disco.
      const moonLayer = new MoonLayer()
      moonLayerRef.current = moonLayer
      map.addLayer(moonLayer)

      // Los planetas DESPUÉS de la luna y por el mismo motivo que la luna va
      // después de las estrellas: los tres escriben a profundidad 1, gana quien
      // se dibuja el último, y un planeta detrás del disco lunar es una
      // ocultación, que es lo que de verdad pasa cuando coinciden.
      const planetLayer = new PlanetLayer()
      planetLayerRef.current = planetLayer
      map.addLayer(planetLayer)

      const cloudLayer = new CloudLayer()
      cloudLayerRef.current = cloudLayer
      map.addLayer(cloudLayer)

      const rainLayer = new RainLayer()
      rainLayerRef.current = rainLayer
      map.addLayer(rainLayer)

      // El relieve no añade ninguna capa: reutiliza la fuente `terrain` del
      // estilo, que ya está cargada porque la usa el sombreado.
      terrainRef.current = new Terrain3D(map)

      // El viario de OSM es lo primero de todo lo que se dibuja encima del
      // fondo: son 19.770 trazados que sitúan, no que informan, y tienen que
      // quedar por DEBAJO de las 61 carreteras del Cabildo —que sí se pinchan y
      // sí tienen ficha— y por debajo de senderos, guaguas y sitios.
      addOsmRoadsLayers(map)

      // Las carreteras y los sitios se crean antes que senderos y guaguas: las
      // vías son el fondo sobre el que se leen las demás capas, y los iconos de
      // sitios comparten rejilla con los de los senderos.
      await addPlaceIcons(map)
      if (!mapRef.current) return // desmontado mientras se decodificaban
      addPlacesLayers(map, {
        onPlace: (props, lon, lat) => handlers.current.onPlace(readPlace(props, lon, lat)),
      })

      // Los canales van DEBAJO de los senderos: son infraestructura de fondo,
      // como las carreteras, y un trazado de riego tapando un GR sería decir
      // que importa más de lo que importa.
      map.addSource('canals', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'canals-line',
        type: 'line',
        source: 'canals',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: {
          'line-color': COLORS.canal,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 2],
          'line-dasharray': [3, 2],
        },
      })

      map.addSource('trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'trails-line',
        type: 'line',
        source: 'trails',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // El color lo pone la propiedad `sev`, que inyecta este componente a
          // partir de los avisos. Sin aviso —o con la sección plegada— cae en
          // el color de siempre.
          'line-color': [
            'match',
            ['coalesce', ['get', 'sev'], ''],
            'warning', COLORS.trailWarning,
            'notice', COLORS.trailNotice,
            COLORS.trail,
          ],
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            10, ['case', ['has', 'sev'], 1.4, 0.7],
            15, ['case', ['has', 'sev'], 3.2, 2.2],
          ],
        },
      })

      // La red de guaguas va debajo de los puntos de interés: cuando un
      // sendero y una línea se cruzan, lo que hay que poder pinchar encima es
      // el punto, que es un sitio; el trazado se pincha en cualquier otro tramo.
      addGuaguaLayers(map, {
        onStop: (props, lon, lat) => handlers.current.onBusStop(readStop(props, lon, lat)),
        onRoute: (routeId) => handlers.current.onBusRoute(routeId),
      })

      map.addSource('trail-pois', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 14,
      })
      map.addLayer({
        id: 'trail-pois-cluster',
        type: 'circle',
        source: 'trail-pois',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(226,197,106,0.28)',
          'circle-stroke-color': 'rgba(226,197,106,0.65)',
          'circle-stroke-width': 1,
          'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 9, 200, 22],
        },
      })

      // Los iconos, antes de la capa que los usa: una capa `symbol` cuyas
      // imágenes todavía no existen se pinta vacía y avisa por consola de cada
      // una que le falta.
      await addPoiIcons(map)
      if (!mapRef.current) return // desmontado mientras se decodificaban

      map.addLayer({
        id: 'trail-pois-point',
        type: 'symbol',
        source: 'trail-pois',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'icon'],
          // Sin `text-field` no hace falta servidor de glifos, y el estilo
          // sigue sin ninguna dependencia externa en tiempo de ejecución.
          'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.62, 14, 0.85, 16, 1],
          // El propio motor resuelve los solapamientos: a zoom bajo enseña los
          // que caben y esconde el resto, en vez de amontonar 1.190 discos.
          'icon-allow-overlap': false,
          'icon-padding': 1,
        },
      })

      map.on('click', (e) => {
        // Un clic sobre un pin ya lo gestiona el propio marcador; los puntos de
        // interés y sus grupos tienen su propio manejador, más abajo.
        const layers = [
          'trail-pois-cluster',
          'trail-pois-point',
          PLACES_LAYER,
          ...GUAGUA_CLICK_LAYERS,
        ].filter((l) => map.getLayer(l))
        if (layers.length && map.queryRenderedFeatures(e.point, { layers }).length) return

        // Las carreteras se consultan LAS ÚLTIMAS: son el fondo sobre el que se
        // leen las demás capas, y una parada de guagua encima de una carretera
        // tiene que abrir la parada. Con la capa apagada no devuelve nada, así
        // que no hace falta preguntar por la visibilidad.
        if (map.getLayer(ROADS_HIT_LAYER)) {
          const road = map.queryRenderedFeatures(e.point, { layers: [ROADS_HIT_LAYER] })[0]
          if (road) {
            handlers.current.onRoad(
              readRoad({ ...(road.properties ?? {}) }),
              e.lngLat.lng,
              e.lngLat.lat,
            )
            return
          }
        }

        handlers.current.onPick(e.lngLat.lng, e.lngLat.lat)
      })

      // Un grupo se abre acercando el mapa hasta donde deja de ser grupo. Antes
      // no hacía nada: se tragaba el clic y no daba nada a cambio.
      map.on('click', 'trail-pois-cluster', (e) => {
        const f = e.features?.[0]
        const id = f?.properties?.cluster_id
        if (id === undefined) return
        const src = map.getSource('trail-pois') as maplibregl.GeoJSONSource | undefined
        void src?.getClusterExpansionZoom(Number(id)).then((zoom) => {
          map.easeTo({ center: e.lngLat, zoom: Math.max(zoom, map.getZoom() + 1), duration: 500 })
        })
      })

      map.on('click', 'trail-pois-point', (e) => {
        const f = e.features?.[0]
        if (!f || f.geometry.type !== 'Point') return
        const [lon, lat] = f.geometry.coordinates as [number, number]
        handlers.current.onPoi(readPoi({ ...(f.properties ?? {}) }, lon, lat))
      })

      for (const layer of ['trail-pois-cluster', 'trail-pois-point']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = 'crosshair'
        })
      }

      map.getCanvas().style.cursor = 'crosshair'
      // Al final, no al principio: los efectos que pintan malla, marcadores y
      // capas GeoJSON se disparan con esto, y necesitan las fuentes ya creadas.
      setReady(true)
    })

    return () => {
      terrainRef.current?.destroy()
      terrainRef.current = null
      cloudLayerRef.current = null
      sunLayerRef.current = null
      starLayerRef.current = null
      sunPathLayerRef.current = null
      rainLayerRef.current = null
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [dem])
}
