/**
 * Mapa. MapLibre GL, estilo propio, sin proveedor externo ni clave de API.
 */

import { useEffect, useRef, useState } from 'react'
import maplibregl, { type LngLatLike, type Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { BASEMAPS, EXTERNAL_BASEMAPS, basemapLayerId } from '../lib/basemaps'
import { useTileCache } from '../hooks/useTileCache'
import { applyOverlayContrast } from './contrast/OverlayContrast'
import { isBundleVariable } from '../lib/variables'
import { renderGrid, rasterToCanvas } from '../lib/grid-canvas'
import { rasterizeMasked } from '../lib/masked-field'
import { decoratePoiCollection } from '../lib/poi'
import { WindLayer } from './wind/WindLayer'
import { OceanLayer } from './ocean/OceanLayer'
import { CHART_LAYERS } from '../lib/ocean/charts'
import { VaporLayer } from './vapor/VaporLayer'
import { CloudLayer } from './sky/CloudLayer'
import { SunLayer } from './sky/SunLayer'
import { StarLayer } from './stars/StarLayer'
import { MoonLayer } from './moon/MoonLayer'
import { SunPathLayer } from './sky/SunPathLayer'
import { RainLayer } from './sky/RainLayer'
import { HILLSHADE_DEFAULT, terrainLight } from '../lib/terrain-light'
import { Terrain3D } from './terrain/Terrain3D'
import { applySunHillshade } from './terrain/SunHillshade'
import { ShadowLayer } from './shadow/ShadowLayer'
import { CloudShadowLayer } from './shadow/CloudShadowLayer'
import { markerSize } from './markers/size'
import { silenceDepthProbe } from './markers/depthProbe'
import { maxPitchFor, SKY } from '../lib/terrain'
import { seaBackground, skyDome } from '../lib/sky-dome'
import { setGuaguaData, setGuaguaRoute, setGuaguaVisible } from './guagua/GuaguaLayer'
import { routeBounds, STOPS_MIN_ZOOM } from '../lib/guagua/display'
import { setPlacesData, setPlacesVisible, setRoadsData, setRoadsVisible } from './places/PlacesLayer'
import { setTdtVisible } from './tdt/TdtLayer'
import { setOsmRoadsData, setOsmRoadsVisible, OSM_ROADS_MIN_ZOOM } from './roads/OsmRoadsLayer'
import { useDomMarkers } from './map/useDomMarkers'
import { useDeclutter } from './map/useDeclutter'
import { useMapSetup } from './map/useMapSetup'
import { useSkyScene } from './map/useSkyScene'
import { estimateBundle } from '../lib/interpolate'

export const ISLAND_CENTER: LngLatLike = [-17.86, 28.66]

/**
 * Los tipos viven en `map/types.ts`. Se reexportan desde aquí porque medio
 * repositorio los importa de `MapView` y mover el fichero no tiene por qué
 * mover también los imports de todo el mundo.
 */
export type { MapHandle, LayerVisibility, Props } from './map/types'
import type { FireMarker, PillMarker, Props, WebcamMarker } from './map/types'

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


export function MapView(props: Props) {
  const { dem, models, variable, stops, visible, probe } = props
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
  const starLayerRef = useRef<StarLayer | null>(null)
  const moonLayerRef = useRef<MoonLayer | null>(null)
  const sunPathLayerRef = useRef<SunPathLayer | null>(null)
  const rainLayerRef = useRef<RainLayer | null>(null)
  /** El relieve 3D, por lo mismo: estado de MapLibre que no es de React. */
  const terrainRef = useRef<Terrain3D | null>(null)
  const shadowRef = useRef<ShadowLayer | null>(null)
  const cloudShadowRef = useRef<CloudShadowLayer | null>(null)
  /** Pins de estación en juego, para resolver solapamientos en cada movimiento. */
  const pillsRef = useRef<PillMarker[]>([])
  /**
   * Las cámaras de incendio, que también compiten por el sitio.
   *
   * No son pastillas y no se colapsan a un punto —un triángulo colapsado no
   * dice nada—, pero tienen que entrar en el reparto igual que los aforos: se
   * dibujaban por encima de todo sin avisar a nadie, y un triángulo caído justo
   * sobre una pastilla se leía como parte de la cifra. Ver `declutterImpl`.
   */
  const firesRef = useRef<FireMarker[]>([])
  /**
   * Las webcams. No compiten por el sitio —ver el bloque que las crea— pero sí
   * tienen que esconderse cuando hay montaña delante: una cámara del Roque
   * dibujada sobre la ladera que la tapa se lee como si estuviera en la ladera.
   */
  const webcamsRef = useRef<WebcamMarker[]>([])
  const placeMarkersRef = useRef<maplibregl.Marker[]>([])
  const probeMarkerRef = useRef<maplibregl.Marker | null>(null)
  const meMarkerRef = useRef<maplibregl.Marker | null>(null)
  // Los callbacks cambian en cada render; se leen desde una ref para que los
  // manejadores del mapa no haya que recrearlos (y volver a añadir listeners).
  const handlers = useRef(props)
  handlers.current = props

  // Precarga y purga de las teselas de GRAFCAN. Todo lo que hace cuelga de que
  // el mapa esté quieto; ver `hooks/useTileCache.ts`.
  useTileCache(ready ? mapRef.current : null, props.basemap)

  useMapSetup(dem, setReady, {
    container: containerRef,
    map: mapRef,
    wind: windLayerRef,
    ocean: oceanLayerRef,
    vapor: vaporLayerRef,
    cloud: cloudLayerRef,
    sun: sunLayerRef,
    star: starLayerRef,
    moon: moonLayerRef,
    sunPath: sunPathLayerRef,
    rain: rainLayerRef,
    terrain: terrainRef,
    handlers,
  })


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

  // --- escena atmosférica: nubes, lluvia, estrellas y luna -----------------
  useSkyScene(ready, props, {
    cloud: cloudLayerRef,
    rain: rainLayerRef,
    ocean: oceanLayerRef,
    star: starLayerRef,
    moon: moonLayerRef,
    sun: sunLayerRef,
    sunPath: sunPathLayerRef,
    terrain: terrainRef,
  })

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

  const declutter = useDeclutter(ready, props, {
    map: mapRef,
    pills: pillsRef,
    fires: firesRef,
    webcams: webcamsRef,
    placeMarkers: placeMarkersRef,
  })

  useDomMarkers(ready, props, {
    declutter,
    map: mapRef,
    markers: markersRef,
    pills: pillsRef,
    fires: firesRef,
    webcams: webcamsRef,
    handlers,
  })

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
