/**
 * Mapa. MapLibre GL, estilo propio, sin proveedor externo ni clave de API.
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import maplibregl, { type LngLatLike, type Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildStyle, COLORS } from '../lib/mapStyle'
import {
  BASEMAPS,
  EXTERNAL_BASEMAPS,
  basemapLayerId,
  basemapSourceId,
  type BasemapId,
} from '../lib/basemaps'
import { isBundleVariable, pinLabel, type MapVariable } from '../lib/variables'
import { place, pillRank, RANK, type Box, type DeclutterItem } from '../lib/declutter'
import { renderGrid, rasterToCanvas } from '../lib/grid-canvas'
import { rasterizeMasked, type MaskedField } from '../lib/masked-field'
import { cssColor, co2Band, FRESHNESS_COLOR, type RgbStop } from '../lib/palette'
import { freshness, stationReading, type Station } from '../lib/quality'
import { decoratePoiCollection, readPoi, type PoiRecord } from '../lib/poi'
import { WindLayer } from './wind/WindLayer'
import {
  addGuaguaLayers,
  setGuaguaData,
  setGuaguaRoute,
  setGuaguaVisible,
  GUAGUA_CLICK_LAYERS,
} from './guagua/GuaguaLayer'
import { routeBounds, STOPS_MIN_ZOOM } from '../lib/guagua/display'
import { readStop, type GuaguaStopPoint } from '../lib/guagua/network'
import {
  addPlacesLayers,
  setPlacesData,
  setPlacesVisible,
  setRoadsData,
  setRoadsVisible,
  PLACES_LAYER,
  ROADS_HIT_LAYER,
} from './places/PlacesLayer'
import {
  addOsmRoadsLayers,
  setOsmRoadsData,
  setOsmRoadsVisible,
  OSM_ROADS_MIN_ZOOM,
} from './roads/OsmRoadsLayer'
import { readPlace, type PlaceRecord } from '../lib/places'
import { addPlaceIcons, addPoiIcons } from './MapIcons'
import { readRoad, type RoadRecord } from '../lib/roads'
import { counterMarkerElement } from './counters/CounterMarker'
import type { CounterSite } from '../lib/counters/model'
import type { WindField } from '../lib/wind/field'
import { estimateBundle, type Model, type InterpolableVariable } from '../lib/interpolate'
import type { Dem } from '../lib/dem'
import type { AirStation, Co2Point, FireCamera, SkyStation } from '../hooks/useIslandData'
import type { Diagnosis } from '../lib/sensor-health'
import { fallbackReading } from '../lib/station-fallback'
import type { GazetteerEntry } from '../lib/api'
import { n0, t } from '../i18n'
import { MOBILE_QUERY } from '../hooks/useIsMobile'

export const ISLAND_CENTER: LngLatLike = [-17.86, 28.66]

/**
 * Lo poco que se puede mandarle al mapa desde fuera.
 *
 * A propósito son dos verbos y no el objeto entero de MapLibre: quien tiene
 * esto puede mover la vista, no cambiar capas por su cuenta. Todo lo que se
 * pinta sigue decidiéndose con propiedades.
 */
export interface MapHandle {
  flyTo: (lon: number, lat: number, zoom?: number) => void
  /** Volver a ver la isla entera, que es la vista de llegada. */
  reset: () => void
}

export interface LayerVisibility {
  grid: boolean
  stations: boolean
  air: boolean
  co2: boolean
  sky: boolean
  trails: boolean
  /** Trazados y paradas: una sola casilla para toda la red. */
  guagua: boolean
  roads: boolean
  /** El viario completo de OSM, por debajo de las carreteras del Cabildo. */
  osmRoads: boolean
  counters: boolean
  fire: boolean
  wind: boolean
}

interface Props {
  dem: Dem | null
  models: Record<InterpolableVariable, Model | null>
  variable: MapVariable
  /** La rampa de la variable higrotérmica en juego. El CO₂ va por bandas. */
  stops: RgbStop[]
  /**
   * El campo enmascarado de la variable elegida, si es de las que solo existen
   * donde alguien midió (CO₂, cobertura). Llega hecho desde fuera porque el
   * panel lateral cuenta las mismas cifras que el mapa pinta, y con dos
   * construcciones separadas podrían acabar contando cosas distintas.
   */
  maskedField: MaskedField | null
  stations: Station[]
  /**
   * La estación de la cumbre (TNG, 2387 m), si está fresca.
   *
   * Llega APARTE de `stations` y no dentro, a propósito: `stations` es la red
   * del Cabildo y hay medio panel contando cuántas son y qué publican. Colarla
   * en esa lista cambiaría esas cifras sin que nadie lo hubiera pedido. Aquí
   * solo se dibuja, que es lo que hacía falta: el pin más alto de la isla
   * estaba faltando en la capa de estaciones meteorológicas.
   */
  summit: Station | null
  /** Diagnóstico temporal por `entityId`. Vacío mientras no se haya revisado. */
  health: Map<string, Diagnosis>
  air: AirStation[]
  sky: SkyStation[]
  fire: FireCamera[]
  co2: Co2Point[]
  gazetteer: GazetteerEntry[]
  trails: unknown | null
  /**
   * Severidad del aviso de cada sendero, por `id_sendero`. Colorea el trazado
   * en el mapa con lo mismo que dice la lista del panel, para que las dos
   * cosas no puedan contradecirse. Vacío mientras la sección esté plegada: el
   * trazado sale entonces con su color de siempre.
   */
  trailSeverity: Record<number, 'warning' | 'notice'>
  trailPois: unknown | null
  /** Trazados y paradas de guagua; llegan solo si se enciende la capa. */
  guaguaLines: GeoJSON.FeatureCollection | null
  guaguaStops: GeoJSON.FeatureCollection | null
  /** Línea resaltada mientras su ficha está abierta. */
  guaguaRoute: string | null
  /** Sitios encendidos, ya fusionados en una colección de puntos. */
  places: GeoJSON.FeatureCollection | null
  roads: GeoJSON.FeatureCollection | null
  /** Los 19.770 trazados de OSM; llegan solo si se enciende la capa. */
  osmRoads: GeoJSON.FeatureCollection | null
  /** Trazados de los canales de riego LP-I, LP-II y LP-III. */
  canals: GeoJSON.FeatureCollection | null
  /** La capa de agua está encendida: es un sitio, no una capa del mapa. */
  canalsVisible: boolean
  /** Aforos con datos en la ventana; llegan solo si se enciende la capa. */
  counters: CounterSite[]
  wind: WindField | null
  /** Fondo elegido. Los tres están declarados; solo uno tiene capa visible. */
  basemap: BasemapId
  visible: LayerVisibility
  probe: { lon: number; lat: number } | null
  /**
   * Dónde dice el navegador que está quien mira. Solo lo pide el móvil; en el
   * escritorio llega `null` y no se dibuja nada.
   */
  me?: { lon: number; lat: number } | null
  /**
   * Mando a distancia del mapa: volar a un punto y volver a ver la isla.
   *
   * Existe porque en el móvil hay botones que mueven la vista sin tocar el
   * mapa, y en una pantalla estrecha «tu ubicación» sin acercarse a ella no
   * dice nada. En el escritorio no se pasa y no cambia nada.
   */
  handleRef?: MutableRefObject<MapHandle | null>
  onPick: (lon: number, lat: number) => void
  onStation: (station: Station) => void
  onAir: (station: AirStation) => void
  onCo2: (sensor: Co2Point) => void
  onFire: (camera: FireCamera) => void
  onSky: (station: SkyStation) => void
  onPoi: (poi: PoiRecord) => void
  onBusStop: (stop: GuaguaStopPoint) => void
  onBusRoute: (routeId: string) => void
  onPlace: (place: PlaceRecord) => void
  onRoad: (road: RoadRecord, lon: number, lat: number) => void
  onCounter: (site: CounterSite) => void
  /**
   * Avisa de si el zoom da ya para ver las paradas. Se llama solo al cruzar el
   * umbral, no en cada fotograma de un gesto: es un booleano, no el zoom.
   */
  onStopsZoom: (reached: boolean) => void
  /** Lo mismo para las pistas del viario: por debajo de z13 no se dibujan. */
  onTracksZoom: (reached: boolean) => void
}

/** Qué topónimos merecen etiqueta a cada zoom. Sin esto la isla es ilegible. */
const PLACE_MIN_ZOOM: Record<string, number> = {
  city: 8,
  town: 9.5,
  village: 11,
  suburb: 12,
  quarter: 12.5,
  neighbourhood: 12.5,
  hamlet: 13,
  locality: 13.5,
  isolated_dwelling: 14.5,
  farm: 14.5,
  plot: 15,
  square: 14.5,
}

/**
 * El rectángulo que un marcador ocupa en pantalla.
 *
 * Se mide SIEMPRE expandido: si se midiera un pin ya encogido, su ancho sería
 * el del punto y no volvería a abrirse nunca al separarse de sus vecinos. Por
 * eso deshace el encogido antes de preguntar por el tamaño.
 */
function box(map: MlMap, el: HTMLElement, lon: number, lat: number): Box {
  el.classList.remove('mk-pill-dot')
  el.style.visibility = 'visible'
  const pt = map.project([lon, lat])
  return { x: pt.x, y: pt.y, w: el.offsetWidth || 44, h: el.offsetHeight || 18 }
}

export function MapView(props: Props) {
  const { dem, models, variable, stops, stations, visible, probe } = props
  const model = models.temperature
  /**
   * Los pines son de las estaciones del Cabildo, que no miden CO₂. Con esa
   * variable elegida siguen enseñando la temperatura en vez de vaciarse: son
   * la otra mitad de lo que está en pantalla, y quedarían en blanco por una
   * decisión que no va con ellos.
   */
  const pinVariable = isBundleVariable(variable) ? variable : 'temperature'
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  // Estado, no ref: cuando el mapa termina de cargar hay que volver a ejecutar
  // los efectos que pintan malla y marcadores. Una ref no provoca re-render, y
  // con ella los datos que llegaban antes del evento `load` no se dibujaban
  // nunca — el mapa se quedaba con el contorno de la isla y nada más.
  const [ready, setReady] = useState(false)
  const markersRef = useRef<maplibregl.Marker[]>([])
  /** La capa de viento es un objeto WebGL con estado propio: vive en una ref y
   *  se le pasan los datos, en vez de recrearla en cada render. */
  const windLayerRef = useRef<WindLayer | null>(null)
  /** Pins de estación en juego, para resolver solapamientos en cada movimiento. */
  const pillsRef = useRef<{ el: HTMLElement; lon: number; lat: number; priority: number }[]>([])
  /**
   * Las cámaras de incendio, que también compiten por el sitio.
   *
   * No son pastillas y no se colapsan a un punto —un triángulo colapsado no
   * dice nada—, pero tienen que entrar en el reparto igual que los aforos: se
   * dibujaban por encima de todo sin avisar a nadie, y un triángulo caído justo
   * sobre una pastilla se leía como parte de la cifra. Ver `declutterImpl`.
   */
  const firesRef = useRef<{ el: HTMLElement; lon: number; lat: number; alert: boolean }[]>([])
  const placeMarkersRef = useRef<maplibregl.Marker[]>([])
  const probeMarkerRef = useRef<maplibregl.Marker | null>(null)
  const meMarkerRef = useRef<maplibregl.Marker | null>(null)
  // Los callbacks cambian en cada render; se leen desde una ref para que los
  // manejadores del mapa no haya que recrearlos (y volver a añadir listeners).
  const handlers = useRef(props)
  handlers.current = props

  // --- inicialización ------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !dem) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dem.manifest),
      center: ISLAND_CENTER,
      zoom: 9.6,
      minZoom: 8.5,
      maxZoom: 16,
      maxBounds: [
        [-18.35, 28.15],
        [-17.4, 29.15],
      ],
      attributionControl: false,
    })
    mapRef.current = map

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
      for (const b of EXTERNAL_BASEMAPS) {
        map.addSource(basemapSourceId(b.id), b.source)
        map.addLayer(
          {
            id: basemapLayerId(b.id),
            type: 'raster',
            source: basemapSourceId(b.id),
            layout: { visibility: 'none' },
            paint: { 'raster-fade-duration': 0 },
          },
          'municipal-boundaries',
        )
      }

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

      // El viento va POR ENCIMA de la malla interpolada y por debajo de los
      // contornos: se lee sobre el color de fondo sin tapar los límites ni las
      // etiquetas, que son las que sitúan lo que se está mirando.
      const windLayer = new WindLayer()
      windLayerRef.current = windLayer
      map.addLayer(windLayer, 'municipal-boundaries')

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
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [dem])

  // --- fondo de mapa -------------------------------------------------------
  //
  // Cambiar de fondo NO reconstruye el estilo. Un `setStyle()` se llevaría por
  // delante la malla, el viento, los senderos, las guaguas y los sitios, que
  // se añaden a mano cuando el mapa carga y no volverían solos. Lo único que
  // cambia aquí es qué capa raster está visible.
  //
  // La clase del contenedor va con ello: sobre la carta topográfica, que es
  // papel claro, el texto casi blanco de los marcadores deja de leerse.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const b of EXTERNAL_BASEMAPS) {
      map.setLayoutProperty(
        basemapLayerId(b.id),
        'visibility',
        b.id === props.basemap ? 'visible' : 'none',
      )
    }
    containerRef.current?.classList.toggle('map-light', BASEMAPS[props.basemap].light)
  }, [ready, props.basemap])

  // --- malla interpolada ---------------------------------------------------
  //
  // Una sola fuente de imagen para dos campos que no se parecen en nada. El
  // higrotérmico cubre la isla entera a 200 m por celda y se remuestrea suave,
  // porque es continuo de verdad; el de CO₂ cubre 1,5 km a 15 m por celda y se
  // remuestrea a vecino más cercano, porque sus bandas son umbrales y un
  // degradado entre dos de ellas inventaría un tramo intermedio. Comparten
  // capa porque para quien mira son la misma: lo que colorea el mapa.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !dem) return
    const src = map.getSource('grid') as maplibregl.ImageSource | undefined
    if (!src) return

    const masked = !isBundleVariable(variable)
    const field = props.maskedField
    if (!visible.grid || (masked ? !field : !models.temperature)) {
      map.setLayoutProperty('grid-raster', 'visibility', 'none')
      return
    }
    map.setLayoutProperty('grid-raster', 'visibility', 'visible')
    map.setPaintProperty(
      'grid-raster',
      'raster-resampling',
      masked ? 'nearest' : 'linear',
    )

    const grid = masked
      ? (() => {
          const raster = rasterizeMasked(field!)
          return {
            bounds: raster.bounds,
            canvas: rasterToCanvas(raster.pixels, raster.cols, raster.rows),
          }
        })()
      : renderGrid(
          dem,
          (lon, lat, elevation) => {
            const bundle = estimateBundle(models, lon, lat, elevation)
            return isBundleVariable(variable) ? (bundle[variable]?.value ?? null) : null
          },
          stops,
        )
    const [[w, s], [e, nth]] = grid.bounds
    // Si al llegar aquí seguía cargando la malla anterior, MapLibre aborta esa
    // carga y deja un `AbortError` en la consola. Es lo que queremos —gana la
    // más reciente— y no hay nada que capturar: el aborto lo emite el cargador
    // interno de forma asíncrona, no esta llamada.
    src.updateImage({
      url: grid.canvas.toDataURL(),
      coordinates: [
        [w, nth],
        [e, nth],
        [e, s],
        [w, s],
      ],
    })
  }, [ready, dem, models, variable, stops, visible.grid, props.maskedField])

  // --- viento animado ------------------------------------------------------
  //
  // El campo y la visibilidad se le pasan a la capa por método, no por props:
  // es un objeto WebGL con su propio ciclo de vida y volver a añadirlo al mapa
  // en cada cambio recompilaría los shaders y reiniciaría las partículas.
  useEffect(() => {
    if (!ready) return
    windLayerRef.current?.setField(props.wind)
  }, [ready, props.wind])

  // Apagarla es dejar de dibujar Y dejar de pedir fotogramas: la animación se
  // sostiene con `triggerRepaint`, así que con la capa oculta el mapa vuelve a
  // quedarse quieto y no consume batería.
  useEffect(() => {
    if (!ready) return
    windLayerRef.current?.setVisible(visible.wind)
  }, [ready, visible.wind])

  // --- capas GeoJSON estáticas --------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (props.trails) {
      const fc = props.trails as GeoJSON.FeatureCollection
      // La severidad se inyecta en una copia, no en el GeoJSON descargado: ese
      // objeto lo comparten el mapa y el muestreo de senderos, y mutarlo aquí
      // haría que el segundo leyera propiedades que él no puso.
      const painted: GeoJSON.FeatureCollection = {
        ...fc,
        features: fc.features.map((f) => {
          const id = f.properties?.id_sendero as number | undefined
          const sev = id !== undefined ? props.trailSeverity[id] : undefined
          return sev ? { ...f, properties: { ...f.properties, sev } } : f
        }),
      }
      ;(map.getSource('trails') as maplibregl.GeoJSONSource | undefined)?.setData(painted)
    }
    if (props.trailPois) {
      ;(map.getSource('trail-pois') as maplibregl.GeoJSONSource | undefined)?.setData(
        decoratePoiCollection(props.trailPois as GeoJSON.FeatureCollection),
      )
    }
  }, [ready, props.trails, props.trailPois, props.trailSeverity])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const vis = visible.trails ? 'visible' : 'none'
    for (const id of ['trails-line', 'trail-pois-cluster', 'trail-pois-point']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [ready, visible.trails])

  // --- red de guaguas ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setGuaguaData(map, props.guaguaLines, props.guaguaStops)
  }, [ready, props.guaguaLines, props.guaguaStops])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // Las dos capas siguen siendo dos —tienen zoom mínimo y estilo distintos—,
    // lo que ya no son es dos preguntas al usuario.
    setGuaguaVisible(map, {
      lines: visible.guagua,
      stops: visible.guagua,
      route: props.guaguaRoute,
    })
  }, [ready, visible.guagua, props.guaguaRoute])

  // Cruzar un umbral de zoom se avisa una sola vez por cruce: la barra lateral
  // necesita saberlo para no dejar una casilla marcada sobre un mapa donde no
  // puede aparecer nada. Son dos umbrales —las paradas de guagua y las pistas
  // del viario— y un solo listener: el evento `zoom` se dispara en cada
  // fotograma de un gesto, y dos suscripciones sería recorrerlo dos veces.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let last: boolean | null = null
    let lastTracks: boolean | null = null
    const check = () => {
      const zoom = map.getZoom()
      const reached = zoom >= STOPS_MIN_ZOOM
      if (reached !== last) {
        last = reached
        handlers.current.onStopsZoom(reached)
      }
      const tracks = zoom >= OSM_ROADS_MIN_ZOOM.minor
      if (tracks !== lastTracks) {
        lastTracks = tracks
        handlers.current.onTracksZoom(tracks)
      }
    }
    check()
    map.on('zoom', check)
    return () => {
      map.off('zoom', check)
    }
  }, [ready])

  // --- sitios y carreteras -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setPlacesData(map, props.places)
  }, [ready, props.places])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setRoadsData(map, props.roads)
  }, [ready, props.roads])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setOsmRoadsData(map, props.osmRoads)
  }, [ready, props.osmRoads])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setOsmRoadsVisible(map, visible.osmRoads)
  }, [ready, visible.osmRoads])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (props.canals) {
      ;(map.getSource('canals') as maplibregl.GeoJSONSource | undefined)?.setData(props.canals)
    }
    if (map.getLayer('canals-line')) {
      map.setLayoutProperty(
        'canals-line',
        'visibility',
        props.canalsVisible ? 'visible' : 'none',
      )
    }
  }, [ready, props.canals, props.canalsVisible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // La capa de sitios no tiene interruptor propio: se ve si hay algún tipo
    // encendido. Un interruptor más que solo puede estar en «sí» sería una
    // casilla que no decide nada.
    setPlacesVisible(map, (props.places?.features.length ?? 0) > 0)
    setRoadsVisible(map, visible.roads)
  }, [ready, props.places, visible.roads])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    setGuaguaRoute(map, props.guaguaRoute)
    if (!props.guaguaRoute) return
    // Y se encuadra. Antes no: pinchar «ver el recorrido en el mapa» dejaba el
    // mapa donde estuviera, así que si la línea caía fuera de la vista —o
    // detrás de la propia ficha, que ocupa el lado derecho— el botón parecía no
    // hacer nada. El relleno de la derecha deja sitio a la ficha en pantallas
    // anchas; en el móvil la ficha va abajo y el que sobra es el de abajo.
    const bounds = routeBounds(props.guaguaLines, props.guaguaRoute)
    if (!bounds) return
    const wide = map.getContainer().clientWidth >= 900
    map.fitBounds(bounds, {
      padding: wide
        ? { top: 60, bottom: 60, left: 360, right: 420 }
        : { top: 60, bottom: 320, left: 30, right: 30 },
      maxZoom: 13.5,
      duration: 700,
    })
  }, [ready, props.guaguaRoute, props.guaguaLines])

  /**
   * Resuelve solapamientos entre pins de estación y topónimos.
   *
   * Con 36 estaciones sobre una isla de 42 km, a zoom bajo los pins se pisan
   * unos a otros y tapan los nombres de los pueblos: el mapa deja de leerse
   * justo en la vista que más se usa. Se recorren por prioridad —altitud para
   * los pins, categoría para los topónimos— reservando un rectángulo por cada
   * uno que sobrevive; el que choca con algo ya colocado se colapsa a un punto,
   * que sigue siendo pinchable y sigue diciendo dónde hay un sensor.
   *
   * Los pins mandan sobre los topónimos: el dato es el contenido, el nombre es
   * el contexto.
   */
  const declutterImpl = () => {
    const map = mapRef.current
    if (!map) return

    const els: HTMLElement[] = []
    const items: DeclutterItem[] = []

    /**
     * Las cámaras de incendio entran en el reparto, que hasta ahora no lo
     * hacían: se pintaban con `z-index` 50 por encima de todo, y un triángulo
     * de aviso caído sobre una pastilla se leía como parte de la cifra. La
     * prioridad de cada clase de marcador está en `lib/declutter`.
     */
    for (const f of firesRef.current) {
      els.push(f.el)
      items.push({
        rank: f.alert ? RANK.fireAlert : RANK.fireQuiet,
        collapsible: false,
        box: box(map, f.el, f.lon, f.lat),
      })
    }
    for (const m of placeMarkersRef.current) {
      const el = m.getElement()
      const ll = m.getLngLat()
      const major = el.classList.contains('mk-place-city') || el.classList.contains('mk-place-town')
      els.push(el)
      items.push({
        rank: major ? RANK.placeMajor : RANK.placeMinor,
        collapsible: false,
        box: box(map, el, ll.lng, ll.lat),
      })
    }
    const maxElev = Math.max(1, ...pillsRef.current.map((p) => p.priority))
    for (const p of pillsRef.current) {
      els.push(p.el)
      items.push({
        rank: pillRank(p.priority, maxElev),
        collapsible: true,
        box: box(map, p.el, p.lon, p.lat),
      })
    }

    const placement = place(items)
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      el.classList.toggle('mk-pill-dot', placement[i] === 'dot')
      el.style.visibility = placement[i] === 'hidden' ? 'hidden' : 'visible'
    }
  }

  // Se guarda en una ref y se refresca en cada render: los listeners del mapa
  // se registran una sola vez y siempre acaban llamando a la versión que ve los
  // marcadores actuales.
  const declutterRef = useRef<() => void>(declutterImpl)
  declutterRef.current = declutterImpl
  const declutter = () => declutterRef.current()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let raf = 0
    const run = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => declutterRef.current())
    }
    map.on('move', run)
    map.on('zoom', run)
    run()
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', run)
      map.off('zoom', run)
    }
  }, [ready])

  // --- marcadores del DOM --------------------------------------------------
  // Estaciones, sensores y topónimos son pocos (decenas), y como marcadores del
  // DOM se pueden estilar con CSS y leer con un lector de pantalla, cosa que
  // una capa `symbol` no permite.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const add = (lon: number, lat: number, el: HTMLElement, zIndex = 1) => {
      el.style.zIndex = String(zIndex)
      const marker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map)
      markersRef.current.push(marker)
    }

    const pill = (text: string, background: string, color = '#141311') => {
      const el = document.createElement('button')
      el.className = 'mk-pill'
      el.textContent = text
      el.style.background = background
      el.style.color = color
      el.type = 'button'
      return el
    }

    const pills: { el: HTMLElement; lon: number; lat: number; priority: number }[] = []

    if (visible.stations) {
      const rejected = new Set(model?.rejected.map((r) => r.entityId) ?? [])
      // La cumbre se dibuja como una estación más porque ES una estación más:
      // mide temperatura, humedad, viento y presión, y desde `summit.ts` entra
      // en el motor igual que las demás. Se junta AQUÍ y no en `stations` para
      // no tocar ninguna de las cifras que la aplicación cuenta sobre la red
      // del Cabildo. Si el TNG no contesta, no hay pin y no hay hueco.
      for (const s of props.summit ? [...stations, props.summit] : stations) {
        // El pin enseña lo que la estación sabe de esa variable, que no es lo
        // mismo que las columnas que publica: con T y humedad el rocío está
        // determinado. Lo calculado se marca (subrayado de puntos) para que
        // siga distinguiéndose de lo medido.
        //
        // Salvo que no nos creamos a la estación. Entonces su propia lectura no
        // se pinta —ni siquiera en gris, porque un número gris sigue siendo un
        // número— y en su lugar va la estimación del modelo, con tilde delante
        // para que no pueda confundirse con una medida. Ver `station-fallback`.
        const faulty = props.health.get(s.entityId)?.faulty === true
        const fallback = faulty ? fallbackReading(models, s, pinVariable) : null
        const reading = faulty ? null : stationReading(s, pinVariable)
        const isRejected = rejected.has(s.entityId)

        const shown = reading ?? fallback
        // La cifra y su unidad salen de `pinLabel`, en el catálogo compartido,
        // no de un ternario escrito aquí: con la regla vieja el VPD —que va en
        // kPa con dos decimales— habría salido «2,9°». La tilde de delante sí
        // es de este mapa, porque solo aquí hay estimaciones que no son medidas.
        const label =
          shown === null
            ? faulty
              ? '⚠'
              : '·'
            : `${fallback ? '~' : ''}${pinLabel(pinVariable, shown.value)}`

        const muted = shown === null || isRejected || faulty
        const el = pill(
          label,
          muted ? '#4a453f' : cssColor(stops, shown.value),
          muted ? '#cfc9c1' : '#141311',
        )
        if (isRejected) el.classList.add('mk-rejected')
        if (faulty) {
          el.classList.add('mk-faulty')
          el.title = `${s.name} · ${t.health.faulty}${fallback ? ` · ${t.health.fallbackTag}` : ''}`
        }
        if (reading?.derived) {
          el.classList.add('mk-derived')
          el.title = `${s.name} · ${t.station.derivedValue}`
        }
        el.setAttribute(
          'aria-label',
          faulty
            ? `${s.name}, ${t.health.faulty}${fallback ? `, ${t.health.fallbackTag} ${pinLabel(pinVariable, fallback.value)}` : ''}`
            : `${s.name}, ${label}${reading?.derived ? `, ${t.point.derived}` : ''}`,
        )
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onStation(s)
        })
        // Un anillo de color según la frescura, sin ocupar sitio.
        el.style.boxShadow = `0 0 0 1.5px ${FRESHNESS_COLOR[freshness(s.ageHours)]}, 0 2px 8px rgba(0,0,0,.55)`
        add(s.lon, s.lat, el, 40)
        // Prioridad por altitud: en una isla de 2426 m las estaciones altas son
        // las que cuentan la historia, y son justo las que menos vecinas tienen.
        pills.push({ el, lon: s.lon, lat: s.lat, priority: s.elevation })
      }
    }

    if (visible.air) {
      for (const a of props.air) {
        if (a.ageHours > 24) continue // una AQI de hace días no dice nada de hoy
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'mk-dot mk-air'
        el.setAttribute('aria-label', `${t.air.title}: ${a.name}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onAir(a)
        })
        add(a.lon, a.lat, el, 30)
      }
    }

    if (visible.sky) {
      for (const sk of props.sky) {
        // 44 de 59 fotómetros llevan más de un mes mudos: solo se pintan vivos.
        if (Date.now() - sk.at > 24 * 3_600_000) continue
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'mk-dot mk-sky'
        el.setAttribute('aria-label', `${t.sky.title}: ${sk.name}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onSky(sk)
        })
        add(sk.lon, sk.lat, el, 25)
      }
    }

    if (visible.co2) {
      for (const c of props.co2) {
        const el = document.createElement('button')
        el.type = 'button'
        // Sin lectura fresca el punto se pinta gris y dice «sin datos». Nunca
        // se hereda el color de una lectura anterior.
        el.className = c.stale ? 'mk-dot mk-co2 mk-co2-stale' : 'mk-dot mk-co2'
        if (!c.stale && c.reading) {
          el.style.background = co2Band(c.reading.ppm).color
        }
        el.setAttribute(
          'aria-label',
          c.stale
            ? `${c.name}: ${t.co2.noData}`
            : `${c.name}: ${n0(c.reading!.ppm)} ppm`,
        )
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onCo2(c)
        })
        add(c.lon, c.lat, el, 35)
      }
    }

    if (visible.counters) {
      for (const site of props.counters) {
        const el = counterMarkerElement(site, {
          onClick: (s) => handlers.current.onCounter(s),
          label: (s) =>
            s.todayTotal === null
              ? t.counters.markerSilent(s.name)
              : t.counters.markerLabel(s.name, n0(s.todayTotal)),
        })
        add(site.lon, site.lat, el, 45)
        // Compiten por el sitio con las pastillas de estación, así que entran
        // en el mismo reparto. Prioridad por tráfico: donde pasa más gente es
        // donde la cifra dice algo, y los aforos de sendero son los que más se
        // solapan entre sí en la cumbre.
        pills.push({ el, lon: site.lon, lat: site.lat, priority: site.todayTotal ?? 0 })
      }
    }

    const fires: { el: HTMLElement; lon: number; lat: number; alert: boolean }[] = []

    if (visible.fire) {
      for (const f of props.fire) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = f.hasAlert ? 'mk-fire mk-fire-alert' : 'mk-fire'
        el.textContent = f.hasAlert ? '▲' : '△'
        el.setAttribute('aria-label', `${f.name}: ${f.hasAlert ? t.fire.alert : t.fire.noAlert}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onFire(f)
        })
        add(f.lon, f.lat, el, 50)
        // El `z-index` sigue haciendo falta —cuando dos cosas caben, la cámara
        // va delante—, pero ya no es lo único que reparte: entra en el mismo
        // sorteo que las pastillas para que no lleguen a pisarse.
        fires.push({ el, lon: f.lon, lat: f.lat, alert: f.hasAlert })
      }
    }

    pillsRef.current = pills
    firesRef.current = fires
    declutter()

    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      pillsRef.current = []
      firesRef.current = []
    }
  }, [
    ready,
    stations,
    // La cumbre llega por su cuenta, del TNG, unos segundos después que la red
    // del Cabildo. Sin esta dependencia su pin no aparecería hasta el refresco
    // siguiente, que son cinco minutos de mapa sin el punto más alto de la isla.
    props.summit,
    // El diagnóstico llega en segundo plano, después del primer pintado: sin
    // esta dependencia las averías no se marcarían hasta el refresco siguiente.
    props.health,
    models,
    model,
    variable,
    stops,
    visible.stations,
    visible.air,
    visible.co2,
    visible.sky,
    visible.fire,
    visible.counters,
    props.air,
    props.co2,
    props.sky,
    props.fire,
    props.counters,
  ])

  // --- topónimos, filtrados por zoom --------------------------------------
  //
  // Sobre la carta topográfica se ceden a partir de su `labelsFrom`: desde ese
  // zoom la carta rotula ella misma y los nuestros encima serían los mismos
  // nombres dos veces. Por debajo siguen siendo los únicos que se leen.
  const labelsFrom = BASEMAPS[props.basemap].labelsFrom
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !props.gazetteer.length) return

    const render = () => {
      for (const m of placeMarkersRef.current) m.remove()
      placeMarkersRef.current = []
      const z = map.getZoom()
      // Desde aquí rotula el fondo. Se sale después de haber vaciado los
      // marcadores: el relevo es limpio, no se solapan ni un fotograma.
      if (labelsFrom !== null && z >= labelsFrom) return
      const bounds = map.getBounds()
      // Orden de prioridad: primero las categorías grandes, para que en un
      // choque sobreviva «Los Llanos de Aridane» y no un caserío homónimo.
      const candidates = props.gazetteer
        .filter((p) => z >= (PLACE_MIN_ZOOM[p.kind] ?? 14) && bounds.contains([p.lon, p.lat]))
        .sort((a, b) => (PLACE_MIN_ZOOM[a.kind] ?? 14) - (PLACE_MIN_ZOOM[b.kind] ?? 14))
      for (const p of candidates) {
        const el = document.createElement('span')
        el.className = `mk-place mk-place-${p.kind}`
        el.textContent = p.name
        placeMarkersRef.current.push(
          new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map),
        )
      }
      declutter()
    }

    let timer: number | undefined
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(render, 90)
    }
    render()
    map.on('moveend', schedule)
    map.on('zoomend', schedule)
    return () => {
      window.clearTimeout(timer)
      map.off('moveend', schedule)
      map.off('zoomend', schedule)
      for (const m of placeMarkersRef.current) m.remove()
      placeMarkersRef.current = []
    }
  }, [ready, labelsFrom, props.gazetteer])

  // --- marcador del punto consultado --------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    probeMarkerRef.current?.remove()
    probeMarkerRef.current = null
    if (!probe) return
    const el = document.createElement('div')
    el.className = 'mk-probe'
    probeMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([probe.lon, probe.lat])
      .addTo(map)
  }, [ready, probe])

  // --- dónde está quien mira ----------------------------------------------
  // Es un punto y no una pastilla: no lleva ninguna cifra porque la posición
  // no es una medida. Lo que se mide en ese sitio lo dice la hoja.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    meMarkerRef.current?.remove()
    meMarkerRef.current = null
    if (!props.me) return
    const el = document.createElement('div')
    el.className = 'mk-me'
    meMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([props.me.lon, props.me.lat])
      .addTo(map)
  }, [ready, props.me])

  // --- mando a distancia ---------------------------------------------------
  useEffect(() => {
    const ref = props.handleRef
    if (!ref) return
    ref.current = {
      flyTo: (lon, lat, zoom = 12.5) => flyTo(mapRef.current, lon, lat, zoom),
      reset: () =>
        mapRef.current?.easeTo({ center: ISLAND_CENTER, zoom: 9.6, duration: 600 }),
    }
    return () => {
      ref.current = null
    }
  }, [props.handleRef])

  return <div ref={containerRef} className="map" />
}

export function flyTo(map: MlMap | null, lon: number, lat: number, zoom = 12.5) {
  map?.flyTo({ center: [lon, lat], zoom, duration: 700 })
}
