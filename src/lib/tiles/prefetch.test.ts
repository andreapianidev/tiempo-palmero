import { describe, expect, it } from 'vitest'
import { INTENT_MAX_TILES, OVERVIEW_ZOOMS, PREFETCH_MAX_TILES } from './budget'
import { ISLAND_BBOX } from '../geo'
import { leadingEdgeTiles, overviewTiles, viewTiles, zoomInTiles } from './prefetch'
import { cachedUrl, cacheKey, plainUrl } from './key'
import { tileAt, tilesInBbox, tileUrl } from './grid'

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
 * El peor caso medido: una pantalla 4K a z11 sobre el Roque, 54 teselas. Sale
 * de `scripts/checks/pantalla-teselas.ts`, que imprime este bbox para no tener
 * que recalcularlo aquí.
 */
const ANCHA = {
  west: -18.5441796875,
  south: 28.42842742785921,
  east: -17.2258203125,
  north: 29.078560614343502,
  zoom: 11,
}
const centroDe = (v: typeof ANCHA) =>
  tileAt((v.west + v.east) / 2, (v.south + v.north) / 2, v.zoom)
const anilloDe = (v: typeof ANCHA) => {
  const c = centroDe(v)
  return (t: { x: number; y: number }) => Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y))
}

describe('el encuadre que se precarga al rozar un chip del selector', () => {
  it('la ventana de un portátil cabe entera y se pide tal cual', () => {
    // 20 teselas, por debajo del cupo de 24: en el portátil de cualquiera la
    // precarga por intención trae la pantalla completa y no un recorte.
    expect(tilesInBbox(VISTA, VISTA.zoom)).toHaveLength(20)
    expect(viewTiles(VISTA)).toEqual(tilesInBbox(VISTA, VISTA.zoom))
  })

  it('una pantalla 4K sí se recorta: 54 teselas no se piden por si acaso', () => {
    expect(tilesInBbox(ANCHA, ANCHA.zoom)).toHaveLength(54)
    expect(viewTiles(ANCHA)).toHaveLength(INTENT_MAX_TILES)
  })

  it('lo que se cae es el borde, nunca el centro', () => {
    // Es la mitad de la función: quien va a pulsar está mirando el centro, así
    // que el recorte tiene que comerse los anillos de fuera. Se comprueba que
    // ninguna descartada esté más cerca del centro que la más lejana que entra.
    const dentro = viewTiles(ANCHA)
    const anillo = anilloDe(ANCHA)
    const c = centroDe(ANCHA)
    expect(dentro.some((t) => t.x === c.x && t.y === c.y)).toBe(true)
    const fuera = tilesInBbox(ANCHA, ANCHA.zoom).filter(
      (t) => !dentro.some((d) => d.x === t.x && d.y === t.y),
    )
    expect(Math.min(...fuera.map(anillo))).toBeGreaterThanOrEqual(
      Math.max(...dentro.map(anillo)),
    )
  })

  it('dos llamadas con los mismos datos dan la misma lista', () => {
    // Un recorte que dependa del orden en que salieron las teselas es
    // imposible de probar y llena la caché de cosas distintas en cada sesión.
    expect(viewTiles(ANCHA)).toEqual(viewTiles(ANCHA))
  })

  it('no repite teselas', () => {
    const claves = viewTiles(ANCHA).map((t) => `${t.z}/${t.x}/${t.y}`)
    expect(new Set(claves).size).toBe(claves.length)
  })
})

describe('el paso siguiente del zoom', () => {
  it('son las cuatro hijas de la tesela del centro, y nada más', () => {
    const tiles = zoomInTiles(VISTA, 17)
    expect(tiles).toHaveLength(4)
    const c = tileAt(CENTRO.lon, CENTRO.lat, VISTA.zoom)
    for (const t of tiles) {
      expect(t.z).toBe(VISTA.zoom + 1)
      expect(Math.floor(t.x / 2)).toBe(c.x)
      expect(Math.floor(t.y / 2)).toBe(c.y)
    }
    expect(new Set(tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(4)
  })

  it('no crece con la ventana: son cuatro también en una 4K', () => {
    // Es la diferencia con precargar la pantalla del nivel siguiente, que en
    // una 4K serían 54. Cuatro teselas son 0,9 MB a la mediana de 230 kB.
    expect(zoomInTiles(ANCHA, 17)).toHaveLength(4)
  })

  it('en el techo de la fuente no pide nada', () => {
    // Los dos fondos de GRAFCAN declaran maxzoom 17: pedir el z18 sería bajarse
    // teselas que el estilo no va a dibujar nunca.
    expect(zoomInTiles({ ...VISTA, zoom: 17 }, 17)).toEqual([])
    expect(zoomInTiles({ ...VISTA, zoom: 18 }, 17)).toEqual([])
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
