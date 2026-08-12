/**
 * Las capas de la red, validadas contra la especificación de MapLibre.
 *
 * Aquí no hay mapa que probar —eso es WebGL— pero sí hay algo que se rompe en
 * silencio: una expresión mal escrita hace que `addLayer` lance, y como las
 * capas se crean todas dentro del manejador de `load`, la excepción se lleva
 * por delante las que vinieran después. El test valida las cuatro contra el
 * propio validador de la librería, con las mismas fuentes que tendrán en vivo.
 *
 * El segundo test es el del delimitador: el operador `in` de MapLibre busca
 * subcadena, así que sin las barras la línea 2 casaría con la 200 y elegir una
 * línea corta encendería paradas que no son suyas.
 */

import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { GUAGUA_LAYER_SPECS, decorateStops, routeBounds, setGuaguaVisible } from './GuaguaLayer'
import type { GuaguaNetwork } from '../../lib/guagua/network'

const EMPTY = { type: 'FeatureCollection', features: [] } as const

describe('capas de la red de guaguas', () => {
  it('las cuatro capas son válidas para MapLibre', () => {
    const errors = validateStyleMin({
      version: 8,
      sources: {
        'guagua-lineas': { type: 'geojson', data: EMPTY },
        'guagua-paradas': { type: 'geojson', data: EMPTY },
      },
      layers: GUAGUA_LAYER_SPECS,
    } as never)
    expect(errors.map((e) => `${e.line ?? ''} ${e.message}`)).toEqual([])
  })

  it('las paradas se marcan con las líneas delimitadas por barras', () => {
    const net = {
      routes: {},
      stops: { '7': { routes: ['2', '200'], departures: { weekday: 1, saturday: 0, sunday: 0 }, first: null, last: null } },
    } as unknown as GuaguaNetwork

    const decorated = decorateStops(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-17.9, 28.6] },
            properties: { stop_id: '7' },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-17.9, 28.7] },
            properties: { stop_id: 'sin-servicio' },
          },
        ],
      },
      net,
    )

    const routes = String(decorated.features[0].properties?.routes)
    expect(routes).toBe('|2|200|')
    // Lo que de verdad se comprueba: buscar la línea 2 no encuentra la 200.
    expect(routes.includes('|2|')).toBe(true)
    expect('|200|'.includes('|2|')).toBe(false)
    // Una parada sin servicio conserva la propiedad, vacía: sin ella el filtro
    // del estilo evaluaría `undefined` y MapLibre avisa por consola en cada
    // repintado.
    expect(decorated.features[1].properties?.routes).toBe('||')
  })
})

/**
 * Mapa de mentira: solo lo que estas dos funciones tocan. Basta para fijar la
 * regla, y no hace falta WebGL para comprobarla.
 */
function fakeMap() {
  const visibility: Record<string, string> = {}
  return {
    visibility,
    getLayer: (id: string) => ({ id }),
    setLayoutProperty: (id: string, _prop: string, value: string) => {
      visibility[id] = value
    },
  }
}

describe('la línea elegida no cuelga del interruptor de líneas', () => {
  it('con las líneas apagadas, el recorrido elegido se sigue viendo', () => {
    const map = fakeMap()
    setGuaguaVisible(map as never, { lines: false, stops: true, route: '35' })
    // Esto era el fallo: se llega a un recorrido desde la ficha de una parada,
    // y apagar «líneas» lo borraba del mapa con la ficha abierta explicándolo.
    expect(map.visibility['guagua-lineas-elegida']).toBe('visible')
    expect(map.visibility['guagua-lineas-trazado']).toBe('none')
  })

  it('sin recorrido elegido, cada capa obedece a su casilla', () => {
    const map = fakeMap()
    setGuaguaVisible(map as never, { lines: false, stops: false, route: null })
    expect(map.visibility['guagua-lineas-elegida']).toBe('none')
    expect(map.visibility['guagua-paradas-elegida']).toBe('none')
  })
})

describe('encuadrar un recorrido', () => {
  const lines = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { route_id: '35' },
        geometry: { type: 'LineString', coordinates: [[-17.9, 28.6], [-17.8, 28.7]] },
      },
      // Otra variante de la MISMA línea: el rectángulo tiene que abarcarla.
      {
        type: 'Feature',
        properties: { route_id: '35' },
        geometry: { type: 'LineString', coordinates: [[-17.95, 28.55], [-17.85, 28.65]] },
      },
      {
        type: 'Feature',
        properties: { route_id: '11' },
        geometry: { type: 'LineString', coordinates: [[-17.7, 28.4], [-17.6, 28.9]] },
      },
    ],
  } as unknown as GeoJSON.FeatureCollection

  it('abarca todas las variantes de la línea y ninguna de las demás', () => {
    expect(routeBounds(lines, '35')).toEqual([[-17.95, 28.55], [-17.8, 28.7]])
  })

  it('una línea sin trazado no mueve el mapa', () => {
    expect(routeBounds(lines, '999')).toBeNull()
    expect(routeBounds(null, '35')).toBeNull()
  })
})
