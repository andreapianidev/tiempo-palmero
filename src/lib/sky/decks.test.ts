import { describe, expect, it } from 'vitest'
import type { CloudDeck } from '../clouds'
import { deckFor, HIGH_DECK, LOW_BAND_TOP_M, lowDeck, MID_DECK } from './decks'

function deck(over: Partial<CloudDeck> = {}): CloudDeck {
  return {
    present: true,
    base: 1081,
    top: 1573,
    resolutionM: 246,
    deltaT: 1.4,
    deltaRh: -50,
    coverage: 60,
    observedAt: Date.now(),
    agreement: { withInversion: 4, total: 4 },
    ...over,
  }
}

describe('cota de la capa baja', () => {
  it('manda el sondeo cuando hay manta diagnosticada', () => {
    // La diferencia entre una nube que corta la Cumbre por donde de verdad la
    // corta y una que flota mil metros por encima.
    const band = lowDeck(deck(), 700)
    expect(band.base).toBe(1081)
    expect(band.top).toBe(1573)
    expect(band.source).toBe('deck')
  })

  it('sin manta, la cota es el nivel de condensación', () => {
    // `present` exige inversión Y nubosidad debajo. Una inversión seca no vale
    // como cota de nube, pero puede haber nubosidad baja igualmente.
    const band = lowDeck(deck({ present: false }), 700)
    expect(band.base).toBe(700)
    expect(band.source).toBe('lcl')
  })

  it('sin sondeo ni superficie cae en la cota por defecto, y lo declara', () => {
    // Lo importante no es el número: es que `source` diga que es el peor de los
    // tres, para que el panel no lo presente como una medida.
    const band = lowDeck(null, null)
    expect(band.source).toBe('default')
    expect(band.base).toBeGreaterThan(0)
  })

  it('nunca sube por encima del techo de la banda baja de Open-Meteo', () => {
    // Los 3 km son la definición de `cloud_cover_low`: lo que quede por encima
    // ya lo está contando `cloud_cover_mid`, y dibujarlo aquí sería contar dos
    // veces la misma nube.
    const alta = lowDeck(deck({ base: 2900, top: 3400 }), null)
    expect(alta.top).toBeLessThanOrEqual(LOW_BAND_TOP_M)
    expect(alta.base).toBeLessThan(alta.top)

    const lclAlto = lowDeck(null, 4000)
    expect(lclAlto.top).toBeLessThanOrEqual(LOW_BAND_TOP_M)
  })

  it('la banda siempre tiene espesor: la base por debajo de la cima', () => {
    for (const [d, lcl] of [
      [deck(), null],
      [deck({ base: 1500, top: 1500 }), null],
      [deck({ present: false }), 150],
      [null, null],
    ] as const) {
      const band = lowDeck(d, lcl)
      expect(band.top).toBeGreaterThan(band.base)
    }
  })

  it('descarta un nivel de condensación imposible', () => {
    // Un LCL negativo o cero saldría de una superficie saturada; dibujar la
    // nube a cota cero la metería dentro del mar.
    expect(lowDeck(deck({ present: false }), 0).source).toBe('default')
    expect(lowDeck(deck({ present: false }), -300).source).toBe('default')
    expect(lowDeck(deck({ present: false }), NaN).source).toBe('default')
  })
})

describe('bandas fijas', () => {
  it('las tres bandas están ordenadas y no se solapan', () => {
    const low = lowDeck(deck(), null)
    expect(low.top).toBeLessThanOrEqual(MID_DECK.base)
    expect(MID_DECK.top).toBeLessThan(HIGH_DECK.base)
  })

  it('la media y la alta caen dentro de lo que define Open-Meteo', () => {
    // Bajo hasta 3 km, medio de 3 a 8 km, alto por encima de 8 km. Son las
    // bandas de quien da el dato, no las de la OMM.
    expect(MID_DECK.base).toBeGreaterThanOrEqual(3000)
    expect(MID_DECK.top).toBeLessThanOrEqual(8000)
    expect(HIGH_DECK.base).toBeGreaterThanOrEqual(8000)
  })

  it('el cirro se dibuja fino y el cúmulo con cuerpo', () => {
    // Un cirro con espesor de cúmulo se convierte en una losa que no se parece
    // a nada.
    expect(HIGH_DECK.top - HIGH_DECK.base).toBeLessThan(MID_DECK.top - MID_DECK.base)
  })

  it('`deckFor` devuelve la banda que toca a cada estrato', () => {
    const low = lowDeck(deck(), null)
    expect(deckFor('low', low)).toBe(low)
    expect(deckFor('mid', low)).toBe(MID_DECK)
    expect(deckFor('high', low)).toBe(HIGH_DECK)
  })
})
