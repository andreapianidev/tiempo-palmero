/**
 * La red de guaguas sobre el mapa: trazados y paradas.
 *
 * Vive fuera de `MapView` porque es una capa entera con su propia lógica —dos
 * fuentes, cuatro capas, resaltado de línea y un filtro por parada— y no un
 * `addLayer` más. El componente del mapa solo la enciende, le da los datos y le
 * pasa los dos manejadores de clic.
 *
 * Aquí queda solo lo que habla con `maplibre-gl`. El zoom mínimo de las
 * paradas, el marcado de qué líneas sirven cada una y el rectángulo de un
 * recorrido están en `lib/guagua/display.ts`: son decisiones de la red, no del
 * motor de mapas, y este fichero no puede ser el dueño de ellas.
 */

import type { Map as MlMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl'
import { COLORS } from '../../lib/mapStyle'
import { STOPS_MIN_ZOOM } from '../../lib/guagua/display'

const SRC_LINES = 'guagua-lineas'
const SRC_STOPS = 'guagua-paradas'

const LINES = 'guagua-lineas-trazado'
const LINES_SEL = 'guagua-lineas-elegida'
const STOPS = 'guagua-paradas-punto'
const STOPS_SEL = 'guagua-paradas-elegida'

/**
 * Las que se comen el clic: si el puntero ha caído sobre una de ellas, el mapa
 * no debe además abrir el panel del punto. `MapView` lo consulta en su
 * manejador general.
 */
export const GUAGUA_CLICK_LAYERS = [STOPS, STOPS_SEL, LINES, LINES_SEL]

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

interface Handlers {
  onStop: (props: Record<string, unknown>, lon: number, lat: number) => void
  onRoute: (routeId: string) => void
}

/**
 * Las cuatro capas, como datos y no como llamadas sueltas: así se pueden
 * validar contra la especificación de estilo en un test. Una expresión mal
 * escrita hace que `addLayer` LANCE, y como todas las capas se crean dentro del
 * mismo manejador de `load`, una sola errata dejaría el mapa sin senderos, sin
 * puntos de interés y sin guaguas a la vez.
 */
export const GUAGUA_LAYER_SPECS: LayerSpecification[] = [
  {
    id: LINES,
    type: 'line',
    source: SRC_LINES,
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: {
      'line-color': COLORS.guagua,
      // A z9 la isla entera cabe en pantalla y 0,8 px sobre la malla de color
      // no se ve: la red tiene que leerse justo en la vista de llegada.
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 13, 2, 16, 3],
    },
  },
  // La línea elegida se dibuja aparte y por encima, en vez de cambiarle el
  // color a la de abajo: así conserva el trazado completo aunque el resto de la
  // red siga visible debajo, que es como se entiende un recorrido.
  {
    id: LINES_SEL,
    type: 'line',
    source: SRC_LINES,
    layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    filter: ['==', ['get', 'route_id'], ' '],
    paint: {
      'line-color': COLORS.guaguaBright,
      'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 13, 3.4, 16, 5],
    },
  },
  {
    id: STOPS,
    type: 'circle',
    source: SRC_STOPS,
    // 10,5 y no 11,5: a 11,5 había que acercarse dos niveles desde la vista de
    // llegada para ver la primera parada, y la capa parecía rota.
    minzoom: STOPS_MIN_ZOOM,
    layout: { visibility: 'none' },
    paint: {
      // Relleno claro y borde oscuro, no al revés: sobre la malla interpolada
      // —naranjas y verdes— un punto oscuro con aro fino desaparece.
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, 1.9, 14, 3.4, 16, 4.6],
      'circle-color': COLORS.guagua,
      'circle-stroke-color': '#0e0d0b',
      'circle-stroke-width': 1,
    },
  },
  // Las paradas de la línea elegida se ven desde más lejos que el resto: al
  // elegir una línea lo que se quiere ver es dónde para, no a qué zoom estamos.
  {
    id: STOPS_SEL,
    type: 'circle',
    source: SRC_STOPS,
    minzoom: 9,
    layout: { visibility: 'none' },
    filter: ['in', '| |', ['get', 'routes']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.6, 13, 4.4, 16, 6],
      'circle-color': COLORS.guaguaBright,
      'circle-stroke-color': '#0e0d0b',
      'circle-stroke-width': 1.2,
    },
  },
]

export function addGuaguaLayers(map: MlMap, handlers: Handlers, beforeId?: string): void {
  map.addSource(SRC_LINES, { type: 'geojson', data: EMPTY })
  map.addSource(SRC_STOPS, { type: 'geojson', data: EMPTY })

  for (const spec of GUAGUA_LAYER_SPECS) map.addLayer(spec, beforeId)

  const openStop = (e: { features?: GeoJSON.Feature[] }) => {
    const f = e.features?.[0]
    if (!f || f.geometry.type !== 'Point') return
    const [lon, lat] = f.geometry.coordinates as [number, number]
    handlers.onStop({ ...(f.properties ?? {}) }, lon, lat)
  }
  map.on('click', STOPS, openStop)
  map.on('click', STOPS_SEL, openStop)

  const openRoute = (e: { features?: GeoJSON.Feature[] }) => {
    const id = e.features?.[0]?.properties?.route_id
    if (id === undefined || id === null) return
    handlers.onRoute(String(id))
  }
  map.on('click', LINES, openRoute)
  map.on('click', LINES_SEL, openRoute)

  for (const layer of GUAGUA_CLICK_LAYERS) {
    map.on('mouseenter', layer, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', layer, () => {
      map.getCanvas().style.cursor = 'crosshair'
    })
  }
}

export function setGuaguaData(
  map: MlMap,
  lines: GeoJSON.FeatureCollection | null,
  stops: GeoJSON.FeatureCollection | null,
): void {
  if (lines) (map.getSource(SRC_LINES) as GeoJSONSource | undefined)?.setData(lines)
  if (stops) (map.getSource(SRC_STOPS) as GeoJSONSource | undefined)?.setData(stops)
}

/**
 * Qué se ve de la red.
 *
 * Sigue recibiendo `lines` y `stops` por separado aunque hoy los mueva la misma
 * casilla: son dos capas con zoom mínimo y estilo distintos, y esta función
 * habla de capas, no de casillas. Quien decide que van juntas es la barra
 * lateral.
 */
export function setGuaguaVisible(
  map: MlMap,
  visible: { lines: boolean; stops: boolean; route?: string | null },
): void {
  const on = (id: string, v: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none')
  }
  // La línea elegida NO es la capa de líneas, y colgarla del mismo interruptor
  // costó un fallo real: se llega a ella desde la ficha de una parada, con «ver
  // el recorrido en el mapa», y con el interruptor de líneas apagado el
  // recorrido desaparecía del mapa mientras su ficha seguía abierta contando
  // por dónde va. Comprobado en producción el 12 ago 2026. Un recorrido elegido
  // es una petición explícita: se atiende esté como esté el interruptor.
  const chosen = visible.route !== null && visible.route !== undefined
  on(LINES, visible.lines)
  on(LINES_SEL, visible.lines || chosen)
  on(STOPS, visible.stops)
  on(STOPS_SEL, visible.stops || chosen)
}

/** Resalta una línea y sus paradas. Con `null` vuelve la red entera, sin nada elegido. */
export function setGuaguaRoute(map: MlMap, routeId: string | null): void {
  // Un identificador que no existe apaga el filtro sin tener que quitar la capa
  // ni recalcular la fuente.
  const id = routeId ?? ' '
  if (map.getLayer(LINES_SEL)) map.setFilter(LINES_SEL, ['==', ['get', 'route_id'], id])
  if (map.getLayer(STOPS_SEL)) map.setFilter(STOPS_SEL, ['in', `|${id}|`, ['get', 'routes']])
}
