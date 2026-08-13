/**
 * Geometría, sin dependencias. Se usa tanto en el script de build (Node)
 * como en el navegador, así que aquí no puede entrar nada de DOM.
 */

export type LonLat = [number, number] // SIEMPRE [lon, lat], como GeoJSON

/** Bounding box de La Palma, con margen. Fuente: bbox insular + holgura. */
export const ISLAND_BBOX = { west: -18.05, east: -17.7, south: 28.4, north: 28.9 } as const

/**
 * Hasta dónde se puede arrastrar la vista: el rectángulo que limita el mapa.
 *
 * Está aquí y no escrito a mano en `MapView` porque hay dos cosas que tienen que
 * usar EXACTAMENTE el mismo rectángulo: el `maxBounds` del mapa y la batimetría
 * que se descarga en build. Si el mar simulado cubriera menos que lo que se
 * puede arrastrar, al llegar al borde aparecería el vacío; si cubriera más,
 * serían kilobytes de fondo oceánico que nadie va a ver nunca.
 *
 * Son 92,5 × 111 km alrededor de una isla de 27,7 × 45: sitio para alejarse
 * hasta verla entera con horizonte por los cuatro lados, y ni un grado más.
 */
export const MAP_BBOX = { west: -18.35, east: -17.4, south: 28.15, north: 29.15 } as const

export function inIslandBbox(lon: number, lat: number): boolean {
  return (
    lon > ISLAND_BBOX.west &&
    lon < ISLAND_BBOX.east &&
    lat > ISLAND_BBOX.south &&
    lat < ISLAND_BBOX.north
  )
}

const R_EARTH_KM = 6371.0088

/** Distancia de círculo máximo en km. */
export function haversineKm(a: LonLat, b: LonLat): number {
  const p1 = (a[1] * Math.PI) / 180
  const p2 = (b[1] * Math.PI) / 180
  const dp = p2 - p1
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ---------------------------------------------------------------------------
// Proyección Web Mercator ↔ píxel de tesela (para el DEM terrarium)
// ---------------------------------------------------------------------------

export const TILE_SIZE = 256

export function lonToPixelX(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE_SIZE * 2 ** z
}

export function latToPixelY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180
  const y = Math.log(Math.tan(r) + 1 / Math.cos(r))
  return ((1 - y / Math.PI) / 2) * TILE_SIZE * 2 ** z
}

export function pixelXToLon(px: number, z: number): number {
  return (px / (TILE_SIZE * 2 ** z)) * 360 - 180
}

export function pixelYToLat(py: number, z: number): number {
  const n = Math.PI * (1 - (2 * py) / (TILE_SIZE * 2 ** z))
  return (180 / Math.PI) * Math.atan(Math.sinh(n))
}

/** Metros por píxel del DEM a una latitud dada. Sirve para declarar la resolución real. */
export function metersPerPixel(lat: number, z: number): number {
  return (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / 2 ** z
}

// ---------------------------------------------------------------------------
// EPSG:32628 (UTM 28N) → EPSG:4326
// `la_palma_municipios_240701` es el único GeoJSON del portal que no es WGS84.
// Transformación inversa exacta a ~4 mm contra el KML del propio portal, así
// que no hace falta pyproj ni proj4 en ninguno de los dos lados.
// ---------------------------------------------------------------------------

export function utm28nToWgs84(E: number, N: number, zone = 28): LonLat {
  const a = 6378137.0
  const f = 1 / 298.257223563
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const x = E - 500000.0
  const y = N
  const mu = y / k0 / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256))
  const p =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const ep2 = e2 / (1 - e2)
  const C = ep2 * Math.cos(p) ** 2
  const T = Math.tan(p) ** 2
  const Nn = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2)
  const Rr = (a * (1 - e2)) / (1 - e2 * Math.sin(p) ** 2) ** 1.5
  const D = x / (Nn * k0)
  const lat =
    p -
    ((Nn * Math.tan(p)) / Rr) *
      (D ** 2 / 2 -
        ((5 + 3 * T + 10 * C - 4 * C ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T + 298 * C + 45 * T ** 2 - 252 * ep2 - 3 * C ** 2) * D ** 6) / 720)
  const lon =
    (D -
      ((1 + 2 * T + C) * D ** 3) / 6 +
      ((5 - 2 * C + 28 * T - 3 * C ** 2 + 8 * ep2 + 24 * T ** 2) * D ** 5) / 120) /
    Math.cos(p)
  return [zone * 6 - 183 + (lon * 180) / Math.PI, (lat * 180) / Math.PI]
}

// ---------------------------------------------------------------------------
// Point-in-polygon (ray casting), con soporte de anillos interiores
// ---------------------------------------------------------------------------

type Ring = number[][]

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** `polygon` es un array de anillos: [exterior, ...huecos]. */
export function pointInPolygon(lon: number, lat: number, polygon: Ring[]): boolean {
  if (!polygon.length || !pointInRing(lon, lat, polygon[0])) return false
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lon, lat, polygon[i])) return false // cae en un hueco
  }
  return true
}

export interface NamedArea {
  name: string
  polygons: Ring[][] // MultiPolygon
  bbox: [number, number, number, number] // [w, s, e, n], para descartar rápido
}

export function bboxOfMultiPolygon(polygons: Ring[][]): [number, number, number, number] {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity
  for (const poly of polygons) {
    for (const [lon, lat] of poly[0]) {
      if (lon < w) w = lon
      if (lon > e) e = lon
      if (lat < s) s = lat
      if (lat > n) n = lat
    }
  }
  return [w, s, e, n]
}

/** Devuelve el nombre del área que contiene el punto, o null (mar / fuera). */
export function areaContaining(lon: number, lat: number, areas: NamedArea[]): string | null {
  for (const area of areas) {
    const [w, s, e, n] = area.bbox
    if (lon < w || lon > e || lat < s || lat > n) continue
    for (const poly of area.polygons) {
      if (pointInPolygon(lon, lat, poly)) return area.name
    }
  }
  return null
}

/** Normaliza un GeoJSON Polygon/MultiPolygon a lista de polígonos. */
export function toMultiPolygon(geometry: {
  type: string
  coordinates: unknown
}): Ring[][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as Ring[]]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Ring[][]
  return []
}
