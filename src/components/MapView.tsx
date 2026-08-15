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
import { BASEMAP_LEVELS } from '../lib/realce/levels'
import { applyOverlayContrast } from './contrast/OverlayContrast'
import { isBundleVariable, pinLabel, type MapVariable } from '../lib/variables'
import { place, pillRank, RANK, type Box, type DeclutterItem } from '../lib/declutter'
import { renderGrid, rasterToCanvas } from '../lib/grid-canvas'
import { rasterizeMasked, type MaskedField } from '../lib/masked-field'
import { cssColor, co2Band, FRESHNESS_COLOR, type RgbStop } from '../lib/palette'
import { freshness, stationReading, type Station } from '../lib/quality'
import { decoratePoiCollection, readPoi, type PoiRecord } from '../lib/poi'
import { WindLayer } from './wind/WindLayer'
import { OceanLayer } from './ocean/OceanLayer'
import {
  CHART_LAYERS,
  CHART_SOURCES,
  DEPTH_OPACITY,
  DEPTH_SOURCE,
  SEAMARK_SOURCE,
} from '../lib/ocean/charts'
import type { OceanQuality } from '../lib/ocean/quality'
import type { OceanData } from '../hooks/useOcean'
import { VaporLayer } from './vapor/VaporLayer'
import type { VaporField } from '../lib/vapor/field'
import { CloudLayer } from './sky/CloudLayer'
import { SunLayer } from './sky/SunLayer'
import { RainLayer } from './sky/RainLayer'
import type { Cloud } from '../lib/sky/scene'
import { dayFactor, type SkyPosition } from '../lib/sun'
import { HILLSHADE_DEFAULT, terrainLight } from '../lib/terrain-light'
import { Terrain3D } from './terrain/Terrain3D'
import { applySunHillshade, sunHillshadeLayer } from './terrain/SunHillshade'
import {
  ShadowLayer,
  SHADOW_LAYER_ID,
  SHADOW_SOURCE_ID,
  TRANSPARENT_PIXEL,
} from './shadow/ShadowLayer'
import {
  CloudShadowLayer,
  CLOUD_SHADOW_LAYER_ID,
  CLOUD_SHADOW_SOURCE_ID,
} from './shadow/CloudShadowLayer'
import { markerSize } from './markers/size'
import { silenceDepthProbe } from './markers/depthProbe'
import { hiddenByRelief, type Camera } from '../lib/occlusion'
import { elevationAt } from '../lib/dem'
import { FLAT_MAX_PITCH, maxPitchFor, SKY, type Exaggeration } from '../lib/terrain'
import { seaBackground, skyDome } from '../lib/sky-dome'
import type { OceanLight } from '../lib/ocean/light'
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
import { addTdtLayer, setTdtVisible } from './tdt/TdtLayer'
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
import { webcamMarkerElement } from './webcams/WebcamMarker'
import { WEBCAM_SITES, type WebcamSite } from '../lib/webcams/catalog'
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
  /** La mancha de cobertura simulada de los repetidores de TDT. */
  tdt: boolean
  counters: boolean
  fire: boolean
  /**
   * Las webcams públicas de la isla. No cuesta ninguna petición encenderla: el
   * catálogo es estático y las imágenes solo se piden al abrir una ficha.
   */
  webcams: boolean
  wind: boolean
  /**
   * La evaporación que sube del terreno. Es una capa y no un modo como la 3D:
   * añade algo que se dibuja, no cambia la cámara. Ver `lib/vapor/`.
   */
  vapor: boolean
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
  /**
   * Un campo CONTINUO que no sale del motor de interpolación.
   *
   * Existe por la capa experimental de incendios, que cubre la isla entera
   * como la malla higrotérmica pero no se calcula con `estimateBundle`. Llega
   * como un cierre `valueAt` en vez de como una malla ya pintada por el mismo
   * motivo que `maskedField`: quien decide el paso y el recorte es el
   * rasterizador, y quien cuenta las cifras en el panel tiene que estar usando
   * exactamente el mismo campo que el mapa.
   */
  gridField: { valueAt: (lon: number, lat: number, elevation: number) => number | null; stops: RgbStop[] } | null
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
  /**
   * De dónde sale vapor, cuánto, y hasta dónde sube. Se construye fuera —el
   * panel enseña el mismo techo de condensación que el mapa dibuja— y llega
   * hecho, igual que el campo enmascarado.
   */
  vapor: VaporField | null
  /** La hora que se está dibujando y a qué velocidad corre su sol. */
  vaporClock: { at: Date; timeScale: number }
  /**
   * La escena atmosférica en tres dimensiones: nubes y lluvia.
   *
   * Va aparte de `visible` por lo mismo que la vista 3D y el océano: no es una
   * capa más de la lista, es una función experimental que se enciende en su
   * propia sección y que no debe contar en el marcador de capas activas.
   *
   * Las nubes llegan YA COLOCADAS —`hooks/useSky.ts` las construye a partir de
   * la rejilla del modelo— y aquí solo se dibujan y se mueven. Es la misma
   * división que con el vapor: quien decide qué hay es un módulo de `lib/`,
   * quien lo pinta es una capa de GL, y el panel enseña las mismas cifras que
   * el mapa está usando porque son literalmente el mismo objeto.
   */
  sky3d: { on: boolean; clouds: Cloud[]; sun: SkyPosition }
  /**
   * La luz solar sobre el relieve.
   *
   * Va aparte de `sky3d` aunque compartan el sol: son dos funciones que se
   * encienden por separado —se puede querer la isla iluminada de verdad sin
   * nubes encima, y al revés— y juntarlas en un interruptor habría obligado a
   * aceptar las dos para tener una.
   *
   * `moon` llega solo cuando hace falta: de día no se calcula.
   */
  sunLight: {
    on: boolean
    /**
     * Las sombras que el relieve se echa encima. Es la misma función llevada
     * hasta el final —el `hillshade` sabe hacia dónde mira cada ladera, no qué
     * tiene delante—, y por eso viaja aquí dentro y no como interruptor suelto.
     */
    shadows: boolean
    sun: SkyPosition
    moon: SkyPosition | null
    moonPhase: number
    /**
     * La luz de este instante, para el cielo de la vista 3D. Es el MISMO objeto
     * que ilumina el agua —`ocean/light.ts`—, y por eso llega desde fuera en vez
     * de calcularse aquí: el mar refleja el cielo, así que dos cálculos serían
     * dos cielos contradiciéndose a los dos lados del horizonte.
     *
     * `null` con el interruptor apagado: entonces manda la cúpula fija de
     * `SKY`, que es la de siempre.
     */
    dome: OceanLight | null
    /** Si se dibuja el disco del sol en el cielo. Ver `sky/SunLayer.ts`. */
    disc: boolean
  }
  /**
   * La vista en tres dimensiones. Es un modo aparte que se enciende, no una
   * capa más: cambia la cámara, no lo que se dibuja. Ver `lib/terrain.ts`.
   */
  terrain: { on: boolean; exaggeration: Exaggeration }
  /**
   * El océano. Tampoco es una capa de datos: es el mar, que está ahí siempre y
   * al que se le puede pedir que se comporte como el de fuera. Va aparte de
   * `visible` por lo mismo que la vista 3D —no cuenta como capa encendida— y
   * porque lleva su propio ajuste de calidad, que no lo tiene ninguna otra.
   */
  ocean: { on: boolean; seamarks: boolean; depth: boolean; quality: OceanQuality }
  oceanData: OceanData
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
  onWebcam: (site: WebcamSite) => void
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
 * SOLO LEE. Antes escribía —deshacía el encogido y forzaba la visibilidad—
 * justo antes de preguntar por el tamaño, y escribir y leer alternándose
 * obliga al navegador a recalcular el diseño de la página entera entre cada
 * par: 249 recálculos por pasada para averiguar unos anchos que no cambian.
 * El tamaño lo recuerda ahora `markers/size.ts`, que lo mide una vez.
 */
function box(map: MlMap, el: HTMLElement, lon: number, lat: number): Box {
  const pt = map.project([lon, lat])
  const { w, h } = markerSize(el)
  return { x: pt.x, y: pt.y, w, h }
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
  /** El mar, por lo mismo: es un objeto WebGL con texturas y estado propio. */
  const oceanLayerRef = useRef<OceanLayer | null>(null)
  /** La de vapor, por lo mismo: objeto WebGL con partículas que sobreviven. */
  const vaporLayerRef = useRef<VaporLayer | null>(null)
  /** Las dos de la escena atmosférica, por lo mismo. */
  const cloudLayerRef = useRef<CloudLayer | null>(null)
  const sunLayerRef = useRef<SunLayer | null>(null)
  const rainLayerRef = useRef<RainLayer | null>(null)
  /** El relieve 3D, por lo mismo: estado de MapLibre que no es de React. */
  const terrainRef = useRef<Terrain3D | null>(null)
  const shadowRef = useRef<ShadowLayer | null>(null)
  const cloudShadowRef = useRef<CloudShadowLayer | null>(null)
  /** Pins de estación en juego, para resolver solapamientos en cada movimiento. */
  const pillsRef = useRef<
    { el: HTMLElement; lon: number; lat: number; priority: number; elevation?: number }[]
  >([])
  /**
   * Las cámaras de incendio, que también compiten por el sitio.
   *
   * No son pastillas y no se colapsan a un punto —un triángulo colapsado no
   * dice nada—, pero tienen que entrar en el reparto igual que los aforos: se
   * dibujaban por encima de todo sin avisar a nadie, y un triángulo caído justo
   * sobre una pastilla se leía como parte de la cifra. Ver `declutterImpl`.
   */
  const firesRef = useRef<{ el: HTMLElement; lon: number; lat: number; alert: boolean }[]>([])
  /**
   * Las webcams. No compiten por el sitio —ver el bloque que las crea— pero sí
   * tienen que esconderse cuando hay montaña delante: una cámara del Roque
   * dibujada sobre la ladera que la tapa se lee como si estuviera en la ladera.
   */
  const webcamsRef = useRef<{ el: HTMLElement; lon: number; lat: number }[]>([])
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
      for (const b of EXTERNAL_BASEMAPS) {
        const realce = BASEMAP_LEVELS[b.id]
        map.addSource(basemapSourceId(b.id), b.source)
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
      const sunLayer = new SunLayer()
      sunLayerRef.current = sunLayer
      map.addLayer(sunLayer)

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
      rainLayerRef.current = null
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [dem])

  // --- vista 3D ------------------------------------------------------------
  // La exageración se manda ANTES que el interruptor: si llegara después, al
  // encender la vista se levantaría con el valor anterior y daría un salto de
  // relieve en el primer fotograma.
  useEffect(() => {
    if (!ready) return
    terrainRef.current?.setExaggeration(props.terrain.exaggeration)
    // El tope de inclinación va ANTES de encender: `enter()` lo lee para poner
    // el `maxPitch` con el que después inclina la cámara.
    terrainRef.current?.setCeiling(maxPitchFor(props.basemap))
    terrainRef.current?.setEnabled(props.terrain.on)
  }, [ready, props.terrain.on, props.terrain.exaggeration, props.basemap])

  // --- océano --------------------------------------------------------------
  //
  // Los datos van por método y no por props, igual que en la capa de viento:
  // el mar es un objeto WebGL con seis texturas, y volver a añadirlo al mapa en
  // cada cambio recompilaría los sombreadores y reiniciaría la animación.
  // El mar en movimiento depende también del fondo: sobre la carta topográfica
  // no se dibuja. Lo dice el propio fondo, en el campo `sea` de `basemaps.ts`,
  // y aquí solo se obedece. El interruptor NO se apaga por eso: quien vuelva al
  // relieve o al satélite se encuentra el mar donde lo dejó.
  useEffect(() => {
    if (!ready) return
    oceanLayerRef.current?.setVisible(props.ocean.on && BASEMAPS[props.basemap].sea !== false)
  }, [ready, props.ocean.on, props.basemap])

  useEffect(() => {
    if (!ready) return
    oceanLayerRef.current?.setQuality(props.ocean.quality)
  }, [ready, props.ocean.quality])

  useEffect(() => {
    if (!ready) return
    oceanLayerRef.current?.setField(props.oceanData.field)
  }, [ready, props.oceanData.field])

  useEffect(() => {
    if (!ready) return
    oceanLayerRef.current?.setShoreline(props.oceanData.shoreline)
  }, [ready, props.oceanData.shoreline])

  useEffect(() => {
    if (!ready || !props.oceanData.bathymetry) return
    oceanLayerRef.current?.setBathymetry(
      props.oceanData.bathymetry.image,
      props.oceanData.bathymetry.maxDepthM,
    )
  }, [ready, props.oceanData.bathymetry])

  useEffect(() => {
    if (!ready) return
    oceanLayerRef.current?.setInputs({
      tideM: props.oceanData.tideM ?? 0,
      windMs: props.oceanData.windMs,
      light: { pm10: props.oceanData.pm10, solarWm2: props.oceanData.solarWm2 },
      basePhoto: BASEMAPS[props.basemap].sea === 'foto',
    })
  }, [
    ready,
    props.basemap,
    props.oceanData.tideM,
    props.oceanData.windMs,
    props.oceanData.pm10,
    props.oceanData.solarWm2,
  ])

  // Las dos capas de la carta, cada una con su interruptor: el balizamiento y
  // la escala de color de profundidad no son la misma cosa ni se piden juntas.
  // Ver `lib/ocean/charts.ts`.
  //
  // YA NO DEPENDEN DEL MAR SIMULADO. Dependían: se pedían solo con el océano
  // encendido, razonando que sin agua debajo serían dos capas sueltas sobre el
  // color de fondo. El razonamiento no se sostiene —son rásteres que se dibujan
  // sobre cualquier fondo, y encima de la ortofoto la batimetría se lee
  // perfectamente— y el precio sí era real: para ver una carta publicada por
  // EMODnet había que encender antes una simulación que no tiene nada que ver
  // con ella, y que además se lleva el fondo al satélite.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const shown: [string, boolean][] = [
      [CHART_LAYERS.depth, props.ocean.depth],
      [CHART_LAYERS.seamarks, props.ocean.seamarks],
    ]
    for (const [id, on] of shown) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }
  }, [ready, props.ocean.depth, props.ocean.seamarks])

  // --- luz del sol sobre el relieve ----------------------------------------
  //
  // Se toca el `paint` de la capa `hillshade` que ya existe: no se añade nada al
  // mapa ni se pide una tesela más. El sombreado es el mismo, con otra luz.
  //
  // Al apagar se devuelven los valores del estilo, que vienen de la misma
  // constante que el estilo usó para ponerlos.
  //
  // Y la misma luz se le pasa a la capa de encima del fondo, que es la que se ve
  // cuando hay una ortofoto tapando ésta. Van juntas a propósito: son el mismo
  // sombreado, y calcular la luz dos veces sería tener dos soles otra vez.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer('hillshade')) return
    const light = props.sunLight.on
      ? terrainLight(props.sunLight.sun, props.sunLight.moon, props.sunLight.moonPhase)
      : HILLSHADE_DEFAULT
    map.setPaintProperty('hillshade', 'hillshade-illumination-direction', light.direction)
    map.setPaintProperty('hillshade', 'hillshade-exaggeration', light.exaggeration)
    map.setPaintProperty('hillshade', 'hillshade-highlight-color', light.highlight)
    map.setPaintProperty('hillshade', 'hillshade-shadow-color', light.shadow)
    map.setPaintProperty('hillshade', 'hillshade-accent-color', light.accent)
    applySunHillshade(map, { on: props.sunLight.on, basemap: props.basemap, light })
  }, [
    ready,
    props.basemap,
    props.sunLight.on,
    props.sunLight.sun,
    props.sunLight.moon,
    props.sunLight.moonPhase,
  ])

  // --- el cielo de la vista 3D ---------------------------------------------
  //
  // Va con la misma casilla y no con una suya: es el cuarto sol de la escena
  // —el mar, las nubes y el relieve ya sabían la hora; el aire que hay detrás,
  // no— y ofrecer «cielo real» aparte de «luz real» sería preguntar dos veces
  // por la misma cosa.
  //
  // `setSky` acepta el cambio en caliente y no reconstruye nada: es el mismo
  // trato que el `paint` del hillshade. En vista plana no se dibuja ni un
  // píxel de esto —MapLibre solo pinta por encima del horizonte, y con la
  // cámara a cero el horizonte está en el infinito—, así que apagarlo con la 3D
  // sería trabajo para nada.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const dome = props.sunLight.on ? props.sunLight.dome : null
    map.setSky(dome ? skyDome(dome, props.sunLight.sun) : SKY)
    // Y el fondo, que a la inclinación de entrada es lo que llena la parte de
    // arriba de la pantalla: mar lejano, no cúpula. Ver `seaBackground`.
    if (map.getLayer('sea')) {
      map.setPaintProperty('sea', 'background-color', seaBackground(dome))
    }
  }, [ready, props.sunLight.on, props.sunLight.dome, props.sunLight.sun])

  // --- sombras arrojadas ---------------------------------------------------
  //
  // Va aparte del efecto de arriba aunque las dos cosas sean «la luz del sol»,
  // y no por gusto: aquélla toca cinco propiedades de pintura y termina, ésta
  // gobierna un objeto con estado que se guarda entre renders, decide solo
  // cuándo merece la pena rehacer el barrido y tiene que soltarse al desmontar.
  // Son los mismos motivos por los que `Terrain3D` y `OceanLayer` viven en una
  // ref y no en el cuerpo del componente.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !dem) return
    if (!shadowRef.current) shadowRef.current = new ShadowLayer(map, dem)
    const layer = shadowRef.current
    layer.setEnabled(props.sunLight.shadows)
    layer.update(props.sunLight.sun)
  }, [ready, dem, props.sunLight.shadows, props.sunLight.sun])

  // Las manchas de las nubes. Piden las dos cosas: el interruptor de sombras y
  // que haya cielo dibujado, porque sin escena atmosférica no hay ninguna nube
  // de la que sacar una sombra.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !dem) return
    if (!cloudShadowRef.current) cloudShadowRef.current = new CloudShadowLayer(map, dem)
    const layer = cloudShadowRef.current
    layer.setScene(props.sky3d.clouds, props.sunLight.sun)
    layer.setEnabled(props.sunLight.shadows && props.sky3d.on && props.sky3d.clouds.length > 0)
  }, [
    ready,
    dem,
    props.sunLight.shadows,
    props.sunLight.sun,
    props.sky3d.on,
    props.sky3d.clouds,
  ])

  // El DEM se sustituye entero cuando termina de cargar, y la capa se queda con
  // el de antes: se tira y se rehace con el nuevo.
  useEffect(() => {
    return () => {
      shadowRef.current?.destroy()
      shadowRef.current = null
      cloudShadowRef.current?.destroy()
      cloudShadowRef.current = null
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
    // Y con ello, el color de todo lo que se dibuja ENCIMA del fondo. Sobre la
    // carta topográfica, que es papel blanco, el gris cálido de las carreteras
    // dejaba de verse: ver `contrast/palette.ts`, donde está la regla que lo
    // corrige conservando la jerarquía entre unas líneas y otras.
    applyOverlayContrast(map, props.basemap)
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

    // Tres campos distintos comparten esta capa: el higrotérmico continuo que
    // sale del motor, los enmascarados que solo existen donde alguien midió, y
    // el continuo del modelo de incendios, que cubre la isla pero no viene de
    // `estimateBundle`. Para quien mira son la misma cosa —lo que colorea el
    // mapa— y por eso comparten fuente de imagen.
    const external = props.gridField
    const masked = !isBundleVariable(variable) && !external
    const field = props.maskedField
    if (!visible.grid || (external ? false : masked ? !field : !models.temperature)) {
      map.setLayoutProperty('grid-raster', 'visibility', 'none')
      return
    }
    map.setLayoutProperty('grid-raster', 'visibility', 'visible')
    map.setPaintProperty(
      'grid-raster',
      'raster-resampling',
      masked ? 'nearest' : 'linear',
    )

    const grid = external
      ? renderGrid(dem, external.valueAt, external.stops)
      : masked
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
  }, [ready, dem, models, variable, stops, visible.grid, props.maskedField, props.gridField])

  // --- viento animado ------------------------------------------------------
  //
  // El campo y la visibilidad se le pasan a la capa por método, no por props:
  // es un objeto WebGL con su propio ciclo de vida y volver a añadirlo al mapa
  // en cada cambio recompilaría los shaders y reiniciaría las partículas.
  useEffect(() => {
    if (!ready) return
    windLayerRef.current?.setField(props.wind)
  }, [ready, props.wind])

  // El modelo de elevación, para que cada partícula sepa por dónde va el suelo.
  // Sin él la capa dibuja plano; con él, y con el relieve encendido, las estelas
  // van sobre el terreno y las tapa la montaña que tienen delante.
  useEffect(() => {
    if (!ready) return
    windLayerRef.current?.setDem(dem)
  }, [ready, dem])

  // Apagarla es dejar de dibujar Y dejar de pedir fotogramas: la animación se
  // sostiene con `triggerRepaint`, así que con la capa oculta el mapa vuelve a
  // quedarse quieto y no consume batería.
  //
  // Ya NO se apaga con la vista 3D. Se apagaba porque las partículas se
  // calculaban a cota cero y con la cámara inclinada cruzaban las montañas por
  // dentro; ahora cada vértice lleva la cota del punto por el que pasa y la
  // capa comparte el búfer de profundidad con el relieve, así que una estela
  // detrás de una cresta queda detrás de la cresta. Ver `WindLayer`.
  useEffect(() => {
    if (!ready) return
    windLayerRef.current?.setVisible(visible.wind)
  }, [ready, visible.wind])

  // --- evaporación del terreno --------------------------------------------
  //
  // Igual que el viento: los datos se le pasan por método, no reconstruyendo la
  // capa. Volver a añadirla al mapa en cada refresco recompilaría los shaders y
  // reiniciaría las partículas, y el vapor se vería parpadear cada cinco
  // minutos justo cuando llega el modelo nuevo.
  useEffect(() => {
    if (!ready) return
    vaporLayerRef.current?.setSources(dem, props.vapor, props.wind)
  }, [ready, dem, props.vapor, props.wind])

  useEffect(() => {
    if (!ready) return
    vaporLayerRef.current?.setVisible(visible.vapor)
  }, [ready, visible.vapor])

  useEffect(() => {
    if (!ready) return
    vaporLayerRef.current?.setExaggeration(props.terrain.exaggeration)
  }, [ready, props.terrain.exaggeration])

  useEffect(() => {
    if (!ready) return
    vaporLayerRef.current?.setClock(props.vaporClock.at, props.vaporClock.timeScale)
  }, [ready, props.vaporClock.at, props.vaporClock.timeScale])

  // --- escena atmosférica: nubes y lluvia -----------------------------------
  //
  // Mismo criterio que las dos anteriores: los datos entran por método y la capa
  // no se vuelve a crear nunca. Aquí importa el doble, porque recrearla no solo
  // recompilaría los shaders: rebarajaría las siluetas de todas las nubes y
  // reiniciaría la cortina de lluvia a medio caer.
  //
  // La escena y la lluvia se ponen en el MISMO efecto y con la misma
  // dependencia. Son la misma escena vista dos veces —de qué nubes cae el agua
  // es una propiedad de esas nubes—, y separarlos abría la puerta a un
  // fotograma con la lluvia de la escena anterior colgando de las nubes de la
  // nueva.
  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setScene(props.sky3d.clouds)
    rainLayerRef.current?.setScene(props.sky3d.clouds, dem)
  }, [ready, props.sky3d.clouds, dem])

  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setVisible(props.sky3d.on)
    rainLayerRef.current?.setVisible(props.sky3d.on)
  }, [ready, props.sky3d.on])

  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setExaggeration(props.terrain.exaggeration)
    rainLayerRef.current?.setExaggeration(props.terrain.exaggeration)
  }, [ready, props.terrain.exaggeration])

  // La luz. Las dos capas tienen que recibir el MISMO sol: si la nube se
  // apagara al anochecer y la lluvia no, se vería llover de un cielo vacío.
  //
  // Y la nube recibe además la luz completa —la que ilumina el agua y pinta la
  // cúpula—, de la que saca dos cosas: el color al que se desvanece la distancia
  // y la luz que hay de noche. Va aparte del sol porque no depende del
  // interruptor de luz solar: la escena atmosférica se dibuja con su propio
  // interruptor y el aire que hay delante existe igual.
  useEffect(() => {
    if (!ready) return
    cloudLayerRef.current?.setSun(props.sky3d.sun)
    cloudLayerRef.current?.setLight(props.sunLight.dome)
    sunLayerRef.current?.setSun(props.sky3d.sun)
    sunLayerRef.current?.setLight(props.sunLight.dome)
    rainLayerRef.current?.setDay(dayFactor(props.sky3d.sun.elevationDeg))
  }, [ready, props.sky3d.sun, props.sunLight.dome])

  // El disco del sol tiene su propia casilla: es lo único de esta función que
  // se DIBUJA en vez de iluminar, y dibujar un sol sobre un mapa de datos es una
  // decisión de quien mira, no del programa.
  useEffect(() => {
    if (!ready) return
    sunLayerRef.current?.setVisible(props.sunLight.disc)
  }, [ready, props.sunLight.disc])

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
    setTdtVisible(map, visible.tdt)
  }, [ready, visible.tdt])

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
    /** Los que no se reparten porque hay montaña delante. Ver más abajo. */
    const behind: HTMLElement[] = []

    /**
     * ¿Hay relieve entre la cámara y este punto?
     *
     * Solo con la vista inclinada: en plano la cámara mira desde arriba y no
     * hay nada que se pueda poner delante de nada.
     *
     * Esta es la mitad visible del cambio que quitó los 1.694 ms de espera a la
     * GPU por cada seis segundos de vista 3D. La comprobación la hacía MapLibre
     * marcador a marcador leyendo el búfer de profundidad; ahora se hace aquí,
     * con el modelo de elevación que ya está en memoria, en la misma pasada que
     * reparte los solapamientos. El porqué completo, con las cifras medidas,
     * está en `lib/occlusion.ts`.
     *
     * Un punto tapado se ESCONDE y no compite por el sitio: dejarlo en el
     * reparto haría que un dato invisible desalojara a uno que sí se ve.
     */
    const camera: Camera | null =
      props.terrain.on && dem
        ? (() => {
            const c = map.transform.getCameraPosition()
            return { lon: c.lngLat.lng, lat: c.lngLat.lat, altitude: c.altitude }
          })()
        : null

    const covered = (lon: number, lat: number, elevation?: number): boolean => {
      if (!camera || !dem) return false
      const z = elevation ?? elevationAt(dem, lon, lat) ?? 0
      return hiddenByRelief(dem, camera, { lon, lat, elevation: z }, props.terrain.exaggeration)
    }

    /**
     * Las cámaras de incendio entran en el reparto, que hasta ahora no lo
     * hacían: se pintaban con `z-index` 50 por encima de todo, y un triángulo
     * de aviso caído sobre una pastilla se leía como parte de la cifra. La
     * prioridad de cada clase de marcador está en `lib/declutter`.
     */
    for (const f of firesRef.current) {
      if (covered(f.lon, f.lat)) {
        behind.push(f.el)
        continue
      }
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
      if (covered(ll.lng, ll.lat)) {
        behind.push(el)
        continue
      }
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
      // La pastilla de una estación sí sabe su cota de verdad —la publica el
      // Cabildo— y se le pasa: consultar el DEM en su lugar movería el punto de
      // salida del rayo unos metros justo donde más se nota, en una estación
      // asomada al borde de una pared.
      if (covered(p.lon, p.lat, p.elevation)) {
        behind.push(p.el)
        continue
      }
      els.push(p.el)
      items.push({
        rank: pillRank(p.priority, maxElev),
        collapsible: true,
        box: box(map, p.el, p.lon, p.lat),
      })
    }

    /*
     * Las webcams SÍ entran en el reparto, y no lo hacían.
     *
     * El razonamiento para dejarlas fuera era que amontonarse es cuestión de
     * legibilidad y que siete de ellas caen dentro del recinto del
     * observatorio, así que repartirlas dejaría el Roque con un icono. Estaba
     * mal: lo que se amontona no son ellas entre sí, es cada una contra las
     * pastillas de las estaciones, y el pin es un cuadrado macizo que no estorba
     * la cifra sino que la tacha. Salió «2◉4°» en Tirimaga. En el Roque se
     * apilan a zoom bajo y se separan al acercarse, que es lo que hacen todas.
     *
     * No son plegables: una webcam encogida a un punto se leería como un sensor
     * más, y un punto no enseña ninguna foto.
     */
    for (const w of webcamsRef.current) {
      if (covered(w.lon, w.lat)) {
        behind.push(w.el)
        continue
      }
      els.push(w.el)
      items.push({ rank: RANK.webcam, collapsible: false, box: box(map, w.el, w.lon, w.lat) })
    }

    const placement = place(items)
    // Las escrituras van TODAS al final, después de la última lectura. Mezclarlas
    // con las consultas de posición devolvería el recálculo de diseño por
    // marcador que `markers/size.ts` acaba de quitar de en medio.
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      el.classList.toggle('mk-pill-dot', placement[i] === 'dot')
      // Detrás de la montaña se esconde entero, no se atenúa: un pin medio
      // transparente sobre una ladera sigue leyéndose como un dato de ESA
      // ladera, que es justo lo que no es.
      el.style.visibility =
        placement[i] === 'hidden' ? 'hidden' : 'visible'
    }
    for (const el of behind) el.style.visibility = 'hidden'
  }

  // Se guarda en una ref y se refresca en cada render: los listeners del mapa
  // se registran una sola vez y siempre acaban llamando a la versión que ve los
  // marcadores actuales.
  const declutterRef = useRef<() => void>(declutterImpl)
  declutterRef.current = declutterImpl
  const declutter = () => declutterRef.current()

  /**
   * Cada cuánto se rehace el reparto mientras la cámara se mueve, en ms.
   *
   * ANTES NO HABÍA NINGUNO, y no por decisión: el planificador cancelaba su
   * propio fotograma pendiente en cada evento `move`, así que durante un
   * arrastre continuo —que emite un `move` por fotograma— la pasada no llegaba
   * a ejecutarse casi nunca. Medido en producción, un arrastre de seis segundos
   * disparaba dos pasadas. Funcionaba de casualidad y como un límite escondido.
   *
   * Ahora el límite es explícito y va en la otra dirección: se COALESCE por
   * fotograma —varios `move` seguidos son una sola pasada— pero se deja de
   * posponer indefinidamente. 60 ms es el paso en el que la oclusión por
   * relieve sigue el giro de la cámara sin que se vea el retraso, y son ~16
   * pasadas por segundo en vez de 60: con 249 marcadores, la diferencia entre
   * ~11 ms/s de reparto y ~42 ms/s.
   */
  const DECLUTTER_MS = 60

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let raf = 0
    let last = 0
    const run = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const now = performance.now()
        if (now - last < DECLUTTER_MS) return
        last = now
        declutterRef.current()
      })
    }
    // Al soltar sí se rehace siempre, sin mirar el reloj: es el fotograma que
    // se queda en pantalla, y dejarlo con el reparto de hace 59 ms sería dejar
    // una pastilla escondida detrás de una montaña que ya no está delante.
    const settle = () => {
      last = 0
      declutterRef.current()
    }
    map.on('move', run)
    map.on('zoom', run)
    map.on('moveend', settle)
    map.on('zoomend', settle)
    settle()
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', run)
      map.off('zoom', run)
      map.off('moveend', settle)
      map.off('zoomend', settle)
    }
  }, [ready])

  // Encender o apagar la 3D cambia quién está tapado por el relieve, y eso no
  // lo provoca ningún movimiento de cámara: sin esto, los marcadores se
  // quedarían con el reparto del modo anterior hasta que alguien tocara el mapa.
  useEffect(() => {
    if (!ready) return
    declutterRef.current()
  }, [ready, props.terrain.on, props.terrain.exaggeration])

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
      // Después de `addTo`, que es quien encola la primera comprobación. La
      // oclusión no se pierde: la hace `declutterImpl` con el DEM.
      silenceDepthProbe(marker)
      // Y se mide aquí, una vez, mientras la pastilla está recién puesta y
      // expandida: dentro del bucle de reparto la medición costaba un recálculo
      // de diseño de la página entera por marcador y por pasada.
      markerSize(el)
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

    const pills: {
      el: HTMLElement
      lon: number
      lat: number
      priority: number
      /** Cota publicada por el Cabildo. Los aforos no la traen. */
      elevation?: number
    }[] = []

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
        pills.push({ el, lon: s.lon, lat: s.lat, priority: s.elevation, elevation: s.elevation })
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

    // Las webcams NO entran en el REPARTO de `declutter`, al contrario que las
    // pastillas y los triángulos de incendio. Es deliberado: el reparto existe
    // para que dos CIFRAS no se pisen y se lean como una sola, y aquí no hay
    // ninguna cifra que malinterpretar. Siete de los sitios están dentro del
    // recinto del observatorio, a metros unos de otros, y esconderlos por
    // solaparse dejaría el Roque —justo donde más webcams hay— con un icono.
    // Se amontonan a zoom bajo y se separan al acercarse, como los sensores.
    //
    // La OCLUSIÓN sí la hacen, y va en `declutterImpl` con las demás.
    const cams: { el: HTMLElement; lon: number; lat: number }[] = []

    if (visible.webcams) {
      for (const site of WEBCAM_SITES) {
        const el = webcamMarkerElement(site, {
          onClick: (s) => handlers.current.onWebcam(s),
          label: (s) => `${t.webcams.title}: ${s.name}`,
        })
        add(site.lon, site.lat, el, 48)
        cams.push({ el, lon: site.lon, lat: site.lat })
      }
    }

    pillsRef.current = pills
    firesRef.current = fires
    webcamsRef.current = cams
    declutter()

    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      pillsRef.current = []
      firesRef.current = []
      webcamsRef.current = []
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
    // El catálogo es estático, así que aquí solo hace falta el interruptor: no
    // hay unos datos de webcam que puedan llegar tarde y repintar.
    visible.webcams,
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
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.lon, p.lat])
          .addTo(map)
        silenceDepthProbe(marker)
        markerSize(el)
        placeMarkersRef.current.push(marker)
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
    silenceDepthProbe(probeMarkerRef.current)
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
    silenceDepthProbe(meMarkerRef.current)
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
