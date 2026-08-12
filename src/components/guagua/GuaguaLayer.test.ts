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
import { GUAGUA_LAYER_SPECS, decorateStops } from './GuaguaLayer'
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
