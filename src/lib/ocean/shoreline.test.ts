/**
 * El mapa de la orilla.
 *
 * La isla de prueba es un cuadrado en mitad de la malla. Suena simple y es a
 * propósito: de un cuadrado se conoce la distancia exacta a cualquier punto, y
 * eso permite medir cuánto se desvía el chamfer en las diagonales, que es donde
 * más se desvía. Las dos cosas que se comprueban son las dos que rompen el mar:
 * el signo (dentro es negativo) y hacia dónde mira la normal.
 */

import { describe, expect, it } from 'vitest'
import {
  SHORE_MAX_ELEVATION_M,
  SHORE_MAX_M,
  decodeShoreDistance,
  packShoreline,
  signedShoreDistance,
  type ShorelineGrid,
} from './shoreline'

const SIZE = 64
const grid: ShorelineGrid = { width: SIZE, height: SIZE, metersX: 40, metersY: 40 }

/** Tierra en el cuadrado [24,40) × [24,40). */
function squareIsland(): Uint8Array {
  const land = new Uint8Array(SIZE * SIZE)
  for (let y = 24; y < 40; y++) {
    for (let x = 24; x < 40; x++) land[y * SIZE + x] = 1
  }
  return land
}

const land = squareIsland()
const distance = signedShoreDistance(land, grid)
const at = (x: number, y: number) => distance[y * SIZE + x]

describe('distancia con signo', () => {
  it('es negativa en tierra y positiva en el mar', () => {
    expect(at(32, 32)).toBeLessThan(0)
    expect(at(5, 5)).toBeGreaterThan(0)
  })

  it('vale medio texel justo al cruzar la orilla', () => {
    // El primer texel de mar pegado a la costa y el primero de tierra: los dos
    // a 20 m de la línea, que es la mitad del texel. Sin ese descuento la
    // espuma se dibujaría separada de la costa.
    expect(at(23, 32)).toBeCloseTo(20, 6)
    expect(at(24, 32)).toBeCloseTo(-20, 6)
  })

  it('crece hacia mar abierto en pasos del tamaño del texel', () => {
    expect(at(20, 32) - at(21, 32)).toBeCloseTo(40, 6)
    // Del texel 10 a la orilla (que cae en x = 23,5) hay 13,5 texeles.
    expect(at(10, 32)).toBeCloseTo(13.5 * 40, 6)
  })

  it('en diagonal se queda a menos del 4 % de la distancia exacta', () => {
    // Desde (16,16) hasta la esquina de la isla (24,24) hay 8 texeles en cada
    // eje: 320 m por lado, 452,5 m de hipotenusa, menos medio texel.
    const exact = Math.hypot(8 * 40, 8 * 40) - 20
    expect(Math.abs(at(16, 16) - exact) / exact).toBeLessThan(0.04)
  })
})

describe('empaquetado', () => {
  const elevation = new Float32Array(SIZE * SIZE)
  for (let y = 24; y < 40; y++) {
    for (let x = 24; x < 40; x++) elevation[y * SIZE + x] = 30
  }
  const packed = packShoreline(distance, elevation, grid)
  const texel = (x: number, y: number) => packed.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4)

  it('pone la orilla en el medio de la escala', () => {
    // Un texel a 20 m de la costa tiene que salir apenas por encima del 0,5.
    const r = texel(23, 32)[0]
    expect(r).toBeGreaterThan(127)
    expect(r).toBeLessThan(145)
  })

  it('afina donde hace falta y afloja donde no', () => {
    for (const [x, y] of [[23, 32], [20, 32], [10, 32]] as [number, number][]) {
      const decoded = decodeShoreDistance(texel(x, y)[0])
      // El error de cuantificación crece con la distancia, que es justo lo que
      // buscaba la raíz cuadrada: 25 cm pegado a la orilla, 80 cm a veinte
      // metros y 4 m a medio kilómetro, donde ya no se dibuja nada de esto.
      expect(Math.abs(decoded - at(x, y))).toBeLessThan(Math.max(0.3, at(x, y) * 0.05))
    }
  })

  it('guarda la cota hasta su techo y no más', () => {
    expect(texel(32, 32)[1]).toBe(Math.round((30 / SHORE_MAX_ELEVATION_M) * 255))
    expect(texel(5, 5)[1]).toBe(0)
  })

  it('la normal apunta de la tierra hacia el mar', () => {
    // Al oeste de la isla la normal mira al oeste: componente este negativa.
    const west = texel(20, 32)
    expect(west[2]).toBeLessThan(120)
    expect(Math.abs(west[3] - 128)).toBeLessThan(8)
    // Al norte mira al norte: componente norte positiva.
    const north = texel(32, 20)
    expect(north[3]).toBeGreaterThan(136)
    expect(Math.abs(north[2] - 128)).toBeLessThan(8)
  })

  it('satura a dos kilómetros, no antes', () => {
    expect(decodeShoreDistance(255)).toBeCloseTo(SHORE_MAX_M, 6)
    expect(decodeShoreDistance(0)).toBeCloseTo(-SHORE_MAX_M, 6)
    // El escalón más fino de toda la escala, justo en la orilla: 25 cm.
    expect(decodeShoreDistance(129) - decodeShoreDistance(128)).toBeCloseTo(0.25, 2)
  })
})
