/**
 * Campos que solo existen donde alguien midió.
 *
 * QUÉ TIENEN EN COMÚN el CO₂ de Puerto Naos y la cobertura móvil, que a
 * primera vista no se parecen en nada: los dos son medidas de puntos sueltos
 * que NO se pueden promediar entre sí. En el CO₂ porque promediar 400 y 69 301
 * ppm dibuja una pluma que no existe y baja un dato de seguridad; en la
 * cobertura porque la señal la corta el relieve —dos puntos a 400 m con un
 * barranco en medio no tienen por qué parecerse— y una media inventaría
 * cobertura justo en las sombras de radio, que es lo único que interesa saber.
 *
 * LA RECETA, la misma para los dos: cada celda toma el valor del punto medido
 * MÁS CERCANO, y solo hasta `radiusM`. Nada se promedia y nada se estira: el
 * color de un píxel es siempre una medida real tomada a menos de ese radio.
 * Más allá, transparente — que es la respuesta correcta, no un hueco.
 *
 * Y el color va por TRAMOS, nunca en degradado. Un gradiente afirma que entre
 * dos colores hay un continuo; estos campos tienen umbrales de decisión, y el
 * color tiene que saltar ahí en vez de disolverse.
 */

import { M_PER_DEG_LAT, M_PER_DEG_LON } from './geo'

export interface FieldNode {
  lon: number
  lat: number
  value: number
}

export interface MaskedField {
  nodes: FieldNode[]
  /** [[oeste, sur], [este, norte]] en grados, con el margen de máscara sumado. */
  bounds: [[number, number], [number, number]]
  /** Hasta dónde llega una medida, en metros. */
  radiusM: number
  /** Lado de la celda del raster, en metros. */
  cellM: number
  /** Color de un valor. Escalonado: ver la nota de arriba. */
  colorOf: (value: number) => string
}

// Vive en `geo.ts`, que es donde está el resto de la geodesia. Se reexporta
// para no romper a quien ya lo importaba de aquí.
export { M_PER_DEG_LAT }

export function mPerDegLon(lat: number): number {
  return M_PER_DEG_LON * Math.cos((lat * Math.PI) / 180)
}

/**
 * Monta el campo y su marco. `null` si no queda ni un punto: un campo vacío no
 * es un campo con cero puntos, es la ausencia de campo, y quien llama tiene
 * que poder distinguirlo para no pintar una capa en blanco.
 */
export function buildMaskedField(
  nodes: readonly FieldNode[],
  opts: { radiusM: number; cellM: number; colorOf: (value: number) => string },
): MaskedField | null {
  const kept = nodes.filter(
    (n) => Number.isFinite(n.lon) && Number.isFinite(n.lat) && Number.isFinite(n.value),
  )
  if (!kept.length) return null

  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const p of kept) {
    if (p.lon < west) west = p.lon
    if (p.lon > east) east = p.lon
    if (p.lat < south) south = p.lat
    if (p.lat > north) north = p.lat
  }
  const padLat = opts.radiusM / M_PER_DEG_LAT
  const padLon = opts.radiusM / mPerDegLon((south + north) / 2)

  return {
    nodes: [...kept],
    bounds: [
      [west - padLon, south - padLat],
      [east + padLon, north + padLat],
    ],
    radiusM: opts.radiusM,
    cellM: opts.cellM,
    colorOf: opts.colorOf,
  }
}

/** El valor del punto medido más cercano, o `null` si no hay ninguno cerca. */
export function sampleMasked(
  field: MaskedField,
  lon: number,
  lat: number,
): number | null {
  const kx = mPerDegLon(lat)
  let best = field.radiusM
  let value: number | null = null
  for (const p of field.nodes) {
    const d = Math.hypot((p.lon - lon) * kx, (p.lat - lat) * M_PER_DEG_LAT)
    if (d <= best) {
      best = d
      value = p.value
    }
  }
  return value
}

export interface MaskedRaster {
  /** RGBA, fila mayor, `cols × rows`. Fuera de la máscara, alfa 0. */
  pixels: Uint8ClampedArray<ArrayBuffer>
  cols: number
  rows: number
  bounds: [[number, number], [number, number]]
  /** Celdas pintadas: superficie con una medida dentro del radio. */
  paintedCells: number
  cellMeters: number
}

/**
 * El campo, en píxeles.
 *
 * Se recorren los PUNTOS pintando su disco, no las celdas buscando puntos: el
 * marco de estos campos es casi todo transparente, y barrerlo entero costaría
 * cien veces más para llegar al mismo sitio. Un buffer con la distancia al
 * punto que ya pintó cada celda es lo que convierte «pintar discos» en «gana
 * el más cercano» sin comparar cada celda con todos los puntos.
 */
export function rasterizeMasked(
  field: MaskedField,
  opts: { opacity?: number } = {},
): MaskedRaster {
  const { opacity = 0.78 } = opts
  const [[west, south], [east, north]] = field.bounds
  const cell = field.cellM
  const kx = mPerDegLon((south + north) / 2)

  const cols = Math.max(1, Math.ceil(((east - west) * kx) / cell))
  const rows = Math.max(1, Math.ceil(((north - south) * M_PER_DEG_LAT) / cell))

  const pixels = new Uint8ClampedArray(cols * rows * 4)
  const best = new Float32Array(cols * rows).fill(Infinity)
  const alpha = Math.round(opacity * 255)
  const radiusCells = Math.ceil(field.radiusM / cell)

  let paintedCells = 0
  for (const p of field.nodes) {
    // La fila 0 es la del norte: la latitud baja según sube j, como en
    // cualquier imagen.
    const ci = ((p.lon - west) * kx) / cell
    const cj = ((north - p.lat) * M_PER_DEG_LAT) / cell
    const [r, g, b] = hexToRgb(field.colorOf(p.value))

    const i0 = Math.max(0, Math.floor(ci - radiusCells))
    const i1 = Math.min(cols - 1, Math.ceil(ci + radiusCells))
    const j0 = Math.max(0, Math.floor(cj - radiusCells))
    const j1 = Math.min(rows - 1, Math.ceil(cj + radiusCells))

    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5 - cj) * cell
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5 - ci) * cell
        const d = Math.hypot(dx, dy)
        if (d > field.radiusM) continue
        const k = j * cols + i
        if (d >= best[k]) continue
        if (best[k] === Infinity) paintedCells++
        best[k] = d
        const o = k * 4
        pixels[o] = r
        pixels[o + 1] = g
        pixels[o + 2] = b
        pixels[o + 3] = alpha
      }
    }
  }

  return { pixels, cols, rows, bounds: field.bounds, paintedCells, cellMeters: cell }
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}
