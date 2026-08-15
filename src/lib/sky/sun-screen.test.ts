import { describe, expect, it } from 'vitest'
import { sunScreen } from './sun-screen'

/**
 * Una matriz de vista de juguete, en columna mayor como las de MapLibre, que
 * mira hacia el NORTE con la cámara horizontal: la x de pantalla es el este, la
 * y de pantalla es el arriba, y la profundidad crece hacia el norte.
 *
 * Con ella el resultado se puede razonar a mano, que es de lo que se trata: el
 * error que hay que cazar aquí es un signo, y un signo produce siempre un sol
 * plausible puesto en el sitio simétrico.
 */
const LOOKING_NORTH = [
  // columna 0: qué hace el eje x del mundo (este) → derecha de la pantalla
  1, 0, 0, 0,
  // columna 1: el eje y de Mercator (SUR) → hacia dentro de la pantalla
  0, 0, 0, -1,
  // columna 2: el eje z (arriba) → arriba de la pantalla
  0, 1, 0, 0,
  // columna 3: sin traslación
  0, 0, 0, 0,
]

describe('dónde cae el sol en la pantalla', () => {
  it('mirando al norte, un sol al norte cae en el centro', () => {
    const s = sunScreen(LOOKING_NORTH, { elevationDeg: 0, azimuthDeg: 0 })
    expect(s.ahead).toBe(true)
    expect(s.x).toBeCloseTo(0, 6)
    expect(s.y).toBeCloseTo(0, 6)
  })

  it('un sol al noreste cae a la DERECHA, no a la izquierda', () => {
    // Aquí es donde muerde el signo de la `y` de Mercator: sin él, el este
    // saldría por la izquierda y nadie lo notaría hasta un atardecer.
    const s = sunScreen(LOOKING_NORTH, { elevationDeg: 0, azimuthDeg: 45 })
    expect(s.ahead).toBe(true)
    expect(s.x).toBeGreaterThan(0)
  })

  it('y uno más alto, más arriba', () => {
    const low = sunScreen(LOOKING_NORTH, { elevationDeg: 10, azimuthDeg: 0 })
    const high = sunScreen(LOOKING_NORTH, { elevationDeg: 40, azimuthDeg: 0 })
    expect(high.y).toBeGreaterThan(low.y)
    expect(low.y).toBeGreaterThan(0)
  })

  it('a la espalda de la cámara no hay sol que dibujar', () => {
    // Mirando al norte, un sol al SUR. Sin esta comprobación, la división por
    // una w negativa lo colocaría en el sitio simétrico: un sol de mentira
    // exactamente donde no está.
    const s = sunScreen(LOOKING_NORTH, { elevationDeg: 20, azimuthDeg: 180 })
    expect(s.ahead).toBe(false)
  })
})
