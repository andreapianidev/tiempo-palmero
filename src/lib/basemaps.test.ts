import { describe, expect, it } from 'vitest'
import { BASEMAPS, BASEMAP_ORDER, EXTERNAL_BASEMAPS } from './basemaps'
import { screenDensity } from './realce/density'

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

  /**
   * Los píxeles pedidos YA NO son los de la tesela declarada: son los que esa
   * tesela va a ocupar de verdad en la pantalla, o sea el lado por la densidad
   * (ver `realce/density.ts`). En los tests no hay `window`, así que la
   * densidad es 1 y las dos cosas coinciden — lo que se comprueba es que la
   * relación sea esa y que el cuadrado siga siendo cuadrado.
   */
  it('el tamaño pedido es el de la tesela por la densidad de la pantalla', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      const url = b.source.tiles![0]
      const want = b.source.tileSize! * screenDensity()
      expect(url, b.id).toContain(`width=${want}`)
      expect(url, b.id).toContain(`height=${want}`)
    }
  })

  it('y el formato es JPEG, que es el único que el servicio ofrece', () => {
    // Su GetCapabilities declara `image/jpeg` y nada más; pedirle PNG devuelve
    // un `ServiceException` con código `InvalidFormat`, que MapLibre no
    // distingue de una tesela vacía. Comprobado el 13 de agosto de 2026.
    for (const b of EXTERNAL_BASEMAPS) {
      expect(b.source.tiles![0], b.id).toContain('format=image%2Fjpeg')
    }
  })

  /**
   * Las dos orillas pesan igual, como en todo lo demás: el recuadro tiene que
   * cubrir la isla ENTERA —si se queda corto, la costa se dibuja sin fondo— y
   * no mucho más —cada grado de sobra es océano que GRAFCAN dibuja para nada—.
   *
   * El límite insular publicado por el Cabildo va de −18,008 a −17,724 y de
   * 28,453 a 28,858 (medido sobre `limite-insular.geojson` el 13 ago 2026).
   */
  it('cubren la isla entera', () => {
    for (const b of EXTERNAL_BASEMAPS) {
      const [w, s, e, n] = b.source.bounds!
      expect(w, b.id).toBeLessThanOrEqual(-18.008)
      expect(e, b.id).toBeGreaterThanOrEqual(-17.724)
      expect(s, b.id).toBeLessThanOrEqual(28.453)
      expect(n, b.id).toBeGreaterThanOrEqual(28.858)
    }
  })

  it('y no piden un océano de más', () => {
    // El área de la isla es 0,284° × 0,405°. Se admite hasta el triple de esa
    // superficie —margen de costa de sobra—; el recuadro viejo, que era el
    // `maxBounds` del mapa, pedía 8,3 veces.
    const islandArea = 0.284 * 0.405
    for (const b of EXTERNAL_BASEMAPS) {
      const [w, s, e, n] = b.source.bounds!
      expect((e - w) * (n - s) / islandArea, b.id).toBeLessThan(3)
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
