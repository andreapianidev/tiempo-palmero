import { describe, expect, it } from 'vitest'
import { ISLAND_BBOX } from '../geo'
import {
  TDT_NEARBY_CELLS,
  TDT_TIER_ALPHA,
  tdtReadingAt,
  tdtTierAt,
  tierOfAlpha,
  type TdtMask,
} from './mask'

/** Una máscara de 4×2 con un escalón conocido en cada celda. */
function mask(alphas: number[], width = 4, height = 2): TdtMask {
  return { width, height, alpha: Uint8Array.from(alphas) }
}

describe('escalones de la máscara', () => {
  it('lee los tres escalones tal como se graban', () => {
    expect(tierOfAlpha(TDT_TIER_ALPHA[1])).toBe(1)
    expect(tierOfAlpha(TDT_TIER_ALPHA[2])).toBe(2)
    expect(tierOfAlpha(TDT_TIER_ALPHA[3])).toBe(3)
    expect(tierOfAlpha(0)).toBe(0)
  })

  it('aguanta el redondeo del canvas', () => {
    // `getImageData` puede devolver el alfa con un punto de diferencia según el
    // navegador. Los escalones están a 70 justamente para que eso dé igual.
    for (const tier of [1, 2, 3] as const) {
      for (const delta of [-8, -1, 0, 1, 8]) {
        expect(tierOfAlpha(TDT_TIER_ALPHA[tier] + delta)).toBe(tier)
      }
    }
  })

  it('un alfa que no es de ningún escalón no se inventa un escalón', () => {
    // A mitad de camino entre «sin simulación» y «un repetidor». Decir 1 sería
    // pintar cobertura donde el cálculo no dijo nada.
    expect(tierOfAlpha(45)).toBe(0)
    expect(tierOfAlpha(20)).toBe(0)
  })
})

describe('lectura de un punto', () => {
  const { west, east, south, north } = ISLAND_BBOX
  const mid = (a: number, b: number) => (a + b) / 2

  it('cada esquina del bbox cae en su celda', () => {
    // 4×2: la fila de arriba es el norte, la columna 0 el oeste.
    const m = mask([90, 0, 0, 160, 0, 0, 230, 0])
    expect(tdtTierAt(m, west + 1e-6, north - 1e-6)).toBe(1)
    expect(tdtTierAt(m, east - 1e-6, north - 1e-6)).toBe(2)
    expect(tdtTierAt(m, west + 1e-6, south + 1e-6)).toBe(0)
    // Tercera columna, fila sur.
    expect(tdtTierAt(m, west + ((east - west) * 5) / 8, south + 1e-6)).toBe(3)
  })

  it('una celda del interior se lee por su centro', () => {
    // Índice 5 de una rejilla 4×2: fila de abajo (sur), segunda columna, o sea
    // el tramo de longitud que va del 25 % al 50 % del ancho.
    const m = mask([0, 0, 0, 0, 0, 230, 0, 0])
    const lon = west + (east - west) * 0.375
    const lat = south + (north - south) * 0.25
    expect(tdtTierAt(m, lon, lat)).toBe(3)
    // Y la de al lado sigue vacía: la lectura no se desborda a la vecina.
    expect(tdtTierAt(m, west + (east - west) * 0.625, lat)).toBe(0)
  })

  it('fuera del bbox insular no hay simulación, y no revienta', () => {
    const m = mask([230, 230, 230, 230, 230, 230, 230, 230])
    expect(tdtTierAt(m, west - 0.5, mid(south, north))).toBe(0)
    expect(tdtTierAt(m, east + 0.5, mid(south, north))).toBe(0)
    expect(tdtTierAt(m, mid(west, east), north + 0.5)).toBe(0)
    expect(tdtTierAt(m, mid(west, east), south - 0.5)).toBe(0)
  })

  it('un agujero de una celda no se cuenta como «aquí no hay»', () => {
    // El caso real: el casco de Villa de Mazo cae en una celda vacía con
    // cobertura simulada a tres celdas. Una rejilla 9×9 con un agujero en el
    // centro reproduce exactamente eso.
    const w = 9
    const h = 9
    const alpha = new Uint8Array(w * h).fill(TDT_TIER_ALPHA[2])
    alpha[4 * w + 4] = 0
    const m: TdtMask = { width: w, height: h, alpha }
    const lon = west + ((east - west) * 4.5) / w
    const lat = north - ((north - south) * 4.5) / h
    expect(tdtTierAt(m, lon, lat)).toBe(0)
    expect(tdtReadingAt(m, lon, lat)).toEqual({ tier: 0, nearby: 2 })
  })

  it('un vacío de verdad sigue siendo un vacío', () => {
    // Vacío más ancho que el radio del vistazo: no se rescata nada de fuera.
    const w = 21
    const h = 21
    const alpha = new Uint8Array(w * h).fill(TDT_TIER_ALPHA[3])
    const hole = TDT_NEARBY_CELLS + 1
    for (let y = 10 - hole; y <= 10 + hole; y++) {
      for (let x = 10 - hole; x <= 10 + hole; x++) alpha[y * w + x] = 0
    }
    const m: TdtMask = { width: w, height: h, alpha }
    const lon = west + ((east - west) * 10.5) / w
    const lat = north - ((north - south) * 10.5) / h
    expect(tdtReadingAt(m, lon, lat)).toEqual({ tier: 0, nearby: 0 })
  })

  it('donde la celda dice que sí, no se mira alrededor', () => {
    // Si mirara, un vecino más fuerte subiría el escalón y la ficha diría más
    // de lo que el cálculo dice de ESE sitio.
    const w = 3
    const h = 3
    const alpha = new Uint8Array(w * h).fill(TDT_TIER_ALPHA[3])
    alpha[4] = TDT_TIER_ALPHA[1]
    const m: TdtMask = { width: w, height: h, alpha }
    const lon = west + (east - west) / 2
    const lat = south + (north - south) / 2
    expect(tdtReadingAt(m, lon, lat)).toEqual({ tier: 1, nearby: 1 })
  })

  it('los bordes exactos del bbox no se salen del array', () => {
    const m = mask([90, 90, 90, 90, 90, 90, 90, 90])
    for (const [lon, lat] of [
      [west, north],
      [east, north],
      [west, south],
      [east, south],
    ]) {
      expect(tdtTierAt(m, lon, lat)).toBe(1)
    }
  })
})
