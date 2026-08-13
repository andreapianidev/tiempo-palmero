/**
 * La física del oleaje, contra los valores exactos.
 *
 * Cada aproximación se compara con la solución cerrada del caso extremo donde
 * esa solución existe: aguas profundas (k·d = k₀·d) y aguas someras
 * (k = ω/√(gd)). Es la única forma de saber que una fórmula «explícita y
 * sencilla» sacada de un artículo está bien transcrita.
 */

import { describe, expect, it } from 'vitest'
import {
  BREAKING_INDEX,
  G,
  MAX_STEEPNESS,
  beaufort,
  breakingDepth,
  breakingRatio,
  deepWavelength,
  fullyDevelopedHeight,
  shoalingFactor,
  steepness,
  travelVector,
  waveNumberDepth,
  whitecapCover,
  windForHeight,
} from './sea-state'

describe('longitud de onda', () => {
  it('es la regla de 1,56·T² de manual', () => {
    expect(deepWavelength(10)).toBeCloseTo(156.13, 2)
    expect(deepWavelength(1)).toBeCloseTo(1.5613, 4)
  })

  it('separa el mar de fondo del mar de viento por un factor de seis', () => {
    // Las dos escalas reales del 13 ago 2026 frente a la isla: fondo de 5,5 s
    // y viento de 3,9 s dan 47 m y 24 m. Pintar las dos con la misma longitud
    // sería borrar la diferencia entre un mar largo y uno picado.
    expect(deepWavelength(5.5)).toBeCloseTo(47.2, 1)
    expect(deepWavelength(3.9)).toBeCloseTo(23.7, 1)
    expect(deepWavelength(12) / deepWavelength(5)).toBeCloseTo(5.76, 2)
  })
})

describe('relación de dispersión', () => {
  it('en aguas profundas cae en el valor exacto k₀·d', () => {
    const T = 10
    const d = 1000
    const k0 = (2 * Math.PI) / deepWavelength(T)
    expect(waveNumberDepth(T, d)).toBeCloseTo(k0 * d, 1)
  })

  it('en aguas someras se queda en el 0,9 % del exacto ω/√(gd)', () => {
    const T = 10
    const d = 2
    const omega = (2 * Math.PI) / T
    const exact = (omega / Math.sqrt(G * d)) * d
    const got = waveNumberDepth(T, d)
    expect(Math.abs(got - exact) / exact).toBeLessThan(0.009)
  })

  it('crece con la profundidad, sin escalones', () => {
    let previous = 0
    for (let d = 0.5; d < 400; d *= 1.3) {
      const kd = waveNumberDepth(8, d)
      expect(kd).toBeGreaterThan(previous)
      previous = kd
    }
  })
})

describe('asomeramiento', () => {
  it('no toca la ola mientras no vea el fondo', () => {
    expect(shoalingFactor(8, 500)).toBeCloseTo(1, 3)
    expect(shoalingFactor(8, 2000)).toBe(1)
  })

  it('levanta la ola en el bajío', () => {
    // Una mar de fondo de 8 s, medida con esta misma función: a 3 m de agua la
    // ola ha crecido un 13 %; a 1 m, un 44 %; a medio metro, un 70 %. Es lo que
    // convierte una ondulación de un metro mar adentro en una ola de metro y
    // medio en la orilla, y por eso el asomeramiento no se puede saltar.
    expect(shoalingFactor(8, 3)).toBeCloseTo(1.128, 2)
    expect(shoalingFactor(8, 1)).toBeCloseTo(1.437, 2)
    expect(shoalingFactor(8, 0.5)).toBeCloseTo(1.695, 2)
  })

  it('pasa por el mínimo de 0,91 que predice la teoría lineal', () => {
    let min = Infinity
    for (let d = 0.2; d < 300; d *= 1.02) min = Math.min(min, shoalingFactor(10, d))
    // El mínimo teórico de Ks es 0,9126 alrededor de kd ≈ 1,2. Que aparezca
    // solo es la prueba de que la curva es la curva, y no una rampa inventada.
    expect(min).toBeCloseTo(0.913, 2)
  })
})

describe('rotura', () => {
  it('rompe cuando la altura llega a 0,78 veces la profundidad', () => {
    expect(breakingRatio(0.78, 1)).toBeCloseTo(1, 6)
    expect(breakingRatio(0.4, 1)).toBeLessThan(1)
    expect(breakingRatio(1.2, 1)).toBeGreaterThan(1)
  })

  it('sitúa la rompiente de un día normal a metro y medio de agua', () => {
    // 1,3 m de mar de fondo y 5,5 s: el estado real de la isla el 13 ago 2026.
    const d = breakingDepth(1.3, 5.5)
    expect(d).toBeGreaterThan(1.5)
    expect(d).toBeLessThan(2.5)
    // Y ahí la ola ya ha crecido: comprobación cruzada con el asomeramiento.
    expect(1.3 * shoalingFactor(5.5, d)).toBeCloseTo(BREAKING_INDEX * d, 1)
  })

  it('una mar gruesa rompe mucho más lejos de la orilla', () => {
    expect(breakingDepth(4, 12)).toBeGreaterThan(breakingDepth(1.3, 5.5) * 2)
  })
})

describe('borreguillos', () => {
  it('reproduce las cifras publicadas de cobertura', () => {
    // Monahan y O'Muircheartaigh (1980). Las tres cifras que separan un mar
    // azul de un mar blanco.
    expect(whitecapCover(5) * 100).toBeCloseTo(0.093, 2)
    expect(whitecapCover(12) * 100).toBeCloseTo(1.838, 2)
    expect(whitecapCover(20) * 100).toBeCloseTo(10.492, 2)
  })

  it('no hay mar blanco sin viento', () => {
    expect(whitecapCover(0)).toBe(0)
    expect(whitecapCover(-3)).toBe(0)
  })

  it('cambia de carácter de golpe, no poco a poco', () => {
    // Doblar el viento multiplica la espuma por más de diez: es el exponente
    // 3,41, y es lo que hace que un temporal se vea como un temporal.
    expect(whitecapCover(16) / whitecapCover(8)).toBeGreaterThan(10)
  })
})

describe('mar completamente desarrollado', () => {
  it('el alisio de 8 m/s levanta metro y medio de mar', () => {
    expect(fullyDevelopedHeight(8)).toBeCloseTo(1.37, 2)
  })

  it('la vuelta devuelve el mismo viento', () => {
    expect(windForHeight(fullyDevelopedHeight(11.3))).toBeCloseTo(11.3, 6)
    expect(windForHeight(0)).toBe(0)
  })
})

describe('peralte', () => {
  it('el límite de Stokes es 1/7', () => {
    expect(MAX_STEEPNESS).toBeCloseTo(0.1429, 4)
  })

  it('un mar de fondo es plano y uno de viento no', () => {
    expect(steepness(1.3, deepWavelength(12))).toBeLessThan(0.01)
    expect(steepness(1.5, deepWavelength(4))).toBeGreaterThan(0.05)
  })

  it('sin longitud de onda no hay peralte que calcular', () => {
    expect(steepness(2, 0)).toBe(0)
  })
})

describe('dirección', () => {
  it('una ola del norte viaja hacia el sur', () => {
    const v = travelVector(0)
    expect(v.x).toBeCloseTo(0, 6)
    expect(v.y).toBeCloseTo(-1, 6)
  })

  it('una ola del este viaja hacia el oeste', () => {
    const v = travelVector(90)
    expect(v.x).toBeCloseTo(-1, 6)
    expect(v.y).toBeCloseTo(0, 6)
  })

  it('el alisio del nordeste empuja hacia el suroeste', () => {
    const v = travelVector(45)
    expect(v.x).toBeLessThan(0)
    expect(v.y).toBeLessThan(0)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6)
  })
})

describe('beaufort', () => {
  it('pone cada viento en su fuerza', () => {
    expect(beaufort(0)).toBe(0)
    expect(beaufort(2)).toBe(2)
    expect(beaufort(8)).toBe(5)
    expect(beaufort(12)).toBe(6)
    expect(beaufort(35)).toBe(12)
  })
})
