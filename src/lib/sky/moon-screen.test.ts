/**
 * El cuerno de la luna en la pantalla.
 *
 * Con la misma matriz de juguete que la del sol —cámara horizontal mirando al
 * norte— el resultado se razona a mano, que es lo único que sirve para cazar un
 * signo. Y un signo, aquí, es una luna iluminada por el lado contrario: nadie lo
 * nota y está mal todas las noches.
 */

import { describe, expect, it } from 'vitest'
import { moonScreen } from './moon-screen'

/** Cámara horizontal mirando al norte: x → este, y → arriba. */
const LOOKING_NORTH = [
  1, 0, 0, 0,
  0, 0, 0, -1,
  0, 1, 0, 0,
  0, 0, 0, 0,
]

/** Luna justo al norte y en el horizonte: cae en el centro de la pantalla. */
const AT_NORTH: [number, number, number] = [0, 1, 0]

describe('dónde cae la luna', () => {
  it('al norte y en el horizonte, en el centro', () => {
    const m = moonScreen(LOOKING_NORTH, AT_NORTH, [0, 0, 1], 1)
    expect(m.ahead).toBe(true)
    expect(m.x).toBeCloseTo(0, 6)
    expect(m.y).toBeCloseTo(0, 6)
  })

  it('a la espalda de la cámara no hay luna que dibujar', () => {
    const m = moonScreen(LOOKING_NORTH, [0, -1, 0], [0, 0, 1], 1)
    expect(m.ahead).toBe(false)
  })
})

describe('hacia dónde mira el cuerno', () => {
  it('con el sol por debajo, el cuerno apunta hacia abajo', () => {
    // Es la creciente de después de la puesta: la luna en el centro de la
    // pantalla y el sol más abajo, así que la parte iluminada mira al suelo.
    const m = moonScreen(LOOKING_NORTH, AT_NORTH, [0, 0, -1], 1)
    expect(m.limb[1]).toBeCloseTo(-1, 5)
    expect(m.limb[0]).toBeCloseTo(0, 5)
  })

  it('con el sol a la derecha, el cuerno apunta a la derecha', () => {
    // El cuerno hacia el este; mirando al norte, el este está a la derecha.
    const m = moonScreen(LOOKING_NORTH, AT_NORTH, [1, 0, 0], 1)
    expect(m.limb[0]).toBeCloseTo(1, 5)
    expect(m.limb[1]).toBeCloseTo(0, 5)
  })

  it('siempre sale unitario', () => {
    for (const limb of [
      [1, 0, 0],
      [0, 0, 1],
      [0.6, 0, 0.8],
      [-0.5, 0, -0.866],
    ] as [number, number, number][]) {
      const m = moonScreen(LOOKING_NORTH, AT_NORTH, limb, 1.9)
      expect(Math.hypot(m.limb[0], m.limb[1])).toBeCloseTo(1, 9)
    }
  })

  it('la relación de aspecto entra, y entra en la x', () => {
    // LA PRUEBA DEL FICHERO. Con un cuerno a 45° en el mundo, en una ventana
    // apaisada la dirección en el espacio del cuadrilátero NO es 45°: el
    // cuadrilátero está estirado a lo ancho para que el disco salga redondo, y
    // la dirección tiene que estirarse con él.
    //
    // Sin la multiplicación por el aspecto las dos salidas serían idénticas, y
    // ése es justo el fallo que sale bien en una ventana cuadrada.
    const diagonal: [number, number, number] = [Math.SQRT1_2, 0, Math.SQRT1_2]
    const square = moonScreen(LOOKING_NORTH, AT_NORTH, diagonal, 1)
    const wide = moonScreen(LOOKING_NORTH, AT_NORTH, diagonal, 2)
    expect(square.limb[0]).toBeCloseTo(Math.SQRT1_2, 4)
    // En 2:1 la componente horizontal pesa el doble antes de normalizar, así
    // que el cuerno se acuesta: 63,4° en vez de 45°.
    expect(wide.limb[0]).toBeCloseTo(2 / Math.sqrt(5), 4)
    expect(wide.limb[0]).toBeGreaterThan(square.limb[0])
  })

  it('sin cuerno que apuntar devuelve cero y no una dirección inventada', () => {
    // Con el cuerno paralelo a la línea de visión la proyección se anula. Pasa
    // en el eclipse y en la luna nueva exacta, y ahí no hay lado iluminado que
    // dibujar: devolver un vector cualquiera sería dibujar una fase falsa.
    const m = moonScreen(LOOKING_NORTH, AT_NORTH, [0, 1, 0], 1)
    expect(m.limb).toEqual([0, 0])
  })
})
