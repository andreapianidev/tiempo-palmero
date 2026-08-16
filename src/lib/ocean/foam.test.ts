/**
 * La vida media de la espuma, medida por sus dos orillas: que la estela dure
 * lo que dura una ola y que el mar no se quede sucio entre dos trenes.
 */

import { describe, expect, it } from 'vitest'
import { FOAM_LIFETIME_S, foamDecay } from './foam'

describe('el decaimiento de la espuma', () => {
  it('sin tiempo no decae nada', () => {
    expect(foamDecay(0)).toBe(1)
  })

  it('a los τ segundos queda exactamente 1/e, que es la definición', () => {
    expect(foamDecay(FOAM_LIFETIME_S)).toBeCloseTo(1 / Math.E, 6)
  })

  it('en un fotograma de 60 Hz apenas se nota, y en uno de 30 tampoco', () => {
    // El decaimiento por fotograma tiene que ser suave: un escalón entre
    // fotogramas se vería como un parpadeo de la estela.
    expect(foamDecay(1 / 60)).toBeGreaterThan(0.998)
    expect(foamDecay(1 / 30)).toBeGreaterThan(0.997)
  })

  it('al minuto no queda nada: la estela se funde del todo', () => {
    expect(foamDecay(60)).toBeLessThan(0.02)
  })

  it('el tiempo negativo no crea espuma', () => {
    expect(foamDecay(-1)).toBe(1)
  })
})
