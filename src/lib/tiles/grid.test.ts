import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  rasterTileZoom,
  tileAt,
  tileBboxParam,
  tileUrl,
  tilesInBbox,
} from './grid'
import { ISLAND_BBOX } from '../geo'
import type { DemManifest } from '../dem'

/**
 * La rejilla tiene que dar EXACTAMENTE lo que da MapLibre.
 *
 * Si no, cada tesela se descargaría dos veces —una al precargarla y otra al
 * mirarla, con dos claves distintas— y la caché haría lo contrario de lo que
 * existe para hacer: pedirle más a GRAFCAN, no menos. Y no daría ningún error:
 * las dos URL son válidas y las dos devuelven una imagen correcta.
 */
describe('rejilla de teselas', () => {
  /**
   * El anclaje externo: el manifiesto del DEM.
   *
   * `prepare-data.ts` calculó `x0`, `y0`, `cols` y `rows` por su cuenta, con
   * otra aritmética —píxeles globales y no fracciones de mundo— y en otro
   * momento, para recortar las teselas terrarium de `public/dem/`. Si las dos
   * rejillas coinciden, no es que dos copias del mismo error se den la razón:
   * son dos caminos independientes al mismo número.
   *
   * Con una salvedad que está escrita allí: `tileRange()` añade un margen de
   * una tesela por cada lado, porque el DEM y el polígono de la costa no tienen
   * por qué acabar en el mismo sitio. Aquí no hay margen —se pide lo que se
   * mira—, así que la comparación es contra el rectángulo del manifiesto
   * encogido en uno.
   */
  it('cae en las mismas teselas que el manifiesto del DEM', () => {
    const dem = JSON.parse(readFileSync('public/dem/manifest.json', 'utf8')) as DemManifest
    const MARGEN = 1
    const tiles = tilesInBbox(ISLAND_BBOX, dem.zoom)
    const xs = tiles.map((t) => t.x)
    const ys = tiles.map((t) => t.y)
    expect(Math.min(...xs)).toBe(dem.x0 + MARGEN)
    expect(Math.min(...ys)).toBe(dem.y0 + MARGEN)
    expect(Math.max(...xs)).toBe(dem.x0 + dem.cols - 1 - MARGEN)
    expect(Math.max(...ys)).toBe(dem.y0 + dem.rows - 1 - MARGEN)
  })

  /**
   * La vuelta del eje Y es la trampa de esta aritmética: el esquema de las URL
   * es XYZ, con el origen arriba, y el bbox de un WMS va de abajo hacia arriba.
   * Invertirla no rompe nada visible —siguen llegando imágenes— y pinta la isla
   * reflejada en el paralelo.
   */
  it('el recuadro de una tesela contiene el punto del que salió', () => {
    const R = 6378137
    const merc = (lon: number, lat: number) => [
      (lon * Math.PI * R) / 180,
      R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
    ]
    for (const [lon, lat] of [
      [-17.885, 28.754], // Roque de los Muchachos
      [-17.917, 28.61], // Los Llanos de Aridane
      [-17.764, 28.681], // Santa Cruz de La Palma
    ]) {
      for (const z of [9, 12, 15, 17]) {
        const [minx, miny, maxx, maxy] = tileBboxParam(tileAt(lon, lat, z))
          .split(',')
          .map(Number)
        const [x, y] = merc(lon, lat)
        expect(x, `z${z} lon`).toBeGreaterThanOrEqual(minx)
        expect(x, `z${z} lon`).toBeLessThanOrEqual(maxx)
        expect(y, `z${z} lat`).toBeGreaterThanOrEqual(miny)
        expect(y, `z${z} lat`).toBeLessThanOrEqual(maxy)
      }
    }
  })

  /** Dos teselas contiguas comparten borde, y como CADENA: la clave es la URL. */
  it('el borde de una tesela es el mismo texto que el de su vecina', () => {
    const a = tileBboxParam({ z: 14, x: 7365, y: 6814 }).split(',')
    const este = tileBboxParam({ z: 14, x: 7366, y: 6814 }).split(',')
    const sur = tileBboxParam({ z: 14, x: 7365, y: 6815 }).split(',')
    expect(a[2]).toBe(este[0])
    expect(a[1]).toBe(sur[3])
  })

  it('sustituye el bbox sin dejar la plantilla dentro', () => {
    const url = tileUrl(
      'https://idecan1.grafcan.es/ServicioWMS/Ortofoto?width=1024&bbox={bbox-epsg-3857}',
      tileAt(-17.917, 28.61, 16),
    )
    expect(url).not.toContain('{')
    const bbox = new URL(url).searchParams.get('bbox')!.split(',').map(Number)
    expect(bbox).toHaveLength(4)
    expect(bbox.every(Number.isFinite)).toBe(true)
    // minx < maxx y miny < maxy: un bbox invertido lo rechaza el servicio con
    // un XML de excepción que MapLibre pinta como una tesela en blanco.
    expect(bbox[0]).toBeLessThan(bbox[2])
    expect(bbox[1]).toBeLessThan(bbox[3])
  })

  /**
   * El nivel que pide una fuente raster de 512 es el zoom redondeado, recortado
   * por el techo de la fuente. Con los valores de `basemaps.ts`: 8 y 17.
   */
  it('redondea el zoom y respeta el techo de la fuente', () => {
    expect(rasterTileZoom(9.6, 8, 17)).toBe(10)
    expect(rasterTileZoom(16.4, 8, 17)).toBe(16)
    expect(rasterTileZoom(16.6, 8, 17)).toBe(17)
    // La cámara llega a 17 y la fuente también: por encima no hay más que pedir.
    expect(rasterTileZoom(17, 8, 17)).toBe(17)
    expect(rasterTileZoom(8.5, 8, 17)).toBe(9)
  })
})
