/**
 * Leer el catálogo de estrellas: del binario a lo que la tarjeta gráfica pide.
 *
 * QUÉ SALE DE AQUÍ. Un único `Float32Array` entrelazado con seis números por
 * estrella —ascensión recta, declinación, magnitud y el color ya resuelto— y
 * un `Int16Array` aparte solo con las magnitudes, que es sobre el que se hace
 * la búsqueda binaria del corte. Son 214 KB de búfer para 8920 estrellas, y
 * suben a la GPU una sola vez.
 *
 * EL COLOR SE RESUELVE AQUÍ Y NO EN EL SOMBREADOR porque no cambia nunca: el
 * índice B−V del catálogo se convierte a temperatura y a sRGB al cargar. Ver
 * `color.ts`.
 *
 * EL ORDEN DEL FICHERO ES PARTE DEL FORMATO. Viene de `prepare-cielo.ts`
 * ordenado de más brillante a más débil, y esa garantía es la que permite
 * dibujar «las primeras k» en vez de recorrerlas todas. Si alguien reordena el
 * fichero, esto lo comprueba al cargar y se niega: un catálogo desordenado no
 * daría un error, daría un cielo al que le faltan las estrellas equivocadas.
 */

import { dataUrl } from '../endpoints'
import { starColor } from './color'

const MAGIC = 'TPCIELO1'
const HEADER = 24
const RECORD = 12
/** Números por estrella en el búfer de vértices: ra, dec, mag, r, g, b. */
export const STRIDE_FLOATS = 6

export interface StarCatalog {
  count: number
  /** Magnitud del corte del fichero. */
  magLimit: number
  /** Época de las posiciones, día juliano. Ya lleva el movimiento propio. */
  epochJd: number
  /** Entrelazado, `STRIDE_FLOATS` por estrella. Listo para un solo VBO. */
  vertices: Float32Array
  /** Magnitudes × 100, ordenadas. Para el corte por búsqueda binaria. */
  magnitudes: Int16Array
}

export interface ConstellationFigures {
  /** Parejas de índices al catálogo, dos por segmento. */
  segments: Uint16Array
}

function decodeCatalog(buffer: ArrayBuffer): StarCatalog {
  const view = new DataView(buffer)
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8))
  if (magic !== MAGIC) throw new Error(`el catálogo no empieza por ${MAGIC}`)
  const count = view.getUint32(8, true)
  const magLimit = view.getFloat32(12, true)
  const epochJd = view.getFloat64(16, true)
  if (buffer.byteLength !== HEADER + count * RECORD) {
    throw new Error(
      `el catálogo dice ${count} estrellas y mide ${buffer.byteLength} bytes`,
    )
  }

  const vertices = new Float32Array(count * STRIDE_FLOATS)
  const magnitudes = new Int16Array(count)
  let previous = -32768
  for (let i = 0; i < count; i++) {
    const o = HEADER + i * RECORD
    const ra = view.getFloat32(o, true)
    const dec = view.getFloat32(o + 4, true)
    const mag = view.getInt16(o + 8, true)
    const rawBv = view.getInt16(o + 10, true)
    if (mag < previous) {
      throw new Error(
        `el catálogo no viene ordenado por magnitud: la estrella ${i} es más ` +
          `brillante que la anterior. El corte por magnitud límite depende de ese orden.`,
      )
    }
    previous = mag
    magnitudes[i] = mag
    const [r, g, b] = starColor(rawBv === -32768 ? null : rawBv / 1000)
    const v = i * STRIDE_FLOATS
    vertices[v] = ra
    vertices[v + 1] = dec
    vertices[v + 2] = mag / 100
    vertices[v + 3] = r
    vertices[v + 4] = g
    vertices[v + 5] = b
  }
  return { count, magLimit, epochJd, vertices, magnitudes }
}

function decodeFigures(buffer: ArrayBuffer, starCount: number): ConstellationFigures {
  const view = new DataView(buffer)
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8))
  if (magic !== 'TPFIGUR1') throw new Error('las figuras no empiezan por TPFIGUR1')
  const segments = view.getUint32(8, true)
  const out = new Uint16Array(segments * 2)
  for (let i = 0; i < segments; i++) {
    const a = view.getUint16(12 + i * 4, true)
    const b = view.getUint16(12 + i * 4 + 2, true)
    // Un índice fuera de rango sería una figura colgando de una estrella que no
    // existe, y en la GPU se leería como basura silenciosa.
    if (a >= starCount || b >= starCount) {
      throw new Error(`el segmento ${i} apunta fuera del catálogo (${a}, ${b})`)
    }
    out[i * 2] = a
    out[i * 2 + 1] = b
  }
  return { segments: out }
}

export interface StarNameEntry {
  /** Índice en el catálogo. */
  i: number
  /** Nombre propio de la UAI, cuando lo tiene. */
  n?: string
  /** Designación de Bayer con la constelación, p. ej. «Alp CMa». */
  b?: string
  m: number
}

export interface SkyData {
  catalog: StarCatalog
  figures: ConstellationFigures
  names: StarNameEntry[]
}

/**
 * Descarga las tres piezas a la vez.
 *
 * Van juntas y no en tres llamadas separadas porque las figuras no significan
 * nada sin el catálogo —son índices— y porque las tres se piden una sola vez en
 * la vida de la pestaña. Si una falla, falla el conjunto: media escena nocturna
 * es peor que ninguna.
 */
export async function fetchSkyData(): Promise<SkyData> {
  const [starsRes, figuresRes, namesRes] = await Promise.all([
    fetch(dataUrl('/cielo/estrellas.bin')),
    fetch(dataUrl('/cielo/figuras.bin')),
    fetch(dataUrl('/cielo/nombres.json')),
  ])
  if (!starsRes.ok) throw new Error(`estrellas.bin: HTTP ${starsRes.status}`)
  if (!figuresRes.ok) throw new Error(`figuras.bin: HTTP ${figuresRes.status}`)
  if (!namesRes.ok) throw new Error(`nombres.json: HTTP ${namesRes.status}`)

  const catalog = decodeCatalog(await starsRes.arrayBuffer())
  const figures = decodeFigures(await figuresRes.arrayBuffer(), catalog.count)
  const names = (await namesRes.json()) as StarNameEntry[]
  return { catalog, figures, names }
}

export { decodeCatalog, decodeFigures }
