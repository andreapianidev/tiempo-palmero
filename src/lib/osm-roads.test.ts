import { describe, expect, it } from 'vitest'
import { OSM_ROAD_CLASSES, OSM_ROAD_KINDS, roadTier } from './osm-roads'

describe('jerarquía del viario de OSM', () => {
  it('la red que cruza la isla es la principal', () => {
    // La LP-1 y la LP-2 son `primary`; la LP-3, la del túnel, es `secondary`.
    expect(roadTier('primary')).toBe(1)
    expect(roadTier('secondary')).toBe(1)
    expect(roadTier('trunk_link')).toBe(1)
  })

  it('lo que se recorre dentro de un pueblo es viario local', () => {
    expect(roadTier('residential')).toBe(2)
    expect(roadTier('unclassified')).toBe(2)
    expect(roadTier('tertiary')).toBe(2)
    expect(roadTier('pedestrian')).toBe(2)
  })

  it('las pistas y los accesos van al tercer nivel', () => {
    expect(roadTier('track')).toBe(3)
    expect(roadTier('service')).toBe(3)
  })

  it('los senderos NO son viario', () => {
    // Están en la capa de senderos del Cabildo, con nombre y con aviso. Aquí
    // serían 6.570 trazados duplicados y un mapa ilegible.
    for (const k of ['path', 'footway', 'steps', 'cycleway', 'bridleway']) {
      expect(roadTier(k)).toBeNull()
    }
  })

  it('una etiqueta que no está en la lista no se pinta como si lo estuviera', () => {
    expect(roadTier('construction')).toBeNull()
    expect(roadTier('proposed')).toBeNull()
    expect(roadTier('raceway')).toBeNull()
    expect(roadTier('elevator')).toBeNull()
    expect(roadTier(undefined)).toBeNull()
    expect(roadTier('')).toBeNull()
  })

  it('la consulta a Overpass pide exactamente las clases que se saben pintar', () => {
    // Si las dos listas se separaran, o bajaríamos trazados que luego se tiran
    // —peso y tiempo de nadie— o pintaríamos con `t` indefinido.
    expect([...OSM_ROAD_KINDS].sort()).toEqual(Object.keys(OSM_ROAD_CLASSES).sort())
    for (const k of OSM_ROAD_KINDS) expect(roadTier(k)).not.toBeNull()
  })

  it('ninguna clase se queda sin nivel ni con uno inventado', () => {
    for (const tier of Object.values(OSM_ROAD_CLASSES)) {
      expect([1, 2, 3]).toContain(tier)
    }
  })
})
