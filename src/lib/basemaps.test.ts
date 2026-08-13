import { describe, expect, it } from 'vitest'
import { BASEMAPS, BASEMAP_ORDER, EXTERNAL_BASEMAPS } from './basemaps'

/**
 * Lo que se prueba aquí es la plantilla de la petición, no la cartografía.
 *
 * Un fondo roto no da error en ninguna parte: MapLibre pide la tesela, el
 * servicio contesta con un XML de excepción en vez de una imagen y el mapa se
 * queda igual que estaba, sin fondo y sin decir por qué. Las tres formas de
 * romperlo son un `{bbox}` escapado, un WMS 1.3.0 —donde el orden de los ejes
 * del bbox depende del CRS— y un CRS que no sea el que la plantilla escribe.
 */
describe('fondos externos', () => {
  it('piden el bbox con la plantilla literal de MapLibre', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      const url = b.source.tiles![0]
      expect(url, b.id).toContain('bbox={bbox-epsg-3857}')
      // Escapado por URLSearchParams sería `%7Bbbox-epsg-3857%7D`, que el
      // servicio recibiría como un bbox literal sin números.
      expect(url, b.id).not.toContain('%7B')
    }
  })

  it('piden en 1.1.1, que es la versión donde el bbox es minx,miny,maxx,maxy', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      const url = b.source.tiles![0]
      expect(url, b.id).toContain('version=1.1.1')
      expect(url, b.id).toContain('srs=EPSG%3A3857')
      // En 1.1.1 el parámetro es `srs`; `crs` es de 1.3.0 y aquí se ignoraría.
      expect(url, b.id).not.toContain('crs=')
    }
  })

  it('el tamaño pedido es el de la tesela declarada', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      const url = b.source.tiles![0]
      expect(url, b.id).toContain(`width=${b.source.tileSize}`)
      expect(url, b.id).toContain(`height=${b.source.tileSize}`)
    }
  })

  it('no piden fuera de la isla', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      const [w, s, e, n] = b.source.bounds!
      expect(w, b.id).toBeLessThan(-18)
      expect(e, b.id).toBeGreaterThan(-17.5)
      expect(s, b.id).toBeLessThan(28.4)
      expect(n, b.id).toBeGreaterThan(28.9)
    }
  })

  it('cada uno dice de quién es la cartografía', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      expect(b.source.attribution, b.id).toContain('GRAFCAN')
    }
  })
})

describe('catálogo', () => {
  it('el fondo de arranque no depende de nadie', () => {
    // Si esto deja de ser así, la isla no aparece en pantalla cuando el
    // servicio ajeno está caído — que es justo lo que el relieve de casa
    // existe para evitar.
    expect(BASEMAPS.relieve.source).toBeNull()
    expect(BASEMAP_ORDER[0]).toBe('relieve')
  })

  it('el orden nombra fondos que existen, y todos', () => {
    expect(new Set(BASEMAP_ORDER)).toEqual(new Set(Object.keys(BASEMAPS)))
  })

  it('solo cede los topónimos el fondo que trae los suyos', () => {
    // El 12,5 está medido contra la carta (ver `basemaps.ts`): a z12 sus
    // rótulos no se leen y a z13 sí. Bajarlo dejaría un hueco sin nombres.
    expect(BASEMAPS.topografico.labelsFrom).toBe(12.5)
    expect(BASEMAPS.relieve.labelsFrom).toBeNull()
    expect(BASEMAPS.satelite.labelsFrom).toBeNull()
  })
})
