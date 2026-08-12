/**
 * Taxonomía de los puntos de interés, contra la capa real.
 *
 * El test que importa es el de cobertura: se recorren los 1.190 puntos que
 * publica el Cabildo y ninguno puede acabar en el icono genérico por accidente.
 * La fuente mezcla mayúsculas (`Viveres_Tienda` y `Viveres_tienda`,
 * `Arq_Religiosa` y `Arq_religiosa`), y sin normalizar se colaban cuatro puntos
 * mal clasificados sin que nada avisara.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { classifyPoi, decoratePoiCollection, imageId, POI_ICONS, readPoi } from './poi'
import { es } from '../i18n/es'

const collection = JSON.parse(
  readFileSync(new URL('../../public/layers/senderos-poi.geojson', import.meta.url), 'utf8'),
) as GeoJSON.FeatureCollection

/** Los únicos subtipos que legítimamente caen en el icono de su familia. */
const GENERIC_SUBTYPES = new Set(['otros'])

describe('taxonomía de puntos de interés', () => {
  it('la capa sigue teniendo los campos que lee la ficha', () => {
    expect(collection.features.length).toBeGreaterThan(1000)
    for (const f of collection.features.slice(0, 50)) {
      expect(Object.keys(f.properties ?? {})).toEqual(
        expect.arrayContaining(['id_punto', 'codigo', 'tipo', 'subtipo', 'descripcion']),
      )
    }
  })

  it('clasifica todos los subtipos reales, sin caer en el genérico', () => {
    const unclassified = new Set<string>()
    for (const f of collection.features) {
      const p = f.properties ?? {}
      const sub = String(p.subtipo ?? '').toLowerCase()
      if (GENERIC_SUBTYPES.has(sub)) continue
      const { icon } = classifyPoi(p.tipo, p.subtipo)
      // `senal` y `hoja` son los comodines de familia: un subtipo concreto que
      // acabe ahí es un subtipo que nadie ha traducido a icono.
      if (icon === 'senal' || icon === 'hoja') {
        if (sub !== 'biol_otros') unclassified.add(`${p.tipo}/${p.subtipo}`)
      }
    }
    expect([...unclassified]).toEqual([])
  })

  it('no distingue mayúsculas: la fuente publica el mismo subtipo de dos formas', () => {
    expect(classifyPoi('Servicios', 'Viveres_tienda')).toEqual(
      classifyPoi('Servicios', 'Viveres_Tienda'),
    )
    expect(classifyPoi('Cultural', 'Arq_religiosa')).toEqual(
      classifyPoi('Cultural', 'Arq_Religiosa'),
    )
  })

  it('la familia de cada punto es coherente con su tipo', () => {
    const expected: Record<string, string> = {
      servicios: 'servicios',
      cultural: 'cultural',
      natural: 'natural',
    }
    for (const f of collection.features) {
      const p = f.properties ?? {}
      const tipo = String(p.tipo ?? '').toLowerCase()
      if (!expected[tipo]) continue
      expect(classifyPoi(p.tipo, p.subtipo).family).toBe(expected[tipo])
    }
  })

  it('cada subtipo real tiene etiqueta en castellano', () => {
    const missing = new Set<string>()
    for (const f of collection.features) {
      const sub = String(f.properties?.subtipo ?? '').toLowerCase()
      if (sub && !es.poi.subtypes[sub]) missing.add(sub)
    }
    expect([...missing]).toEqual([])
  })

  it('todo punto decorado apunta a una imagen registrada', () => {
    const known = new Set(POI_ICONS.map(imageId))
    const decorated = decoratePoiCollection(collection)
    for (const f of decorated.features) {
      expect(known.has(String(f.properties?.icon))).toBe(true)
    }
  })

  it('la ficha conserva todos los campos de la fuente', () => {
    const f = collection.features[0]
    const poi = readPoi({ ...(f.properties ?? {}) }, -17.75, 28.7)
    expect(poi.name).toBe(f.properties?.descripcion)
    expect(poi.props).toEqual(f.properties)
  })

  it('un punto sin descripción se identifica por su código, no en blanco', () => {
    const poi = readPoi({ codigo: 'PDI-GR1301-00013', tipo: 'Natural', subtipo: 'Geol_Cueva' }, 0, 0)
    expect(poi.name).toBe('PDI-GR1301-00013')
    expect(poi.icon).toBe('cueva')
  })
})
