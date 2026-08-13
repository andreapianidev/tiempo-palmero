/**
 * La red de guaguas de TILP: trazados y paradas.
 *
 * Cuatro capas y una sola casilla, igual que la web desde que se juntaron. Lo
 * que justificaba separarlas era que encender la red tapase el mapa con 913
 * puntos, y eso no puede pasar: las paradas tienen zoom mínimo z10,5, así que a
 * la distancia en la que molestarían no se dibujan. En la vista de llegada se
 * ven los trazados, y al acercarse aparecen los puntos.
 *
 * La línea elegida se dibuja aparte y POR ENCIMA, no cambiándole el color a la
 * de abajo: así conserva el trazado entero aunque el resto de la red siga
 * visible debajo, que es como se entiende un recorrido. Y sus paradas se ven
 * desde más lejos que las demás —z9 y no z10,5— porque al elegir una línea lo
 * que se quiere ver es dónde para, no a qué zoom estamos.
 *
 * El filtro de la línea elegida busca `|100|` con las barras puestas: el
 * operador `in` de MapLibre busca subcadena, y sin delimitador la línea 2
 * casaría con la 200 y al elegir una línea corta se iluminaría media isla.
 *
 * Y la línea elegida NO cuelga del interruptor de la red. Colgarla costó un
 * fallo real en la web, corregido el 12 ago 2026: se llega a un recorrido desde
 * la ficha de una parada, y con el interruptor apagado el trazado desaparecía
 * del mapa mientras su ficha seguía abierta contando por dónde va. Un recorrido
 * elegido es una petición explícita y se atiende esté como esté la casilla.
 */

import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native'
import { COLORS } from '@core/lib/mapStyle'
import { STOPS_MIN_ZOOM } from '@core/lib/guagua/display'
import { readStop, type GuaguaStopPoint } from '@core/lib/guagua/network'

/** El identificador que no es de ninguna línea, para no resaltar nada. */
const NO_ROUTE = ' '

interface Props {
  lines: GeoJSON.FeatureCollection | null
  stops: GeoJSON.FeatureCollection | null
  visible: boolean
  /** Línea resaltada, o `null` si no hay ninguna elegida. */
  route: string | null
  onStop: (stop: GuaguaStopPoint) => void
  onRoute: (routeId: string) => void
}

export function GuaguaOverlay({ lines, stops, visible, route, onStop, onRoute }: Props) {
  const chosen = route !== null
  if (!visible && !chosen) return null
  const base = visible ? 'visible' : 'none'
  return (
    <>
      {lines ? (
        <GeoJSONSource
          id="guagua-lineas"
          data={lines}
          onPress={(e) => {
            const id = e.nativeEvent.features[0]?.properties?.route_id
            if (id === undefined || id === null) return
            onRoute(String(id))
          }}
        >
          <Layer
            id="guagua-lineas-trazado"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round', visibility: base }}
            paint={{
              'line-color': COLORS.guagua,
              // A z9 la isla entera cabe en pantalla y 0,8 px sobre la malla de
              // color no se ve: la red tiene que leerse en la vista de llegada.
              'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 13, 2, 16, 3],
            }}
          />
          <Layer
            id="guagua-lineas-elegida"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            filter={['==', ['get', 'route_id'], route ?? NO_ROUTE]}
            paint={{
              'line-color': COLORS.guaguaBright,
              'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2, 13, 3.4, 16, 5],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {stops ? (
        <GeoJSONSource
          id="guagua-paradas"
          data={stops}
          onPress={(e) => {
            const f = e.nativeEvent.features[0]
            if (!f || f.geometry.type !== 'Point') return
            const [lon, lat] = f.geometry.coordinates as [number, number]
            onStop(readStop({ ...(f.properties ?? {}) }, lon, lat))
          }}
        >
          <Layer
            id="guagua-paradas-punto"
            type="circle"
            minzoom={STOPS_MIN_ZOOM}
            layout={{ visibility: base }}
            paint={{
              // Relleno claro y borde oscuro, no al revés: sobre la malla
              // interpolada —naranjas y verdes— un punto oscuro con aro fino
              // desaparece.
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 10.5, 1.9, 14, 3.4, 16, 4.6],
              'circle-color': COLORS.guagua,
              'circle-stroke-color': '#0e0d0b',
              'circle-stroke-width': 1,
            }}
          />
          <Layer
            id="guagua-paradas-elegida"
            type="circle"
            minzoom={9}
            filter={['in', route ? `|${route}|` : `|${NO_ROUTE}|`, ['get', 'routes']]}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.6, 13, 4.4, 16, 6],
              'circle-color': COLORS.guaguaBright,
              'circle-stroke-color': '#0e0d0b',
              'circle-stroke-width': 1.2,
            }}
          />
        </GeoJSONSource>
      ) : null}
    </>
  )
}
