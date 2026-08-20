/**
 * Lo que el mapa recibe y lo que devuelve. Solo tipos.
 *
 * SALIÓ DE `MapView.tsx` PORQUE ERAN 250 LÍNEAS DE INTERFAZ delante de 1950 de
 * código, y porque en cuanto el fichero empezó a partirse en ganchos —los
 * marcadores del DOM, los sitios y las carreteras— todos necesitaban el mismo
 * `Props`. Importarlo del componente que a su vez los importa a ellos es un
 * ciclo: funciona porque TypeScript borra los tipos, y es exactamente la clase
 * de cosa que funciona hasta que alguien añade un valor al mismo fichero.
 *
 * Aquí no hay ni una línea de comportamiento. Todo lo que se lee es qué le
 * puede llegar al mapa, y cada campo trae escrito por qué existe — que es la
 * parte que no se puede deducir del tipo.
 */

import type { MutableRefObject } from 'react'
import type { BasemapId } from '../../lib/basemaps'
import type { MapVariable } from '../../lib/variables'
import type { MaskedField } from '../../lib/masked-field'
import type { RgbStop } from '../../lib/palette'
import type { Station } from '../../lib/quality'
import type { PoiRecord } from '../../lib/poi'
import type { OceanQuality } from '../../lib/ocean/quality'
import type { OceanData } from '../../hooks/useOcean'
import type { OceanLight } from '../../lib/ocean/light'
import type { VaporField } from '../../lib/vapor/field'
import type { StarSceneState } from '../stars/StarLayer'
import type { MoonSceneState } from '../moon/MoonLayer'
import type { PlanetSceneState } from '../planets/PlanetLayer'
import type { PlanetTable } from '../../lib/planets/table'
import type { SkyData } from '../../lib/stars/catalog'
import type { Cloud } from '../../lib/sky/scene'
import type { TrackPoint } from '../../lib/sky/sun-path'
import type { SkyPosition } from '../../lib/sun'
import type { Exaggeration } from '../../lib/terrain'
import type { GuaguaStopPoint } from '../../lib/guagua/network'
import type { PlaceRecord } from '../../lib/places'
import type { RoadRecord } from '../../lib/roads'
import type { WebcamSite } from '../../lib/webcams/catalog'
import type { CounterSite } from '../../lib/counters/model'
import type { WindField } from '../../lib/wind/field'
import type { Model, InterpolableVariable } from '../../lib/interpolate'
import type { Dem } from '../../lib/dem'
import type { AirStation, Co2Point, FireCamera, SkyStation } from '../../hooks/useIslandData'
import type { Diagnosis } from '../../lib/sensor-health'
import type { GazetteerEntry } from '../../lib/api'

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

export interface Props {
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
   * El cielo estrellado. `scene` es `null` mientras el catálogo no ha llegado;
   * la capa se añade igual y no dibuja nada hasta que lo tiene.
   */
  nightSky: {
    on: boolean
    scene: StarSceneState | null
    data: SkyData | null
    /** El disco de la luna. `null` con su casilla apagada. */
    moon: MoonSceneState | null
    /** Los planetas. `null` con su casilla apagada. */
    planets: PlanetSceneState | null
    /** La tabla de efemérides. `null` mientras no ha llegado o si falló. */
    planetTable: PlanetTable | null
  }
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
    /**
     * Si se dibuja el camino que recorre el sol hoy. Ver `sky/SunPathLayer.ts`.
     *
     * Va con el disco y no dentro de él porque contesta otra cosa: el disco dice
     * dónde está el sol AHORA —y solo se ve en la ventana estrecha de cerca del
     * horizonte—; el camino dice por dónde sale y por dónde se pone, que se ve
     * a cualquier hora porque baja hasta el horizonte por los dos lados.
     */
    path: boolean
    /**
     * El camino, ya calculado. Llega desde fuera por lo mismo que `dome`: sale
     * de la misma astronomía que la posición del sol de esta pantalla, y
     * calcularlo aquí dentro sería tener dos.
     */
    track: readonly TrackPoint[]
    /**
     * Un contador que sube cada vez que alguien pide que la vista se ponga en
     * condiciones de ver el cielo. No es un booleano porque no es un estado: es
     * un empujón, y dos empujones seguidos tienen que llegar los dos.
     */
    nudge: number
    /**
     * Hacia dónde mirar cuando llegue ese empujón: el rumbo del sol si está
     * fuera, y el de por dónde sale si es de noche. Sube desde `App` porque es
     * quien tiene el orto calculado.
     */
    lookAt: number
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

/**
 * Los marcadores que compiten por el sitio en pantalla.
 *
 * Están aquí y no en el gancho que los crea porque `MapView` guarda las refs y
 * `declutterImpl` las reparte: son tres ficheros mirando la misma lista, y una
 * forma escrita tres veces es tres formas.
 */
export interface PillMarker {
  el: HTMLElement
  lon: number
  lat: number
  priority: number
  elevation?: number
}

/** Las cámaras de incendio: entran en el reparto pero no se colapsan a un punto. */
export interface FireMarker {
  el: HTMLElement
  lon: number
  lat: number
  alert: boolean
}

/** Las webcams: no compiten, pero sí se esconden detrás de la montaña. */
export interface WebcamMarker {
  el: HTMLElement
  lon: number
  lat: number
}
