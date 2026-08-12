/**
 * Las capas de sitios y carreteras, validadas contra la especificación.
 *
 * Mismo motivo que en las de guagua: `addLayer` lanza con una expresión mal
 * escrita y se lleva por delante todo lo que se creara después dentro del mismo
 * manejador de `load`.
 *
 * El segundo test cuida algo que no se ve por definición: la capa de toque de
 * las carreteras es transparente, y la tentación de escribirla con
 * `visibility: none` en vez de `line-opacity: 0` es permanente. Una capa oculta
 * no aparece en `queryRenderedFeatures`, así que ese cambio dejaría las
 * carreteras dibujadas y no pinchables, sin ningún error por ninguna parte.
 */

import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { PLACES_LAYER_SPECS, ROADS_HIT_LAYER, ROADS_LAYER } from './PlacesLayer'
import { PLACES, placeImageId } from '../../lib/places'

const EMPTY = { type: 'FeatureCollection', features: [] } as const

describe('capas de sitios y carreteras', () => {
  it('son válidas para MapLibre', () => {
    const errors = validateStyleMin({
      version: 8,
      sources: {
        places: { type: 'geojson', data: EMPTY },
        carreteras: { type: 'geojson', data: EMPTY },
      },
      layers: PLACES_LAYER_SPECS,
    } as never)
    expect(errors.map((e) => `${e.line ?? ''} ${e.message}`)).toEqual([])
  })

  it('la capa de toque de las carreteras es transparente, no invisible', () => {
    const hit = PLACES_LAYER_SPECS.find((l) => l.id === ROADS_HIT_LAYER)
    expect(hit?.type).toBe('line')
    // Transparente para que se pueda consultar; ancha para que se pueda acertar.
    expect((hit as { paint: Record<string, unknown> }).paint['line-opacity']).toBe(0)
    expect((hit as { paint: Record<string, unknown> }).paint['line-width']).toBeGreaterThanOrEqual(10)
  })

  it('la línea que se ve va por debajo de la que recoge el clic', () => {
    const order = PLACES_LAYER_SPECS.map((l) => l.id)
    expect(order.indexOf(ROADS_LAYER)).toBeLessThan(order.indexOf(ROADS_HIT_LAYER))
  })
})

describe('catálogo de sitios', () => {
  it('cada capa tiene su propio fichero, icono y color', () => {
    const files = PLACES.map((p) => p.file)
    const colors = PLACES.map((p) => p.color)
    const glyphs = PLACES.map((p) => p.glyph)
    expect(new Set(files).size).toBe(PLACES.length)
    expect(new Set(colors).size).toBe(PLACES.length)
    // El dibujo también: dos capas con el mismo trazo y distinto color son dos
    // capas que en el mapa dicen lo mismo. Los miradores heredaron el suyo del
    // de interés turístico, y por eso el de turístico tuvo que cambiar.
    expect(new Set(glyphs).size).toBe(PLACES.length)
  })

  it('el identificador de imagen no colisiona con el de los puntos de sendero', () => {
    for (const p of PLACES) expect(placeImageId(p.kind)).toMatch(/^place-/)
  })
})
