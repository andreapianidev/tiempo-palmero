/**
 * Las capas del viario de OSM, validadas contra la especificación.
 *
 * Mismo motivo que en las de sitios y guaguas: `addLayer` lanza con una
 * expresión mal escrita y se lleva por delante todo lo que se creara después
 * dentro del mismo manejador de `load`. Aquí además hay filtros por dos
 * propiedades y un `minzoom` por capa, que son tres formas más de equivocarse
 * sin que nadie avise.
 */

import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import {
  OSM_ROADS_LAYERS,
  OSM_ROADS_LAYER_SPECS,
  OSM_ROADS_LOCAL,
  OSM_ROADS_MAIN,
  OSM_ROADS_MIN_ZOOM,
  OSM_ROADS_SERVICE,
  OSM_ROADS_TRACK,
} from './OsmRoadsLayer'
import { OSM_ROAD_CLASSES } from '../../lib/osm-roads'

const EMPTY = { type: 'FeatureCollection', features: [] } as const

const spec = (id: string) => OSM_ROADS_LAYER_SPECS.find((l) => l.id === id)!

describe('capas del viario de OSM', () => {
  it('son válidas para MapLibre', () => {
    const errors = validateStyleMin({
      version: 8,
      sources: { 'viario-osm': { type: 'geojson', data: EMPTY } },
      layers: OSM_ROADS_LAYER_SPECS,
    } as never)
    expect(errors.map((e) => `${e.line ?? ''} ${e.message}`)).toEqual([])
  })

  it('nacen apagadas', () => {
    // La capa se enciende con su interruptor y se descarga entonces: si
    // naciera visible, pintaría 5,2 MB que nadie ha pedido.
    for (const l of OSM_ROADS_LAYER_SPECS) expect(l.layout?.visibility).toBe('none')
  })

  it('la principal se pinta por encima de las pistas', () => {
    // El orden del array es el orden de pintado. Al revés, una telaraña de
    // 14.003 accesos taparía la LP-1.
    const order = OSM_ROADS_LAYER_SPECS.map((l) => l.id)
    expect(order.indexOf(OSM_ROADS_MAIN)).toBeGreaterThan(order.indexOf(OSM_ROADS_LOCAL))
    expect(order.indexOf(OSM_ROADS_LOCAL)).toBeGreaterThan(order.indexOf(OSM_ROADS_TRACK))
    expect(order.indexOf(OSM_ROADS_TRACK)).toBeGreaterThan(order.indexOf(OSM_ROADS_SERVICE))
    expect([...OSM_ROADS_LAYERS]).toEqual(order)
  })

  it('los tres niveles se reparten los filtros sin dejarse ninguno fuera', () => {
    // Cada nivel de `osm-roads.ts` tiene que caer en una capa y en una sola. Un
    // nivel sin capa serían kilómetros descargados y no dibujados.
    const matches = (t: number, c: string) =>
      OSM_ROADS_LAYER_SPECS.filter((l) => {
        const f = (l as { filter: unknown[] }).filter
        if (f[0] === '==') return (f[2] as number) === t
        // ['all', ['==',['get','t'],3], ['==' | '!=', ['get','c'], 'track']]
        const [, tier, klass] = f as [string, unknown[], unknown[]]
        const okTier = (tier[2] as number) === t
        const okClass = klass[0] === '==' ? c === 'track' : c !== 'track'
        return okTier && okClass
      })

    for (const [klass, tier] of Object.entries(OSM_ROAD_CLASSES)) {
      expect(matches(tier, klass).map((l) => l.id)).toHaveLength(1)
    }
    expect(matches(3, 'track')[0].id).toBe(OSM_ROADS_TRACK)
    expect(matches(3, 'service')[0].id).toBe(OSM_ROADS_SERVICE)
  })

  it('lo menudo no se pinta a zoom de isla entera', () => {
    // La vista inicial es la isla completa, alrededor de z9,5: ahí solo tiene
    // que verse la red que la cruza.
    expect(spec(OSM_ROADS_MAIN).minzoom).toBeUndefined()
    expect(spec(OSM_ROADS_LOCAL).minzoom).toBe(OSM_ROADS_MIN_ZOOM.local)
    expect(spec(OSM_ROADS_TRACK).minzoom).toBe(OSM_ROADS_MIN_ZOOM.minor)
    expect(spec(OSM_ROADS_SERVICE).minzoom).toBe(OSM_ROADS_MIN_ZOOM.minor)
    expect(OSM_ROADS_MIN_ZOOM.local).toBeLessThan(OSM_ROADS_MIN_ZOOM.minor)
  })

  it('la pista de tierra es la única discontinua', () => {
    const dashed = OSM_ROADS_LAYER_SPECS.filter(
      (l) => (l.paint as Record<string, unknown>)['line-dasharray'],
    )
    expect(dashed.map((l) => l.id)).toEqual([OSM_ROADS_TRACK])
  })

  it('ninguna capa recoge el clic', () => {
    // La ficha de una carretera sale del dato del Cabildo. Si alguien añadiera
    // aquí una capa de toque, 19.770 líneas anchas y transparentes se comerían
    // el clic de las estaciones, las paradas y los puntos de interés.
    for (const l of OSM_ROADS_LAYER_SPECS) {
      expect((l.paint as Record<string, unknown>)['line-opacity']).toBeUndefined()
      expect((l.paint as Record<string, unknown>)['line-width']).not.toBe(14)
    }
  })
})
