/**
 * Las decisiones de dibujo de la red de guaguas que no dependen del motor de
 * mapas.
 *
 * Vivían dentro de `components/guagua/GuaguaLayer.ts`, que es el fichero que
 * habla con `maplibre-gl`. Mientras la única app era la web eso no molestaba; en
 * cuanto hubo una segunda, sí, porque allí ese fichero no se puede ni importar.
 * Y son cosas que cualquier plataforma necesita idénticas: a qué zoom aparecen
 * las paradas, cómo se marca cada parada con sus líneas y qué rectángulo ocupa
 * un recorrido.
 *
 * Duplicarlas habría sido peor que moverlas: un zoom mínimo distinto en cada
 * plataforma es la misma capa contando dos historias.
 */

import type { GuaguaNetwork } from './network'

/**
 * Zoom a partir del cual se dibujan las 913 paradas.
 *
 * Son 913 sobre una isla de 42 km: por debajo de este zoom no son un mapa de
 * paradas, son una mancha, y el trazado de las líneas ya cuenta por dónde pasa
 * el transporte público.
 *
 * Es también lo que permite que la red tenga UNA sola casilla en vez de dos:
 * encender la red no puede tapar el mapa de puntos, porque a la distancia en la
 * que molestarían no se dibujan.
 *
 * Se exporta porque la vista de llegada está por debajo: quien enciende el
 * interruptor allí no ve aparecer nada, y una casilla marcada sobre un mapa que
 * no cambia se lee como una capa rota. La interfaz lo dice mientras ocurre, y
 * para decirlo necesita este número.
 */
export const STOPS_MIN_ZOOM = 10.5

/**
 * Marca cada parada con las líneas que la sirven, para que el resaltado sea un
 * filtro del estilo y no una segunda fuente.
 *
 * El valor va entre barras —`|100|500|`— porque el operador `in` de MapLibre
 * busca subcadena: sin delimitador, la línea 2 casaría con la 200 y al elegir
 * una línea corta se iluminaría media isla.
 */
export function decorateStops(
  fc: GeoJSON.FeatureCollection,
  net: GuaguaNetwork | null,
): GeoJSON.FeatureCollection {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const id = String(f.properties?.stop_id ?? '')
      const routes = net?.stops[id]?.routes ?? []
      return { ...f, properties: { ...(f.properties ?? {}), routes: `|${routes.join('|')}|` } }
    }),
  }
}

/**
 * El rectángulo que ocupa un recorrido, para poder encuadrarlo.
 *
 * Sin esto, «ver el recorrido en el mapa» no movía el mapa: si la línea caía
 * fuera de la vista —o detrás de la propia ficha, que ocupa el lado derecho—,
 * el botón parecía no hacer nada.
 */
export function routeBounds(
  lines: GeoJSON.FeatureCollection | null,
  routeId: string,
): [[number, number], [number, number]] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      minX = Math.min(minX, c[0])
      maxX = Math.max(maxX, c[0])
      minY = Math.min(minY, c[1])
      maxY = Math.max(maxY, c[1])
      return
    }
    if (Array.isArray(c)) for (const part of c) walk(part)
  }
  for (const f of lines?.features ?? []) {
    if (String(f.properties?.route_id ?? '') !== routeId) continue
    walk((f.geometry as { coordinates?: unknown }).coordinates)
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null
}
