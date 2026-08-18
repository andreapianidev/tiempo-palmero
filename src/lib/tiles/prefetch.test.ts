import { describe, expect, it } from 'vitest'
import { OVERVIEW_ZOOMS, PREFETCH_MAX_TILES } from './budget'
import { ISLAND_BBOX } from '../geo'
import { leadingEdgeTiles, overviewTiles } from './prefetch'
import { cachedUrl, cacheKey, plainUrl } from './key'
import { tileUrl } from './grid'

/**
 * Lo que se pide por delante tiene DOS orillas, y la segunda es la que se
 * olvida: que no se pida de más.
 *
 * Al otro lado hay un servicio público cuya licencia dice «se prohíbe la
 * descarga masiva de información». Una precarga que se anima y baja un anillo
 * entero por cada parada, o que se lanza al soltar el ratón sin haberse movido,
 * convierte una mejora en un abuso. Por eso aquí se comprueba tanto que
 * adelante trabajo como que NO pida nada cuando no toca.
 */
describe('la vista de lejos', () => {
  it('son las 17 teselas medidas, ni una más', () => {
    const tiles = overviewTiles(ISLAND_BBOX)
    // 1 (z9) + 4 (z10) + 12 (z11), medido el 18 ago 2026 con
    // `scripts/checks/grafcan-cache.ts`: unos 720-740 kB la ortofoto y unos
    // 900-1040 kB el MT20, que el WMS recomprime en cada petición.
    expect(tiles).toHaveLength(17)
    expect(new Set(tiles.map((t) => t.z))).toEqual(new Set(OVERVIEW_ZOOMS))
  })

  it('no baja al z12, que triplicaría la factura', () => {
    // 35 teselas más y de 3,3 a 4,7 MB por fondo. El z11 ampliado ya tapa el
    // hueco mientras llegan las de verdad.
    expect(overviewTiles(ISLAND_BBOX).some((t) => t.z >= 12)).toBe(false)
  })

  it('va de lo grueso a lo fino, para que un corte deje lo más útil', () => {
    const zooms = overviewTiles(ISLAND_BBOX).map((t) => t.z)
    expect(zooms).toEqual([...zooms].sort((a, b) => a - b))
  })

  it('cubre la isla entera a cada nivel', () => {
    // El Roque, Los Llanos y Santa Cruz caen dentro en los tres niveles.
    for (const z of OVERVIEW_ZOOMS) {
      const nivel = overviewTiles(ISLAND_BBOX).filter((t) => t.z === z)
      const n = 2 ** z
      for (const [lon, lat] of [
        [-17.885, 28.754],
        [-17.917, 28.61],
        [-17.764, 28.681],
      ]) {
        const x = Math.floor(((lon + 180) / 360) * n)
        const rad = (lat * Math.PI) / 180
        const y = Math.floor(
          ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
        )
        expect(nivel.some((t) => t.x === x && t.y === y), `z${z} ${lon},${lat}`).toBe(true)
      }
    }
  })
})

/** Una ventana de 1440 × 900 sobre Los Llanos, a z14. */
const VISTA = { west: -17.96, south: 28.58, east: -17.87, north: 28.65, zoom: 14 }
const CENTRO = { lon: (VISTA.west + VISTA.east) / 2, lat: (VISTA.south + VISTA.north) / 2 }

describe('el borde por el que se sale', () => {
  it('no pide nada si el mapa no se movió', () => {
    expect(leadingEdgeTiles(CENTRO, VISTA)).toEqual([])
  })

  it('no pide nada por el temblor de soltar el ratón', () => {
    // Un 2 % del ancho de la ventana: eso no es un arrastre.
    const casi = { lon: CENTRO.lon - (VISTA.east - VISTA.west) * 0.02, lat: CENTRO.lat }
    expect(leadingEdgeTiles(casi, VISTA)).toEqual([])
  })

  it('yendo al este pide la columna de la derecha, y solo esa', () => {
    const desde = { lon: CENTRO.lon - 0.05, lat: CENTRO.lat }
    const tiles = leadingEdgeTiles(desde, VISTA)
    expect(tiles.length).toBeGreaterThan(0)
    const xs = new Set(tiles.map((t) => t.x))
    expect(xs.size).toBe(1)
    // Justo una más allá del borde derecho de lo que se ve.
    const n = 2 ** VISTA.zoom
    const xMax = Math.floor(((VISTA.east + 180) / 360) * n)
    expect([...xs][0]).toBe(xMax + 1)
  })

  it('yendo al norte pide la fila de arriba: en XYZ eso es la Y menor', () => {
    const desde = { lon: CENTRO.lon, lat: CENTRO.lat - 0.04 }
    const tiles = leadingEdgeTiles(desde, VISTA)
    expect(tiles.length).toBeGreaterThan(0)
    const ys = new Set(tiles.map((t) => t.y))
    expect(ys.size).toBe(1)
    const n = 2 ** VISTA.zoom
    const rad = (VISTA.north * Math.PI) / 180
    const yMin = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
    expect([...ys][0]).toBe(yMin - 1)
  })

  it('en diagonal pide los dos lados, y nunca pasa del cupo', () => {
    const desde = { lon: CENTRO.lon - 0.05, lat: CENTRO.lat - 0.04 }
    const tiles = leadingEdgeTiles(desde, VISTA)
    expect(new Set(tiles.map((t) => t.x)).size).toBeGreaterThan(1)
    expect(tiles.length).toBeLessThanOrEqual(PREFETCH_MAX_TILES)
  })

  it('nunca pide más de 8 teselas, ni con la ventana de un monitor grande', () => {
    const ancha = { west: -18.1, south: 28.3, east: -17.6, north: 28.95, zoom: 15 }
    const desde = { lon: -18.3, lat: 28.2 }
    expect(leadingEdgeTiles(desde, ancha).length).toBeLessThanOrEqual(PREFETCH_MAX_TILES)
  })

  it('no repite teselas', () => {
    const desde = { lon: CENTRO.lon - 0.05, lat: CENTRO.lat - 0.04 }
    const tiles = leadingEdgeTiles(desde, VISTA)
    const claves = tiles.map((t) => `${t.z}/${t.x}/${t.y}`)
    expect(new Set(claves).size).toBe(claves.length)
  })
})

/**
 * La clave con la que precarga y la clave con la que pinta tienen que ser la
 * misma cadena. Si no lo son, cada tesela se baja dos veces y la caché
 * multiplica el tráfico a GRAFCAN en vez de dividirlo — sin dar ningún error,
 * porque las dos URL son válidas.
 */
describe('la clave de una tesela', () => {
  const PLANTILLA =
    'https://idecan1.grafcan.es/ServicioWMS/Ortofoto?service=WMS&width=1024&bbox={bbox-epsg-3857}'

  it('el ida y vuelta del protocolo devuelve la URL intacta', () => {
    const url = tileUrl(PLANTILLA, { z: 14, x: 7365, y: 6814 })
    expect(plainUrl(cachedUrl(url))).toBe(url)
  })

  it('el prefijo no se pone dos veces', () => {
    const url = tileUrl(PLANTILLA, { z: 14, x: 7365, y: 6814 })
    expect(cachedUrl(cachedUrl(url))).toBe(cachedUrl(url))
  })

  it('el `https://` de dentro sobrevive: el prefijo se corta por longitud', () => {
    // `params.url.split('://')[1]`, que es lo que sugiere la documentación de
    // MapLibre, devolvería aquí `idecan1.grafcan.es/...` sin esquema.
    expect(plainUrl(cachedUrl('https://a.es/x'))).toBe('https://a.es/x')
  })

  it('la clave de la precarga es la de la tesela que se pinta', () => {
    const url = tileUrl(PLANTILLA, { z: 14, x: 7365, y: 6814 })
    expect(cacheKey(url)).toBe(cacheKey(cachedUrl(url)))
  })

  it('dos densidades de pantalla son dos claves distintas', () => {
    const tile = { z: 14, x: 7365, y: 6814 }
    const a = tileUrl(PLANTILLA, tile)
    const b = tileUrl(PLANTILLA.replace('width=1024', 'width=512'), tile)
    expect(cacheKey(a)).not.toBe(cacheKey(b))
  })
})
