/**
 * La red de guaguas, contra los ficheros reales.
 *
 * Los dos que de verdad importan son de integridad entre fuentes: que cada
 * parada del GeoJSON tenga su entrada en el agregado del GTFS —si no, el mapa
 * enseña un punto que al pincharlo no sabe decir qué línea para ahí— y que el
 * horario siga marcado como caducado mientras TILP no publique otro, porque de
 * esa marca depende que la ficha no anuncie una guagua que no pasa.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  compareLines,
  readStop,
  serviceLevel,
  wheelchairState,
  type GuaguaNetwork,
} from './network'

const net = JSON.parse(
  readFileSync(new URL('../../../public/guagua-red.json', import.meta.url), 'utf8'),
) as GuaguaNetwork

const stops = JSON.parse(
  readFileSync(new URL('../../../public/layers/paradas-guagua.geojson', import.meta.url), 'utf8'),
) as GeoJSON.FeatureCollection

describe('red de guaguas', () => {
  it('cada parada del mapa tiene servicio en el agregado del GTFS', () => {
    const missing = stops.features.filter(
      (f) => !net.stops[String(f.properties?.stop_id ?? '')],
    )
    expect(missing).toHaveLength(0)
    expect(stops.features).toHaveLength(913)
  })

  it('cada línea que sirve una parada existe en el catálogo de líneas', () => {
    const unknown = new Set<string>()
    for (const s of Object.values(net.stops)) {
      for (const r of s.routes) if (!net.routes[r]) unknown.add(r)
    }
    expect([...unknown]).toEqual([])
  })

  it('el horario de TILP sigue caducado, y el fichero lo dice', () => {
    // Si esto falla es una buena noticia: TILP ha publicado un feed nuevo. Hay
    // que remedir la fecha y decidir si ya se pueden enseñar horas de paso.
    expect(net.validUntil).toBe('2025-12-25')
    expect(net.expired).toBe(true)
  })

  it('las líneas se ordenan como las nombra la gente, no como cadenas', () => {
    const ids = ['100', '11', '2', '500', '35']
    expect([...ids].sort((a, b) => compareLines(net, a, b))).toEqual([
      '2',
      '11',
      '35',
      '100',
      '500',
    ])
  })

  it('ninguna parada de TILP se declara accesible, y ninguna se inventa', () => {
    const states = stops.features.map((f) => wheelchairState(f.properties?.wheelchair_boarding))
    expect(states.filter((s) => s === 'notAccessible')).toHaveLength(675)
    expect(states.filter((s) => s === 'unknown')).toHaveLength(238)
    expect(states.filter((s) => s === 'accessible')).toHaveLength(0)
  })

  it('el nivel de servicio reparte las paradas reales en los cuatro escalones', () => {
    const counted = { frequent: 0, regular: 0, sparse: 0, none: 0 }
    for (const s of Object.values(net.stops)) counted[serviceLevel(s.departures)]++
    expect(counted.frequent).toBeGreaterThan(0)
    expect(counted.regular).toBeGreaterThan(0)
    expect(counted.sparse).toBeGreaterThan(0)
    // Ninguna parada del fichero está sin servicio: el agregado solo incluye
    // las que aparecen en algún viaje.
    expect(counted.none).toBe(0)
  })

  it('una parada sin nombre conserva su identidad', () => {
    const p = readStop({ stop_id: '77', stop_code: 'A-77' }, -17.9, 28.6)
    expect(p.name).toBe('A-77')
    expect(readStop({ stop_id: '77' }, -17.9, 28.6).name).toBe('77')
  })
})
