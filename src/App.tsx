import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type LayerVisibility, type MapHandle } from './components/MapView'
import { PointPanel, type ProbePoint } from './components/PointPanel'
import { DetailPanel, type Selection } from './components/DetailPanel'
import { Sidebar } from './components/sidebar'
import { SourcesScreen } from './components/SourcesScreen'
import { MobileShell } from './components/mobile/MobileShell'
import { buildStatus } from './components/mobile/status'
import { useIsMobile } from './hooks/useIsMobile'
import { useGeolocation, type GeoFix } from './hooks/useGeolocation'
import { useIslandData, municipalityOf } from './hooks/useIslandData'
import { useWindField } from './hooks/useWindField'
import { useOcean } from './hooks/useOcean'
import { useGuagua } from './hooks/useGuagua'
import { usePlaces, NO_PLACES, type PlaceVisibility } from './hooks/usePlaces'
import { useOsmRoads } from './hooks/useOsmRoads'
import { useTdt } from './hooks/useTdt'
import { useCounters } from './hooks/useCounters'
import { useAgro } from './hooks/useAgro'
import { useTrailReports } from './hooks/useTrailReports'
import { summarizeDeck } from './lib/clouds'
import { elevationAt } from './lib/dem'
import { VARIABLES, isBundleVariable, type MapVariable } from './lib/variables'
import { buildCo2Field } from './lib/co2/field'
import { useCoverage } from './hooks/useCoverage'
import { useFireRisk } from './hooks/useFireRisk'
import { fireValueAt } from './lib/fire/field'
import type { DisplayVariable } from './lib/interpolate'
import type { GazetteerEntry } from './lib/api'
import { BASEMAPS, BASEMAP_ORDER, type BasemapId } from './lib/basemaps'
import {
  DEFAULT_EXAGGERATION,
  EXAGGERATIONS,
  maxPitchFor,
  type Exaggeration,
} from './lib/terrain'
import { autoQuality, OCEAN_QUALITIES, type OceanQuality } from './lib/ocean/quality'
import { usePersistentState } from './lib/settings/usePersistentState'
import { bool, flags, oneOf, shape } from './lib/settings/revive'
import { buildVaporField } from './lib/vapor/field'
import { breathAt } from './lib/vapor/breath'
import { useSky } from './hooks/useSky'
import { useNightSky } from './hooks/useNightSky'
import { usePlanets } from './hooks/usePlanets'
import { islandLcl } from './lib/sky/base'
import { moonState } from './lib/moon'
import { sunPosition } from './lib/sun'
import { sunCrossing, sunEvents, sunTrack, type TrackPoint } from './lib/sky/sun-path'
import { skyCeilingDeg } from './lib/sky/sun-screen'
import { oceanLight } from './lib/ocean/light'
import { measuredLight } from './lib/measured-light'
import { PARTICLE_SPEEDUP } from './lib/vapor/clock'
import { useBreathClock } from './hooks/useBreathClock'

/**
 * Dónde se evalúa la respiración de la isla. El centro, y uno solo: la brisa de
 * ladera invierte a la misma hora en toda La Palma —la manda el sol, no la
 * vertiente— y dar una fase por ladera fingiría un detalle que no hay.
 */
const ISLAND_BREATH_LON = -17.86
const ISLAND_BREATH_LAT = 28.66
import { warmNearbyLayers } from './lib/nearby'
import { t } from './i18n'

/**
 * El camino del sol cuando está apagado. Una constante y no un `[]` nuevo cada
 * vez: es la dependencia de un efecto del mapa, y un array recién hecho lo
 * dispararía en cada pintado.
 */
const EMPTY_TRACK: readonly TrackPoint[] = []

/**
 * Las capas de la PRIMERA visita.
 *
 * «Primera» en sentido literal desde que los ajustes se guardan: esto es lo que
 * ve quien llega sin nada elegido todavía, y también el relleno de cualquier
 * capa que lo guardado no reconozca. A partir de la segunda visita manda lo que
 * el usuario dejó encendido, no esta tabla.
 *
 * El primer vistazo enseña la isla con su atmósfera —el viento y el vapor
 * arrancan encendidos, como la vista 3D y el mar—; lo que se apaga al llegar
 * son las capas que añaden cifras o iconos a una isla que ya enseña su relieve
 * y su mar. Y sigue mandando la regla de siempre: a partir de la segunda
 * visita, lo que el usuario dejó encendido, no esta tabla.
 */
const INITIAL_LAYERS: LayerVisibility = {
  grid: true,
  stations: true,
  air: false,
  co2: true,
  sky: false,
  trails: false,
  guagua: false,
  roads: false,
  osmRoads: false,
  tdt: false,
  counters: false,
  fire: true,
  // Apagada la primera vez. No cuesta red —el catálogo es estático y las
  // imágenes solo se piden al abrir una ficha— pero son dieciocho iconos más
  // sobre una isla que ya llega con estaciones, CO₂ y cámaras de incendios
  // encendidas.
  webcams: false,
  // El viento y el vapor arrancan encendidos: son la atmósfera de la isla, no
  // capas de datos, y su animación forma parte de cómo se enseña. Quien los
  // apague conserva su elección en las visitas siguientes.
  wind: true,
  vapor: true,
}

/**
 * El catálogo de variables que un ajuste guardado puede nombrar, sacado del
 * propio catálogo y no escrito a mano: una variable retirada de `variables.ts`
 * deja de reconocerse el mismo día que se retira, y quien la tuviera elegida
 * vuelve a la temperatura en vez de arrastrar un identificador muerto hasta el
 * motor de dibujo.
 */
const MAP_VARIABLES = Object.keys(VARIABLES) as MapVariable[]

export default function App() {
  const data = useIslandData()

  /**
   * Las averiadas, como conjunto de ids.
   *
   * Se calcula una sola vez aquí en vez de en cada panel: la reconstrucción del
   * pasado las excluye por la misma razón por la que el modelo de ahora las
   * excluye, y conviene que las dos exclusiones salgan de la misma línea.
   */
  const faultyIds = useMemo(
    () =>
      new Set(
        [...data.health.diagnoses.values()].filter((d) => d.faulty).map((d) => d.entityId),
      ),
    [data.health.diagnoses],
  )
  // El viento se calcula siempre, esté la capa encendida o no: el panel enseña
  // cuántas estaciones lo miden aunque el mapa no lo dibuje, y el coste es una
  // petición al modelo cada refresco.
  const wind = useWindField(data.dem, data.stations, data.lastUpdate)
  const [visible, setVisible] = usePersistentState<LayerVisibility>(
    'layers',
    INITIAL_LAYERS,
    flags(),
  )
  // Al revés que el viento: la red de guaguas son 1,5 MB y no alimenta ningún
  // cálculo, así que no se pide hasta que alguien enciende la capa.
  const guagua = useGuagua(visible.guagua)
  // Los sitios se encienden uno a uno; la capa del mapa está siempre viva y lo
  // que cambia es qué puntos entran en ella.
  const [placesOn, setPlacesOn] = usePersistentState<PlaceVisibility>(
    'places',
    NO_PLACES,
    flags(),
  )
  const places = usePlaces(placesOn, visible.roads)
  // El viario de OSM es la capa más pesada de todas —5,2 MB— y por eso es la que
  // más motivos tiene para no pedirse hasta que alguien la encienda.
  const viario = useOsmRoads(visible.osmRoads)
  // Igual que las guaguas: tres peticiones al servicio del Cabildo que no se
  // hacen mientras el interruptor esté apagado.
  const counters = useCounters(visible.counters)
  const [variable, setVariable] = usePersistentState<MapVariable>(
    'variable',
    'temperature',
    oneOf(MAP_VARIABLES),
  )
  // El fondo de casa es el de la primera visita, y a propósito: es el único que
  // no depende de un servicio ajeno para que la isla aparezca en pantalla. Quien
  // elija otro se lo encuentra puesto la próxima vez, servicio ajeno incluido.
  const [basemap, setBasemap] = usePersistentState<BasemapId>(
    'basemap',
    'relieve',
    oneOf(BASEMAP_ORDER),
  )
  /**
   * La vista 3D. Encendida desde la primera visita: la isla se enseña con su
   * relieve y su mar, que es lo que hay que ver. Quien quiera comparar laderas
   * la apaga —en plano se comparan de un vistazo—, y apagarla es una elección
   * que también se conserva.
   *
   * No está en `LayerVisibility` porque no es una capa: no añade nada al mapa,
   * cambia la cámara. Meterla ahí haría que el contador de «capas activas» del
   * panel contara una cosa que no se dibuja.
   */
  const [terrain, setTerrain] = usePersistentState<{ on: boolean; exaggeration: Exaggeration }>(
    'terrain',
    { on: true, exaggeration: DEFAULT_EXAGGERATION },
    shape({ on: bool, exaggeration: oneOf(EXAGGERATIONS) }),
  )
  /**
   * El océano. Encendido desde la primera visita, como la vista 3D: el mar con
   * oleaje real forma parte de cómo se enseña la isla, y quien quiera un mapa
   * sobrio lo apaga —también eso se conserva, porque apagarlo fue una elección
   * y no un descuido.
   *
   * La calidad se decide sola mirando cuántos píxeles hay que pintar y cuántos
   * núcleos hay debajo, con la MISMA regla en cualquier dispositivo —un portátil
   * y un teléfono corren este mismo código y la decisión no puede depender de
   * cuál sea—, y se puede cambiar a mano. Ver `lib/ocean/quality.ts`.
   *
   * Y aquí hay una cesión consciente: `autoQuality()` solo corre la PRIMERA vez.
   * A partir de ahí manda lo guardado, porque el ajuste no distingue una calidad
   * medida de una elegida a mano y respetar la elección del usuario pesa más que
   * volver a medir. La factura la paga quien cambie de pantalla —el mismo
   * portátil enchufado a un monitor de 4K pinta cuatro veces más píxeles y
   * arrancaría con la calidad que se midió sin él—; se arregla en un toque desde
   * el panel, y no se arregla solo. Si algún día molesta, lo que hay que guardar
   * son dos campos, `quality` y «esta la elegí yo», no uno.
   */
  const [ocean, setOcean] = usePersistentState<{
    on: boolean
    seamarks: boolean
    depth: boolean
    quality: OceanQuality
  }>(
    'ocean',
    () => ({
      on: true,
      seamarks: false,
      depth: false,
      quality: autoQuality(
        window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1) ** 2,
        navigator.hardwareConcurrency ?? 4,
      ),
    }),
    shape({
      on: bool,
      seamarks: bool,
      depth: bool,
      quality: oneOf(OCEAN_QUALITIES),
    }),
  )
  /**
   * Y sus datos. Igual que las guaguas o el viario: no se pide ni un byte
   * mientras el interruptor esté apagado. El campo de viento que le entra es el
   * MISMO objeto que dibuja la capa de viento, así que el mar y las partículas
   * no pueden contradecirse.
   */
  const oceanData = useOcean(
    ocean.on,
    data.dem,
    wind.field,
    data.stations,
    data.air,
    data.lastUpdate,
  )
  const [probe, setProbe] = useState<ProbePoint | null>(null)
  /**
   * La máscara de cobertura TDT: 28 KB que se decodifican a píxeles.
   *
   * Se pide con la capa encendida O con una ficha de punto abierta. Lo segundo
   * es lo que hace que la respuesta esté ahí sin tener que descubrir antes un
   * interruptor: quien pincha un sitio pregunta por el sitio entero.
   */
  const tdt = useTdt(visible.tdt || probe !== null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [showSources, setShowSources] = useState(false)
  /**
   * La pantalla es estrecha, así que manda la hoja y no la barra lateral.
   *
   * Es lo ÚNICO que cambia entre las dos versiones: el mapa, el motor, las
   * fichas y las capas son exactamente los mismos objetos. Lo que cambia es
   * dónde se cuelgan.
   */
  const isMobile = useIsMobile()
  /** El panel de capas del móvil, que allí es una hoja y no una columna. */
  const [layersOpen, setLayersOpen] = useState(false)
  const mapHandle = useRef<MapHandle | null>(null)
  /**
   * El punto lo puso el arranque al preguntar la ubicación, no un dedo.
   *
   * Con esto la hoja se queda asomando: quien abre la app ve la isla entera y
   * una línea abajo con la temperatura de donde está. Un toque en el mapa sí
   * la sube a media pantalla, porque ahí sí se ha preguntado algo.
   */
  const [autoProbe, setAutoProbe] = useState(false)
  // Si el zoom da ya para ver las paradas. Lo dice el mapa al cruzar el umbral,
  // no en cada fotograma: es lo único que hace falta saber del zoom aquí.
  const [stopsZoomReached, setStopsZoomReached] = useState(false)
  /** Lo mismo para las pistas del viario, que aparecen más cerca todavía. */
  const [tracksZoomReached, setTracksZoomReached] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /**
   * Qué secciones accesorias ha abierto el usuario. Las que cuestan no se
   * calculan ni se descargan mientras estén plegadas: la ETo es una petición
   * más al modelo y recorrer 49 senderos cuesta una cuarta parte de lo que
   * cuesta la malla.
   *
   * El Roque ya NO está entre ellas. Se pedía solo al abrir la sección para no
   * martillear a un observatorio ajeno, pero desde que su termómetro entra en
   * el motor (ver `summit.ts`) esa lectura la necesita el mapa entero, así que
   * la trae `useIslandData` y aquí solo queda el estado de plegado.
   *
   * El plegado dura de una sesión a la siguiente, y con él dura su coste: quien
   * deje la agricultura desplegada paga esa petición de ETo en CADA arranque,
   * no solo en aquel en el que la abrió. Es lo que significa guardar el ajuste,
   * y es correcto —una sección abierta es una sección que se quiere leer—, pero
   * conviene tenerlo escrito aquí y no descubrirlo en el panel de red.
   */
  const [openSections, setOpenSections] = usePersistentState<{
    roque: boolean
    agro: boolean
    trails: boolean
  }>('sections', { roque: false, agro: false, trails: false }, flags())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Las capas de «cerca de aquí» se piden en cuanto el mapa está en pie, no al
  // arrancar: así el primer clic no espera, pero tampoco retrasan la pintura.
  useEffect(() => {
    if (!data.dem) return
    const id = setTimeout(warmNearbyLayers, 1500)
    return () => clearTimeout(id)
  }, [data.dem])

  /**
   * La variable higrotérmica en juego. Con el CO₂ elegido no hay ninguna, y en
   * su lugar va la temperatura: los pines de estación y la ficha de punto
   * siguen hablando del tiempo, que es lo que esas estaciones miden.
   */
  const bundleVariable: DisplayVariable = isBundleVariable(variable)
    ? variable
    : 'temperature'
  const stops = VARIABLES[bundleVariable].stops

  /**
   * El campo de CO₂ se construye UNA vez y lo comparten mapa y panel. Si cada
   * uno lo armara por su cuenta, el panel podría estar contando 187 sensores
   * mientras el mapa pinta otros tantos.
   */
  const co2Field = useMemo(() => buildCo2Field(data.co2), [data.co2])

  // El sondeo de cobertura son 105 KB de 2013 que no alimentan nada más: solo
  // se piden si alguien elige esa variable.
  const coverage = useCoverage(variable === 'coverage')

  /**
   * Qué campo enmascarado toca pintar. Uno como mucho: son variables, y solo
   * hay una elegida. Que el mapa reciba «el campo» y no «el campo de CO₂ más
   * el de cobertura más el siguiente» es lo que evita que añadir el tercero
   * signifique tocar `MapView` otra vez.
   */
  const maskedField =
    variable === 'co2'
      ? (co2Field?.field ?? null)
      : variable === 'coverage'
        ? (coverage.field?.field ?? null)
        : null

  /**
   * La capa experimental de incendios. Se pide solo cuando está elegida: son
   * 134 KB de cartografía rasterizada y modelo, más una llamada al archivo de
   * lluvia, y la mayoría de las visitas vienen a mirar la temperatura.
   */
  const fire = useFireRisk(variable === 'fire')

  /**
   * El campo continuo que no sale del motor. Hoy solo el de incendios; llega
   * a `MapView` por la misma puerta que el enmascarado, para que añadir el
   * siguiente no signifique volver a tocar el mapa.
   */
  const fireInput = useMemo(
    () =>
      fire.statics && data.dem
        ? {
            statics: fire.statics,
            dem: data.dem,
            models: data.models,
            wind: wind.field,
            drought: fire.drought,
          }
        : null,
    [fire.statics, fire.drought, data.dem, data.models, wind.field],
  )

  const gridField = useMemo(
    () =>
      variable === 'fire' && fireInput
        ? { valueAt: fireValueAt(fireInput), stops: VARIABLES.fire.stops }
        : null,
    [variable, fireInput],
  )

  /**
   * El mar de nubes NO cuesta una petición: sale de los perfiles verticales
   * que el motor ya descarga para anclar las cotas altas. Lo único que hacía
   * falta era pedirle a la misma llamada la nubosidad baja, que es lo que
   * separa una inversión con manta de una inversión seca.
   */
  const deck = useMemo(
    () => summarizeDeck(data.anchors.map((a) => a.profile)),
    [data.anchors],
  )

  // La cumbre ya no se pide aquí: desde que entra en el motor la trae
  // `useIslandData`, y el panel enseña exactamente la misma lectura que el mapa
  // está usando. Dos peticiones al TNG podrían contestar dos horas distintas.
  /**
   * De dónde sale vapor y hasta dónde sube. Se construye AQUÍ y no dentro de la
   * capa por lo mismo que el campo de CO₂: el panel enseña el techo de
   * condensación y la fracción de isla activa, y el mapa las dibuja. Con dos
   * construcciones separadas podrían acabar contando cosas distintas.
   *
   * Depende del mar de nubes, así que va después de `deck`.
   */
  const vaporField = useMemo(
    () => (visible.vapor ? buildVaporField(data.dem, data.models, deck) : null),
    [visible.vapor, data.dem, data.models, deck],
  )
  const breathClock = useBreathClock(visible.vapor)
  const breath = useMemo(
    () => breathAt(breathClock.at, ISLAND_BREATH_LON, ISLAND_BREATH_LAT),
    [breathClock.at],
  )

  /**
   * La escena atmosférica en 3D. Encendida desde la primera visita: sin ella
   * la vista 3D se queda sin cielo con nubes que echen sombra, que es la mitad
   * de la escena.
   *
   * Encenderla cuesta una petición de 70 puntos con once variables cada uno,
   * que ahora paga todo el que llega. Quien la apague deja de pagarla desde
   * ese momento, que es lo que pidió al apagarla.
   */
  const [sky3dOn, setSky3dOn] = usePersistentState('sky3d', true, bool)
  /**
   * El nivel de condensación medio de la isla, para cuando no hay manta
   * diagnosticada. Se calcula solo con la escena encendida —recorre 576 puntos
   * del motor— y solo hace falta si el sondeo no ha encontrado inversión.
   */
  const lclM = useMemo(
    () => (sky3dOn && !deck?.present ? islandLcl(data.dem, data.models) : null),
    [sky3dOn, deck, data.dem, data.models],
  )
  const sky = useSky(sky3dOn, deck, lclM, data.lastUpdate)
  /**
   * Dónde está el sol AHORA sobre el centro de la isla: es lo que ilumina las
   * nubes. Se recalcula con `now`, que ya late una vez por minuto para el resto
   * de la interfaz; el sol se mueve 0,25° por minuto, así que ese ritmo sobra y
   * no hace falta un reloj propio.
   */
  const sun = useMemo(
    () => sunPosition(now, ISLAND_BREATH_LON, ISLAND_BREATH_LAT),
    [now],
  )

  /**
   * La luz solar sobre el relieve. Experimental, apagada la primera vez: ver la
   * cabecera de `SunLight.tsx` —se ve mejor y se lee peor.
   */
  const [sunLightOn, setSunLightOn] = usePersistentState('sunLight', false, bool)
  /**
   * Las sombras arrojadas, dentro de la misma función y con su propio
   * interruptor. Van aparte de `sunLightOn` porque no dependen de él: el
   * sombreado de MapLibre desaparece bajo la ortofoto y las sombras no, así que
   * sobre el fondo de satélite son lo único que ilumina la isla.
   */
  const [sunShadowsOn, setSunShadowsOn] = usePersistentState('sunShadows', false, bool)
  /**
   * El disco del sol en el cielo. Tercera casilla de la misma función, y la
   * única de las tres que DIBUJA algo en vez de iluminar: por eso va aparte.
   * Apagada al llegar, como las otras dos.
   */
  const [sunDiscOn, setSunDiscOn] = usePersistentState('sunDisc', false, bool)
  /**
   * El camino que recorre el sol hoy, del orto al ocaso. Cuarta casilla, y la
   * que contesta lo que el disco no puede: el disco solo entra en cuadro con el
   * sol por debajo de 3,4°, así que a mediodía se enciende y no pasa nada. El
   * camino baja hasta el horizonte por los dos extremos y se ve siempre.
   */
  const [sunPathOn, setSunPathOn] = usePersistentState('sunPath', false, bool)
  /**
   * El orto, el ocaso y el mediodía de hoy. Se calculan siempre —son unas
   * decenas de microsegundos una vez por minuto— porque los lee el panel, que
   * es donde salen escritos con hora y rumbo.
   */
  const sunDay = useMemo(() => sunEvents(now, ISLAND_BREATH_LON, ISLAND_BREATH_LAT), [now])
  /**
   * Y el camino entero, solo con la casilla encendida: son 43 posiciones del
   * sol, baratas pero no gratis, y quien no lo dibuje no las paga.
   */
  const sunPathTrack = useMemo<readonly TrackPoint[]>(
    () => (sunPathOn ? sunTrack(now, ISLAND_BREATH_LON, ISLAND_BREATH_LAT) : EMPTY_TRACK),
    [sunPathOn, now],
  )
  /**
   * El cielo estrellado. Tres casillas: la escena, las figuras de las
   * constelaciones y el centelleo. Apagadas al llegar porque el catálogo son
   * 133 KB que nadie debería pagar sin pedirlos, y porque de día no se ve nada.
   */
  const [nightSkyOn, setNightSkyOn] = usePersistentState('nightSky', false, bool)
  const [nightFiguresOn, setNightFiguresOn] = usePersistentState('nightFigures', true, bool)
  const [nightTwinkleOn, setNightTwinkleOn] = usePersistentState('nightTwinkle', true, bool)
  /**
   * El disco de la luna. Va con la escena nocturna y no con la luz solar
   * —donde está el disco del sol— porque es lo que se busca cuando se enciende
   * un cielo: lo primero que mira nadie de noche es si hay luna.
   *
   * ENCENDIDA DE FÁBRICA, al revés que las otras dos casillas. No cuesta ni una
   * descarga —la luna es aritmética— y un cielo nocturno sin luna las noches en
   * que la hay sería el cielo de otro sitio.
   */
  const [nightMoonOn, setNightMoonOn] = usePersistentState('nightMoon', true, bool)
  /**
   * Los planetas. Apagados de fábrica, al revés que la luna: son 36 KB de tabla
   * de efemérides, y aunque sean poco al lado de los 133 del catálogo, quien
   * enciende un cielo estrellado está pidiendo estrellas.
   */
  const [nightPlanetsOn, setNightPlanetsOn] = usePersistentState('nightPlanets', false, bool)
  /**
   * El observador: el mismo punto de referencia de la isla que usa el resto de
   * la aplicación, con su cota sacada del DEM y —cuando el TNG contesta— con la
   * presión y la temperatura MEDIDAS en la cumbre.
   *
   * Que la presión sea la medida y no la estándar no es un detalle: la
   * refracción es proporcional a la densidad del aire, y entre los 1013 hPa de
   * manual y los 757 de allí arriba hay 8 minutos de arco en el horizonte.
   */
  const nightObserver = useMemo(
    () => ({
      lon: ISLAND_BREATH_LON,
      lat: ISLAND_BREATH_LAT,
      // Sin DEM todavía, el nivel del mar. Es el caso conservador: da la
      // refracción y la extinción máximas, o sea el cielo más pobre, que es
      // preferible a prometer el de la cumbre y luego quitarlo.
      elevationM: (data.dem
        ? elevationAt(data.dem, ISLAND_BREATH_LON, ISLAND_BREATH_LAT)
        : null) ?? 0,
      pressureHpa: data.roque?.fields.pressure?.outdated === false
        ? (data.roque.fields.pressure?.value ?? null)
        : null,
      temperatureC: data.roque?.fields.temperature?.outdated === false
        ? (data.roque.fields.temperature?.value ?? null)
        : null,
    }),
    [data.dem, data.roque],
  )
  /**
   * La luna de la escena nocturna la calcula el propio `useNightSky`, con el
   * mismo observador que decide el horizonte y la extinción. Antes se pedía
   * aquí, con las coordenadas de referencia de la isla y sin altitud: sin
   * paralaje, o sea hasta 23' de error, casi un diámetro lunar. Servía para
   * contar estrellas y no habría servido para dibujar el disco.
   */
  const nightSky = useNightSky(
    nightSkyOn,
    now,
    nightObserver,
    sun,
    nightMoonOn,
    nightTwinkleOn,
    nightFiguresOn,
  )
  /**
   * Los planetas cuelgan de la escena nocturna: usan su magnitud límite, su
   * extinción y su horizonte, que son las tres cifras que deciden qué se ve.
   * Calcularlas otra vez aquí habría sido tener dos cielos.
   */
  const planets = usePlanets(nightSkyOn && nightPlanetsOn, now, nightObserver, {
    limitMag: nightSky.limitMag,
    extinctionK: nightSky.extinctionK,
    floorDeg: nightSky.floorDeg,
    density: nightSky.scene?.density ?? 1,
  })
  /**
   * Hasta qué altura del cielo llega la pantalla con este fondo, y a qué hora
   * baja el sol de ahí.
   *
   * DEPENDE DEL FONDO porque depende del tope de inclinación, y ese es 75° con el
   * relieve de casa y 65° con los de GRAFCAN —una limitación de licencia, ver
   * `terrain.ts`—. Con 65° el techo sale NEGATIVO: el horizonte no entra en
   * pantalla y no hay cielo donde dibujar. El panel lo dice; antes las dos
   * casillas se quedaban mudas sin explicar por qué.
   */
  const sunCeilingDeg = useMemo(() => skyCeilingDeg(maxPitchFor(basemap)), [basemap])
  /**
   * Dejar la vista en condiciones de ver el cielo, que son cuatro cosas a la vez.
   *
   * POR QUÉ NO BASTA CON DECIRLO. El panel ya explicaba que sobre la ortofoto la
   * cámara solo se inclina 65° y el horizonte no entra en pantalla, y el aviso
   * estaba escrito, en su sitio y en presente. No sirvió: lo que se ve es una
   * casilla marcada y un cielo vacío, y nadie lee un párrafo para descubrir que
   * lo que ha encendido no puede funcionar donde está. Es la misma regla que ya
   * sigue el mar —encenderlo lleva al satélite, porque sobre la carta
   * topográfica no se dibujaría—: un interruptor que no hace nada es peor que
   * uno que hace de más.
   *
   * LAS CUATRO: la vista 3D, porque en plano no hay cielo; el fondo de relieve
   * si el que hay no deja inclinar lo bastante; la luz real, que es de donde el
   * sol saca su color —sin ella el disco no se dibuja en absoluto—; y la cámara
   * hasta el tope, que lo hace el mapa porque es quien sabe a cuánto está.
   *
   * NINGUNA ES IRREVERSIBLE: las tres primeras son interruptores que siguen
   * ahí, y quien quiera la ortofoto o la luz de la convención vuelve a
   * ponerlas. Lo que no se puede es empezar sin verlo.
   */
  /**
   * Hacia dónde hay que mirar para ver algo en el cielo.
   *
   * NO ES «hacia el sol», y esa fue la primera respuesta equivocada: el sol
   * pasa la mayor parte del día por encima del borde de la pantalla, así que
   * apuntar a él deja en cuadro un trozo de cielo donde no hay nada dibujado. Lo
   * que se ve del camino son sus dos extremos, los que bajan al horizonte, y
   * están en el rumbo del orto y del ocaso —a las cuatro de la tarde, mirando al
   * sol en el OSO, el ocaso del ONO se quedaba 2° fuera del cuadro por la
   * derecha: medido con el campo de visión de 59,8° a lo ancho—.
   *
   * Así que: al sol si está dentro de la ventana en la que se le puede ver, y si
   * no al extremo del arco que toca —el orto por la mañana, el ocaso por la
   * tarde, contado desde el mediodía solar—.
   */
  const rumboDelCielo = useMemo(() => {
    if (sun.elevationDeg > 0 && sun.elevationDeg <= sunCeilingDeg) return sun.azimuthDeg
    const extremo = now < sunDay.transitMs ? sunDay.sunrise : sunDay.sunset
    return extremo?.azimuthDeg ?? sun.azimuthDeg
  }, [sun, sunCeilingDeg, now, sunDay])

  const [skyNudge, setSkyNudge] = useState(0)
  const prepararElCielo = useCallback(() => {
    setTerrain((s) => ({ ...s, on: true }))
    if (skyCeilingDeg(maxPitchFor(basemap)) <= 0) setBasemap('relieve')
    setSunLightOn(true)
    setSkyNudge((n) => n + 1)
  }, [basemap, setBasemap, setSunLightOn, setTerrain])
  const sunCeilingMs = useMemo(
    () =>
      sunCeilingDeg > 0
        ? sunCrossing(now, ISLAND_BREATH_LON, ISLAND_BREATH_LAT, sunCeilingDeg, 1)
        : null,
    [now, sunCeilingDeg],
  )
  /**
   * La luna, solo cuando hace falta: de día no ilumina nada que se note, y con
   * el interruptor apagado no ilumina nada en absoluto. Las efemérides de Meeus
   * no son caras, pero calcular lo que nadie va a mirar tampoco es gratis.
   */
  const moon = useMemo(
    () => (sunLightOn && sun.elevationDeg <= 0 ? moonState(now, ISLAND_BREATH_LON, ISLAND_BREATH_LAT) : null),
    [sunLightOn, sun.elevationDeg, now],
  )
  /**
   * La luz de este instante para el CIELO de la vista 3D.
   *
   * Es la misma función que ilumina el agua, con las mismas dos medidas —
   * radiación y PM10— y por eso se calcula aquí y no dentro del mapa: el mar
   * refleja el cielo, así que si cada uno se lo calculara por su cuenta se
   * verían dos cielos distintos a los dos lados del horizonte.
   *
   * Las medidas se sacan de `measured-light.ts` y NO de `oceanData`, que llega
   * vacío cuando la capa del mar está apagada: si dependiera de ella, el mismo
   * mediodía de calima saldría lechoso con el océano encendido y limpio con el
   * océano apagado.
   *
   * La usan cuatro funciones y por eso se calcula con cualquiera de ellas
   * encendida: la cúpula del cielo, la escena atmosférica —de donde saca el
   * color al que se desvanece la distancia y la luz que hay de noche—, el disco
   * del sol y su carrera. Con las cuatro apagadas no se calcula: `oceanLight`
   * recorre las estaciones para sacar dos medianas, y quien no encienda nada de
   * esto no lo paga.
   *
   * EL DISCO Y LA CARRERA ENTRARON AQUÍ ARREGLANDO UN FALLO, no por simetría.
   * `SunLayer.render()` se va sin dibujar cuando no hay luz —la necesita para
   * saber de qué color es el sol a esta altura— así que con la casilla del disco
   * encendida a solas, esto valía `null` y el sol no se dibujaba NUNCA, ni al
   * atardecer. La casilla estaba puesta y no hacía nada, y no había manera de
   * saberlo desde fuera. De qué color es el sol no depende de si el relieve se
   * ilumina con él: son dos preguntas distintas y ahora se calculan aparte.
   */
  const domeLight = useMemo(
    () =>
      sunLightOn || sky3dOn || sunDiscOn || sunPathOn
        ? oceanLight(
            now,
            ISLAND_BREATH_LON,
            ISLAND_BREATH_LAT,
            measuredLight(data.stations, data.air),
          )
        : null,
    [sunLightOn, sky3dOn, sunDiscOn, sunPathOn, now, data.stations, data.air],
  )

  const roque = data.roque
  const agro = useAgro(data.dem, openSections.agro)
  const trailReports = useTrailReports(
    data.trails,
    data.dem,
    data.models,
    wind.field,
    data.municipalities,
    deck,
    openSections.trails,
  )

  /**
   * Los avisos, indexados por sendero, para que el mapa pinte lo mismo que
   * dice la lista. Se calcula aquí y no en `MapView` porque el panel y el mapa
   * tienen que estar mirando exactamente el mismo objeto.
   */
  const trailSeverity = useMemo(() => {
    const out: Record<number, 'warning' | 'notice'> = {}
    for (const r of trailReports) if (r.worst) out[r.profile.trail.id] = r.worst
    return out
  }, [trailReports])

  const pick = useCallback(
    (lon: number, lat: number, label?: string) => {
      setSelection(null)
      setAutoProbe(false)
      setProbe({
        lon,
        lat,
        elevation: data.dem ? elevationAt(data.dem, lon, lat) : null,
        municipality: municipalityOf(data.municipalities, lon, lat),
        label,
      })
    },
    [data.dem, data.municipalities],
  )

  const onSearch = useCallback(
    (entry: GazetteerEntry) => pick(entry.lon, entry.lat, entry.name),
    [pick],
  )

  const toggle = useCallback((key: keyof LayerVisibility) => {
    setVisible((v) => ({ ...v, [key]: !v[key] }))
  }, [])

  /**
   * Elegir variable ENCIENDE la malla.
   *
   * Los chips de variable no pintan nada por su cuenta: lo que colorea la isla
   * con la variable elegida es la malla interpolada, y con la malla apagada
   * pulsar «CO₂ del suelo» o «Índice de incendio» no cambiaba un solo píxel del
   * mapa. Ni siquiera los pines: fuera del paquete higrotérmico siguen
   * enseñando temperatura a propósito (ver `pinVariable` en `MapView`), así que
   * para tres de las siete variables el chip quedaba completamente muerto.
   *
   * Es la misma regla que ya sigue el interruptor del mar, que se lleva el
   * fondo al satélite porque sobre la carta topográfica no se dibujaría: un
   * interruptor que no hace nada es peor que uno que hace de más. Y apagar la
   * malla sigue estando a una casilla, justo debajo de los chips.
   */
  const chooseVariable = useCallback((v: MapVariable) => {
    setVariable(v)
    setVisible((s) => (s.grid ? s : { ...s, grid: true }))
  }, [])

  /**
   * Qué se hace con la ubicación cuando el navegador la da.
   *
   * Del arranque llega `auto: true` y entonces NO se vuela: la vista de llegada
   * es la isla entera, y acercarse antes de que a nadie le haya dado tiempo a
   * mirarla es quitarle a la app lo primero que enseña. Con el botón sí, porque
   * ahí sí se ha pedido ir hasta allí.
   */
  const onFix = useCallback(
    ({ lon, lat, auto }: GeoFix) => {
      pick(lon, lat, t.mobile.locate)
      if (auto) setAutoProbe(true)
      else mapHandle.current?.flyTo(lon, lat)
    },
    [pick],
  )

  // Solo en el móvil, y solo cuando hay DEM y modelo: sin altitud no hay
  // corrección altimétrica y sin modelo no hay nada que estimar, así que
  // preguntar antes dejaría una aguja sobre una ficha vacía.
  const geo = useGeolocation(isMobile, !!data.dem && !!data.models.temperature, onFix)


  /**
   * La ficha de lo que esté elegido, sea un punto del mapa o un pin.
   *
   * Es la MISMA en las dos pantallas: en el escritorio flota a la derecha y en
   * el móvil va dentro de la hoja deslizante. No hay una segunda versión de
   * ninguna ficha, así que lo que aprenda una lo sabe la otra el mismo día.
   */
  const detail = probe ? (
    <PointPanel
      point={probe}
      models={data.models}
      stations={data.stations}
      variable={bundleVariable}
      stops={stops}
      dem={data.dem}
      faulty={faultyIds}
      eto={agro.eto}
      tdt={tdt.mask}
      fire={fireInput}
      now={now}
      onClose={() => setProbe(null)}
    />
  ) : selection ? (
    <DetailPanel
      selection={selection}
      model={data.models.temperature}
      health={data.health.diagnoses}
      now={now}
      firePolledAt={data.firePolledAt}
      co2Down={data.co2Down}
      guagua={guagua.network}
      onClose={() => setSelection(null)}
      onWeather={(lon, lat, label) => pick(lon, lat, label)}
      onRoute={(routeId) => setSelection({ kind: 'busRoute', value: { routeId } })}
    />
  ) : null

  // El DEM es bloqueante: sin altitudes no hay corrección altimétrica, y sin
  // ella la estimación no vale nada. Antes de enseñar una interpolación plana,
  // la app dice que no puede calcular.
  if (data.demError) {
    return (
      <main className="boot boot-error">
        <h1>{t.app.name}</h1>
        <p className="warn">{t.errors.demFailed}</p>
        <p className="dim">{t.errors.demFailedDetail}</p>
        <p className="mono dim small">{data.demError}</p>
      </main>
    )
  }

  if (!data.dem) {
    const p = data.demProgress
    return (
      <main className="boot">
        <h1>{t.app.name}</h1>
        <p className="dim">{t.app.tagline}</p>
        <p className="mono dim">
          {p ? t.loading.tiles(p.done, p.total) : `${t.loading.dem}…`}
        </p>
        <div className="boot-bar">
          <span style={{ width: p ? `${(p.done / p.total) * 100}%` : '4%' }} />
        </div>
      </main>
    )
  }

  return (
    <main className={isMobile ? 'app app-mobile' : 'app'}>
      <MapView
        dem={data.dem}
        models={data.models}
        variable={variable}
        stops={stops}
        maskedField={maskedField}
        gridField={gridField}
        stations={data.stations}
        summit={data.summit}
        health={data.health.diagnoses}
        air={data.air}
        sky={data.sky}
        fire={data.fire}
        co2={data.co2}
        gazetteer={data.gazetteer}
        trails={data.trails}
        trailSeverity={trailSeverity}
        trailPois={data.trailPois}
        guaguaLines={guagua.lines}
        guaguaStops={guagua.stops}
        // El resaltado no es un estado aparte: es la ficha de línea abierta.
        // Así no puede quedarse una línea encendida en el mapa sin nada que
        // explique por qué.
        guaguaRoute={selection?.kind === 'busRoute' ? selection.value.routeId : null}
        places={places.places}
        roads={places.roads}
        osmRoads={viario.roads}
        canals={places.canals}
        canalsVisible={placesOn.water}
        counters={counters.sites}
        wind={wind.field}
        vapor={vaporField}
        sky3d={{ on: sky3dOn, clouds: sky.clouds, sun }}
        nightSky={{
          on: nightSkyOn,
          scene: nightSky.scene,
          data: nightSky.data,
          moon: nightSky.moonScene,
          planets: nightPlanetsOn ? planets.scene : null,
          planetTable: planets.table,
        }}
        sunLight={{
          on: sunLightOn,
          shadows: sunShadowsOn,
          sun,
          moon: moon ? { elevationDeg: moon.elevationDeg, azimuthDeg: moon.azimuthDeg } : null,
          moonPhase: moon?.illumination ?? 0,
          dome: domeLight,
          disc: sunDiscOn,
          path: sunPathOn,
          track: sunPathTrack,
          nudge: skyNudge,
          lookAt: rumboDelCielo,
        }}
        vaporClock={{
          at: breathClock.at,
          timeScale: breathClock.playing ? PARTICLE_SPEEDUP : 1,
        }}
        terrain={terrain}
        ocean={ocean}
        oceanData={oceanData}
        basemap={basemap}
        visible={visible}
        probe={probe}
        me={geo.me}
        handleRef={mapHandle}
        onPick={(lon, lat) => pick(lon, lat)}
        onStation={(s) => {
          setProbe(null)
          setSelection({ kind: 'station', value: s })
        }}
        onAir={(a) => {
          setProbe(null)
          setSelection({ kind: 'air', value: a })
        }}
        onCo2={(c) => {
          setProbe(null)
          setSelection({ kind: 'co2', value: c })
        }}
        onFire={(f) => {
          setProbe(null)
          setSelection({ kind: 'fire', value: f })
        }}
        onSky={(s) => {
          setProbe(null)
          setSelection({ kind: 'sky', value: s })
        }}
        onBusStop={(stop) => {
          setProbe(null)
          setSelection({
            kind: 'busStop',
            value: {
              ...stop,
              elevation: data.dem ? elevationAt(data.dem, stop.lon, stop.lat) : null,
              municipality: municipalityOf(data.municipalities, stop.lon, stop.lat),
            },
          })
        }}
        onBusRoute={(routeId) => {
          setProbe(null)
          setSelection({ kind: 'busRoute', value: { routeId } })
        }}
        onPlace={(place) => {
          setProbe(null)
          setSelection({
            kind: 'place',
            value: {
              ...place,
              elevation: data.dem ? elevationAt(data.dem, place.lon, place.lat) : null,
              municipality: municipalityOf(data.municipalities, place.lon, place.lat),
            },
          })
        }}
        onRoad={(road, lon, lat) => {
          setProbe(null)
          setSelection({ kind: 'road', value: { ...road, lon, lat } })
        }}
        onStopsZoom={setStopsZoomReached}
        onTracksZoom={setTracksZoomReached}
        onCounter={(site) => {
          setProbe(null)
          setSelection({
            kind: 'counter',
            value: {
              ...site,
              elevation: data.dem ? elevationAt(data.dem, site.lon, site.lat) : null,
              municipality: municipalityOf(data.municipalities, site.lon, site.lat),
              // El día se acompaña desde donde se pidió: la ficha no vuelve a
              // preguntar qué día es, para no discrepar con la suma del pin.
              today: counters.today ?? '',
            },
          })
        }}
        onWebcam={(site) => {
          setProbe(null)
          // Se pasa el sitio del catálogo tal cual: aquí no hay nada que la app
          // sepa y la fuente no —ni altitud ni municipio, que el catálogo ya
          // trae—, así que envolverlo solo añadiría un tipo intermedio.
          setSelection({ kind: 'webcam', value: site })
        }}
        onPoi={(poi) => {
          setProbe(null)
          // La altitud y el municipio no vienen en la capa de puntos: los pone
          // la app, con el mismo modelo de elevación que usa la interpolación.
          setSelection({
            kind: 'poi',
            value: {
              ...poi,
              elevation: data.dem ? elevationAt(data.dem, poi.lon, poi.lat) : null,
              municipality: municipalityOf(data.municipalities, poi.lon, poi.lat),
            },
          })
        }}
      />

      <Sidebar
        variable={variable}
        onVariable={chooseVariable}
        co2Field={co2Field}
        coverage={coverage}
        fire={fire}
        basemap={basemap}
        onBasemap={setBasemap}
        terrain={terrain}
        onTerrain={() => setTerrain((s) => ({ ...s, on: !s.on }))}
        onExaggeration={(exaggeration) => setTerrain((s) => ({ ...s, exaggeration }))}
        ocean={ocean}
        oceanData={oceanData}
        onOcean={() => {
          // Encender el mar sobre la carta topográfica no haría nada —ahí no se
          // dibuja, ver el campo `sea` de `basemaps.ts`—, así que el propio
          // interruptor lleva al satélite, que es donde mejor se ve. Un
          // interruptor que no hace nada es peor que uno que hace de más.
          if (!ocean.on && BASEMAPS[basemap].sea === false) setBasemap('satelite')
          setOcean((s) => ({ ...s, on: !s.on }))
        }}
        onOceanSeamarks={() => setOcean((s) => ({ ...s, seamarks: !s.seamarks }))}
        onOceanDepth={() => setOcean((s) => ({ ...s, depth: !s.depth }))}
        onOceanQuality={(quality) => setOcean((s) => ({ ...s, quality }))}
        visible={visible}
        onToggle={toggle}
        places={placesOn}
        onTogglePlace={(kind) => setPlacesOn((p) => ({ ...p, [kind]: !p[kind] }))}
        models={data.models}
        census={data.census}
        health={data.health}
        stations={data.stations}
        validation={data.validation}
        gazetteer={data.gazetteer}
        onSearch={onSearch}
        lastUpdate={data.lastUpdate}
        wind={wind}
        counters={counters}
        guagua={{ loading: guagua.loading, stopsZoomReached }}
        viario={{ loading: viario.loading, failed: viario.failed, tracksZoomReached }}
        tdt={{ loading: tdt.loading, failed: tdt.failed }}
        deck={deck}
        sky={sky}
        sunLight={{
          on: sunLightOn,
          shadows: sunShadowsOn,
          sun,
          moon: moon ? { elevationDeg: moon.elevationDeg, azimuthDeg: moon.azimuthDeg } : null,
          moonPhase: moon?.illumination ?? 0,
          disc: sunDiscOn,
          path: sunPathOn,
          day: sunDay,
          ceilingDeg: sunCeilingDeg,
          ceilingMs: sunCeilingMs,
        }}
        onSunLight={() => setSunLightOn((v) => !v)}
        onSunShadows={() => setSunShadowsOn((v) => !v)}
        /*
          Las dos que dibujan en el cielo encienden la vista 3D, por la misma
          regla que la escena atmosférica y que el mar: en plano no hay cielo
          donde dibujarlas, y un interruptor que no hace nada es peor que uno que
          hace de más. La cámara sube además hasta donde el horizonte entra en
          pantalla, y eso lo hace el mapa —ver `Terrain3D.skyward()`—, que es
          quien sabe a qué inclinación está.

          Apagarlas no devuelve la vista al plano, igual que con la escena: para
          entonces quien mira ya ha visto la isla en relieve y puede querer
          quedarse ahí.
        */
        onSunDisc={() => {
          if (!sunDiscOn) prepararElCielo()
          setSunDiscOn((v) => !v)
        }}
        onSunPath={() => {
          if (!sunPathOn) prepararElCielo()
          setSunPathOn((v) => !v)
        }}
        onPrepareSky={prepararElCielo}
        sky3dOn={sky3dOn}
        /*
          Encenderla inclina la cámara, y es la misma regla que ya sigue el
          interruptor del mar —que se lleva el fondo al satélite porque sobre la
          carta topográfica no se dibujaría—: un interruptor que no hace nada es
          peor que uno que hace de más.

          Aquí la razón es más fuerte todavía. En plano, una nube a 1200 m y el
          terreno que tiene debajo caen en el mismo píxel: se ve una mancha
          blanca sobre el mapa y se pierde justo lo que distingue a esta capa de
          una textura —que la nube está A UNA ALTURA, que la Cumbre la corta y
          que las cimas de más de 1600 m asoman por encima—. Sin inclinar la
          cámara, la mitad de la función no se ve.

          Apagarla NO devuelve la vista al plano: para entonces quien mira ya ha
          visto la isla en relieve y puede querer quedarse ahí. Deshacer un
          cambio que quizá le guste es tan molesto como no hacerlo.
        */
        onSky3d={() => {
          if (!sky3dOn) setTerrain((s) => ({ ...s, on: true }))
          setSky3dOn((v) => !v)
        }}
        nightSky={nightSky}
        nightSkyOn={nightSkyOn}
        nightFiguresOn={nightFiguresOn}
        nightTwinkleOn={nightTwinkleOn}
        nightMoonOn={nightMoonOn}
        nightPlanetsOn={nightPlanetsOn}
        planets={planets}
        /*
          Igual que la escena de nubes: encender el cielo sin inclinar la cámara
          es encender algo que no se puede ver. Y aquí además hace falta el
          fondo de casa, porque con los de GRAFCAN el tope de inclinación se
          queda en 65° y el horizonte no llega a entrar en pantalla.
        */
        onNightSky={() => {
          if (!nightSkyOn) prepararElCielo()
          setNightSkyOn((v) => !v)
        }}
        onNightFigures={() => setNightFiguresOn((v) => !v)}
        onNightTwinkle={() => setNightTwinkleOn((v) => !v)}
        onNightMoon={() => setNightMoonOn((v) => !v)}
        onNightPlanets={() => setNightPlanetsOn((v) => !v)}
        observerElevationM={nightObserver.elevationM}
        vapor={{
          field: vaporField,
          breath,
          playing: breathClock.playing,
          onPlay: breathClock.toggle,
          clock: breathClock.at,
          progress: breathClock.progress,
        }}
        roque={roque}
        summitLayer={data.summitLayer}
        agro={agro}
        trailReports={trailReports}
        // El punto elegido llega al panel para que el mar de nubes pueda decir
        // de qué lado cae y la agricultura, cuánta agua pide justo ahí.
        here={
          probe && probe.elevation !== null
            ? {
                lon: probe.lon,
                lat: probe.lat,
                elevationM: probe.elevation,
                label: probe.label ?? probe.municipality,
              }
            : null
        }
        onSectionToggle={(key, open) =>
          setOpenSections((prev) =>
            prev[key] === open ? prev : { ...prev, [key]: open },
          )
        }
        now={now}
        dem={data.dem}
        onSources={() => setShowSources(true)}
        // En el móvil la barra es una hoja que tapa el mapa y la abre un botón
        // redondo, así que quien manda es esta pantalla. En el escritorio no se
        // pasa nada y el panel sigue abriéndose solo.
        open={isMobile ? layersOpen : undefined}
        onOpenChange={isMobile ? setLayersOpen : undefined}
      />

      {data.upstreamError && (
        <div className="banner" role="status">
          <strong>{t.errors.upstreamDown}.</strong> {t.errors.upstreamDownDetail}
          <button className="link-btn" onClick={data.refresh}>
            {t.errors.retry}
          </button>
        </div>
      )}

      {data.fire.some((f) => f.hasAlert) && visible.fire && (
        <div className="banner banner-alert" role="alert">
          <strong>{t.fire.alert}:</strong>{' '}
          {data.fire.filter((f) => f.hasAlert).map((f) => f.name).join(', ')}
        </div>
      )}

      {isMobile ? (
        <MobileShell
          status={buildStatus({
            models: data.models,
            census: data.census,
            loading: data.loading,
            upstreamError: data.upstreamError,
            locating: geo.locating,
            locationDenied: geo.denied,
          })}
          variable={variable}
          onVariable={chooseVariable}
          headVariable={bundleVariable}
          stops={stops}
          gridOn={visible.grid}
          onToggleGrid={() => toggle('grid')}
          visible={visible}
          places={placesOn}
          locating={geo.locating}
          onLocate={geo.locate}
          onReset={() => {
            setProbe(null)
            setSelection(null)
            mapHandle.current?.reset()
          }}
          onLayers={() => setLayersOpen(true)}
          selection={selection}
          probe={probe}
          models={data.models}
          uncertainty={data.validation?.rmse ?? null}
          guagua={guagua.network}
          now={now}
          autoProbe={autoProbe}
        >
          {detail}
        </MobileShell>
      ) : (
        detail
      )}

      {showSources && <SourcesScreen onClose={() => setShowSources(false)} />}
    </main>
  )
}
