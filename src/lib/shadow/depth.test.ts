import { describe, expect, it } from 'vitest'
import { airMass, shadowDepth } from './depth'

describe('airMass', () => {
  it('vale 1 en la vertical y ~38 en el horizonte', () => {
    expect(airMass(90)).toBeCloseTo(1, 2)
    expect(airMass(0)).toBeGreaterThan(36)
    expect(airMass(0)).toBeLessThan(40)
  })

  it('a 30° vale 2, que es el caso de libro', () => {
    expect(airMass(30)).toBeCloseTo(2, 1)
  })

  it('crece sin saltos al bajar el sol', () => {
    let prev = airMass(90)
    for (let h = 89; h >= 0; h--) {
      const am = airMass(h)
      expect(am, `altura ${h}`).toBeGreaterThan(prev)
      prev = am
    }
  })
})

describe('shadowDepth', () => {
  it('con el sol bajo el horizonte no hay sombra que oscurecer', () => {
    expect(shadowDepth(0)).toBe(0)
    expect(shadowDepth(-5)).toBe(0)
  })

  it('la sombra se ahonda según sube el sol, nunca al revés', () => {
    let prev = 0
    for (let h = 1; h <= 90; h++) {
      const d = shadowDepth(h)
      expect(d, `altura ${h}`).toBeGreaterThanOrEqual(prev)
      prev = d
    }
  })

  it('nunca apaga del todo: dentro de la sombra sigue habiendo cielo', () => {
    expect(shadowDepth(90)).toBeLessThan(0.9)
  })

  it('con el sol rasante la sombra es suave, que es cuando más superficie cubre', () => {
    // El 50,5 % de la tierra queda en sombra propia con el sol a 5°. Si a esa
    // altura la sombra fuera profunda, encenderla apagaría media isla.
    expect(shadowDepth(5)).toBeLessThan(0.4)
    expect(shadowDepth(2)).toBeLessThan(0.25)
  })

  it('da los valores escritos en la cabecera', () => {
    for (const [h, expected] of [
      [60, 0.81],
      [45, 0.78],
      [20, 0.65],
      [10, 0.48],
      [5, 0.3],
      [2, 0.13],
    ] as const) {
      expect(shadowDepth(h), `altura ${h}`).toBeCloseTo(expected, 2)
    }
  })
})
