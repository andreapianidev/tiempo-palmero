/**
 * La rejilla de teselas de GRAFCAN, calculada igual que la calcula MapLibre.
 *
 * El precargador tiene que pedir EXACTAMENTE las mismas URL que pedirá el mapa,
 * o cada tesela se descargaría dos veces: una por delante y otra al mirarla,
 * con dos claves distintas en la caché. Como la plantilla WMS lleva
 * `{bbox-epsg-3857}` y esa sustitución la hace MapLibre por dentro, aquí está
 * transcrita su aritmética, operación por operación:
 *
 *   OverscaledTileID.url()  →  bbox = merc(256·x, 256·yFlip) + merc(256·(x+1), 256·(yFlip+1))
 *   merc(px, py, z)         →  [px·s − πR, py·s − πR],  s = 2πR / 256 / 2^z,  R = 6378137
 *   yFlip                   →  2^z − y − 1
 *
 * El `256` no es un error con teselas de 512: es una constante de normalización
 * de MapLibre, no el lado de la tesela. Y la vuelta del eje Y es la trampa —el
 * esquema de las URL es XYZ, con el origen arriba, y el bbox de un WMS va de
 * abajo hacia arriba—; una prueba comprueba que el recuadro de una tesela
 * contiene el punto del que se sacó.
 *
 * Las cifras salen a `String(number)` de JavaScript, sin redondear: es lo que
 * hace el `replace` de MapLibre y cualquier redondeo «para que quede limpio»
 * daría una clave distinta a la de la tesela que se pinta.
 */

/** Radio ecuatorial WGS84, el que usa la aritmética de MapLibre. */
const R = 6378137
/** Medio mundo en EPSG:3857, en metros. */
const HALF = Math.PI * R

export interface TileXY {
  z: number
  x: number
  y: number
}

export interface Bbox {
  west: number
  south: number
  east: number
  north: number
}

function mercator(px: number, py: number, z: number): [number, number] {
  const s = (2 * Math.PI * R) / 256 / 2 ** z
  return [px * s - HALF, py * s - HALF]
}

/** El `{bbox-epsg-3857}` de una tesela, carácter por carácter como lo escribe MapLibre. */
export function tileBboxParam({ z, x, y }: TileXY): string {
  const flip = 2 ** z - y - 1
  const a = mercator(256 * x, 256 * flip, z)
  const b = mercator(256 * (x + 1), 256 * (flip + 1), z)
  return `${a[0]},${a[1]},${b[0]},${b[1]}`
}

/** La URL real de una tesela a partir de la plantilla de la fuente raster. */
export function tileUrl(template: string, tile: TileXY): string {
  return template
    .replace(/{z}/g, String(tile.z))
    .replace(/{x}/g, String(tile.x))
    .replace(/{y}/g, String(tile.y))
    .replace(/{bbox-epsg-3857}/g, tileBboxParam(tile))
}

/** La tesela que contiene un punto, en el esquema XYZ (origen arriba a la izquierda). */
export function tileAt(lon: number, lat: number, z: number): TileXY {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return { z, x: clamp(x, n), y: clamp(y, n) }
}

const clamp = (v: number, n: number) => Math.min(n - 1, Math.max(0, v))

/** Todas las teselas de un nivel que tocan un recuadro. */
export function tilesInBbox(bbox: Bbox, z: number): TileXY[] {
  const a = tileAt(bbox.west, bbox.north, z)
  const b = tileAt(bbox.east, bbox.south, z)
  const out: TileXY[] = []
  for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) out.push({ z, x, y })
  return out
}

/**
 * El nivel de tesela que va a pedir una fuente raster de 512 con la cámara en
 * `zoom`.
 *
 * `Transform.coveringZoomLevel` de MapLibre: `roundZoom` está activo en las
 * fuentes raster y el factor de escala entre el lado de la transformación (512)
 * y el de la fuente (512) es 1, así que se reduce a redondear. Recortado
 * después por el `minzoom`/`maxzoom` que declara la fuente, que en los fondos
 * de GRAFCAN son 8 y 17 (`basemaps.ts`).
 */
export function rasterTileZoom(zoom: number, minzoom: number, maxzoom: number): number {
  return Math.min(maxzoom, Math.max(minzoom, Math.round(zoom)))
}
