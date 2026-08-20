/**
 * La tabla de efemérides de los planetas: leerla y evaluarla.
 *
 * QUÉ HAY DENTRO. Polinomios de Chebyshev ajustados a la posición HELIOCÉNTRICA
 * de seis planetas y de la Tierra, en coordenadas rectangulares eclípticas
 * J2000 y en unidades astronómicas. Los genera `scripts/prepare-planetas.ts`
 * con `astronomy-engine`, que es dependencia de desarrollo: al navegador viajan
 * 36 KB de coeficientes y este fichero, no una biblioteca de efemérides.
 *
 * ES LA MISMA IDEA QUE UN FICHERO SPK DEL JPL, en pequeño. La posición de un
 * planeta alrededor del sol es casi una elipse, y un polinomio de grado diez la
 * sigue durante meses con un error de kilómetros. Vista desde la Tierra la
 * misma órbita hace lazos, y por eso lo que se guarda es la heliocéntrica: la
 * resta se hace aquí.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SE NIEGA A EXTRAPOLAR, y ésa es la diferencia entre una tabla y una serie.
 * Fuera de la ventana que trae escrita no devuelve una posición peor: no
 * devuelve ninguna. Un Chebyshev extrapolado no se degrada con elegancia — el
 * grado 14 de la Tierra se dispara a millones de kilómetros a los pocos días de
 * salirse—, y una posición absurda dibujada con confianza es peor que un hueco.
 *
 * Quien llama tiene que saber contestar «no hay tabla para esa fecha», y el
 * panel lo dice. La prueba avisa cuando queden menos de dos años.
 */

import { dataUrl } from '../endpoints'

const MAGIC = 'TPPLAN1\0'
const HEADER = 24 + 8
const RECORD = 16

/**
 * El orden ES el formato: el binario guarda un número y esta lista lo resuelve.
 * Tiene que coincidir con la de `scripts/prepare-planetas.ts`.
 */
export const PLANET_IDS = [
  'mercurio',
  'venus',
  'tierra',
  'marte',
  'jupiter',
  'saturno',
  'urano',
] as const

export type PlanetId = (typeof PLANET_IDS)[number]

/** Los que se dibujan. La Tierra está en la tabla porque hace de origen. */
export const VISIBLE_PLANETS: PlanetId[] = [
  'mercurio',
  'venus',
  'marte',
  'jupiter',
  'saturno',
  'urano',
]

interface BodyTable {
  degree: number
  blocks: number
  intervalMs: number
  /** Índice del primer coeficiente dentro del `Float32Array` común. */
  offset: number
}

export interface PlanetTable {
  /** Primer instante con datos, epoch ms. */
  startMs: number
  /** Último instante con datos. */
  endMs: number
  bodies: Map<PlanetId, BodyTable>
  coefficients: Float32Array
}

export function decodePlanetTable(buffer: ArrayBuffer): PlanetTable {
  const view = new DataView(buffer)
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8))
  if (magic !== MAGIC) throw new Error(`la tabla no empieza por ${MAGIC.trim()}`)
  const count = view.getUint32(8, true)
  const startMs = view.getFloat64(16, true)
  const endMs = view.getFloat64(24, true)
  if (!(endMs > startMs)) throw new Error('la ventana de la tabla está al revés')

  const bodies = new Map<PlanetId, BodyTable>()
  let total = 0
  for (let i = 0; i < count; i++) {
    const o = HEADER + i * RECORD
    const id = view.getUint8(o)
    const degree = view.getUint8(o + 1)
    const blocks = view.getUint16(o + 2, true)
    const offset = view.getUint32(o + 4, true)
    const intervalMs = view.getFloat64(o + 8, true)
    const name = PLANET_IDS[id]
    if (!name) throw new Error(`identificador de cuerpo desconocido: ${id}`)
    bodies.set(name, { degree, blocks, intervalMs, offset })
    total = Math.max(total, offset + blocks * 3 * (degree + 1))
  }

  const base = HEADER + count * RECORD
  const expected = base + total * 4
  if (buffer.byteLength !== expected) {
    throw new Error(`la tabla mide ${buffer.byteLength} bytes y debería medir ${expected}`)
  }
  return {
    startMs,
    endMs,
    bodies,
    coefficients: new Float32Array(buffer, base, total),
  }
}

/**
 * Posición heliocéntrica de un cuerpo, en UA, eclíptica J2000.
 *
 * Devuelve `null` fuera de la ventana de la tabla. Ver la cabecera: no es
 * pereza, es que extrapolar un Chebyshev da cifras enormes con toda confianza.
 */
export function heliocentric(
  table: PlanetTable,
  body: PlanetId,
  at: number,
): [number, number, number] | null {
  if (at < table.startMs || at > table.endMs) return null
  const spec = table.bodies.get(body)
  if (!spec) return null

  let index = Math.floor((at - table.startMs) / spec.intervalMs)
  // El último instante exacto cae en el bloque siguiente al último: se le
  // devuelve al que sí existe, donde `x` vale +1 y el polinomio sigue valiendo.
  if (index >= spec.blocks) index = spec.blocks - 1
  const a = table.startMs + index * spec.intervalMs
  const b = a + spec.intervalMs
  const x = (2 * at - a - b) / (b - a)

  const n = spec.degree + 1
  const out: [number, number, number] = [0, 0, 0]
  for (let axis = 0; axis < 3; axis++) {
    const from = spec.offset + index * 3 * n + axis * n
    // Clenshaw: evalúa la suma de Chebyshev sin construir los polinomios.
    let d = 0
    let dd = 0
    for (let j = n - 1; j > 0; j--) {
      const previous = d
      d = 2 * x * d - dd + table.coefficients[from + j]
      dd = previous
    }
    out[axis] = x * d - dd + table.coefficients[from] / 2
  }
  return out
}

/**
 * Descarga la tabla. Va aparte del catálogo de estrellas a propósito: son 36 KB
 * que solo paga quien enciende los planetas, y la escena nocturna funciona
 * entera sin ellos.
 */
export async function fetchPlanetTable(): Promise<PlanetTable> {
  const res = await fetch(dataUrl('/cielo/planetas.bin'))
  if (!res.ok) throw new Error(`planetas.bin: HTTP ${res.status}`)
  return decodePlanetTable(await res.arrayBuffer())
}
