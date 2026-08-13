/**
 * El mar de nubes, y sobre todo cuándo NO hay que anunciarlo.
 *
 * Los perfiles de aquí no son inventados: salen del sondeo real de ICON sobre
 * el centro de La Palma leído el 13 ago 2026 a las 12:00, que es justamente un
 * día con inversión de manual y cielo raso — el caso que la guardia de
 * nubosidad existe para no contar mal.
 */

import { describe, expect, it } from 'vitest'
import { detectInversion, type ProfileLevel, type VerticalProfile } from './profile'
import {
  DECK_COVER_THRESHOLD,
  summarizeDeck,
  sunlightAbove,
  zoneAt,
  type CloudDeck,
} from './clouds'

/** Sondeo ICON real, 13 ago 2026 12:00 UTC, 28,75 N / −17,88 E. */
const REAL_LEVELS: ProfileLevel[] = [
  { pressureHpa: 1000, height: 174, temperature: 26.4, dewpoint: 20.1 },
  { pressureHpa: 950, height: 615, temperature: 23.2, dewpoint: 17.0 },
  { pressureHpa: 925, height: 845, temperature: 21.4, dewpoint: 15.3 },
  { pressureHpa: 900, height: 1081, temperature: 19.8, dewpoint: 14.5 },
  { pressureHpa: 850, height: 1573, temperature: 21.2, dewpoint: -2.6 },
  { pressureHpa: 800, height: 2095, temperature: 19.7, dewpoint: -12.0 },
  { pressureHpa: 700, height: 3229, temperature: 12.8, dewpoint: -19.4 },
]

function profile(over: Partial<VerticalProfile> = {}): VerticalProfile {
  const levels = over.levels ?? REAL_LEVELS
  return {
    lon: -17.88,
    lat: 28.75,
    levels,
    observedAt: 1_786_500_000_000,
    inversion: detectInversion(levels),
    cloudCoverLow: null,
    ...over,
  }
}

describe('summarizeDeck', () => {
  it('sin ninguna columna con inversión no hay diagnóstico', () => {
    const flat: ProfileLevel[] = [
      { pressureHpa: 1000, height: 100, temperature: 25, dewpoint: 18 },
      { pressureHpa: 900, height: 1000, temperature: 19, dewpoint: 13 },
      { pressureHpa: 850, height: 1500, temperature: 15, dewpoint: 10 },
    ]
    expect(summarizeDeck([profile({ levels: flat })])).toBeNull()
  })

  it('localiza la banda del sondeo real entre 1081 y 1573 m', () => {
    const deck = summarizeDeck([profile({ cloudCoverLow: 85 })])!
    expect(deck.base).toBe(1081)
    expect(deck.top).toBe(1573)
    // La temperatura SUBE con la altura: eso es la inversión.
    expect(deck.deltaT).toBeCloseTo(1.4, 1)
    expect(deck.deltaRh).toBeLessThan(-20)
    // ±246 m: la mitad del salto entre 900 y 850 hPa. La rejilla es más gruesa
    // que el fenómeno, y por eso este número viaja siempre con la cota.
    expect(deck.resolutionM).toBeCloseTo(246, 0)
  })

  it('NO anuncia mar de nubes con inversión seca', () => {
    // El caso medido el 13 ago 2026: inversión perfecta, cloud_cover_low = 0.
    const deck = summarizeDeck([profile({ cloudCoverLow: 0 })])!
    expect(deck.present).toBe(false)
    expect(deck.coverage).toBe(0)
    // La banda se sigue publicando: existe, sólo que sin nubes debajo.
    expect(deck.base).toBe(1081)
  })

  it('tampoco lo anuncia si el modelo no trajo nubosidad', () => {
    const deck = summarizeDeck([profile({ cloudCoverLow: null })])!
    expect(deck.present).toBe(false)
    expect(deck.coverage).toBeNull()
  })

  it('lo anuncia justo en el umbral, no antes', () => {
    expect(summarizeDeck([profile({ cloudCoverLow: DECK_COVER_THRESHOLD - 1 })])!.present)
      .toBe(false)
    expect(summarizeDeck([profile({ cloudCoverLow: DECK_COVER_THRESHOLD })])!.present)
      .toBe(true)
  })

  it('usa la mediana, así que una columna desviada no arrastra la cota', () => {
    const high: ProfileLevel[] = REAL_LEVELS.map((l) =>
      l.pressureHpa === 900 ? { ...l, height: 2000 } : l,
    )
    const deck = summarizeDeck([
      profile({ cloudCoverLow: 90 }),
      profile({ cloudCoverLow: 90 }),
      profile({ levels: high, cloudCoverLow: 90 }),
    ])!
    expect(deck.base).toBe(1081)
  })

  it('cuenta cuántas columnas ven la inversión, sin esconder las que no', () => {
    const flat: ProfileLevel[] = [
      { pressureHpa: 1000, height: 100, temperature: 25, dewpoint: 18 },
      { pressureHpa: 850, height: 1500, temperature: 15, dewpoint: 10 },
    ]
    const deck = summarizeDeck([
      profile({ cloudCoverLow: 90 }),
      profile({ levels: flat, cloudCoverLow: 90 }),
    ])!
    expect(deck.agreement).toEqual({ withInversion: 1, total: 2 })
  })

  it('se fecha con la más vieja de sus columnas, nunca con la más fresca', () => {
    const deck = summarizeDeck([
      profile({ observedAt: 2000, cloudCoverLow: 90 }),
      profile({ observedAt: 1000, cloudCoverLow: 90 }),
    ])!
    expect(deck.observedAt).toBe(1000)
  })
})

// ---------------------------------------------------------------------------

const DECK: CloudDeck = {
  present: true,
  base: 1000,
  top: 1500,
  resolutionM: 250,
  deltaT: 1.4,
  deltaRh: -50,
  coverage: 85,
  observedAt: 0,
  agreement: { withInversion: 4, total: 4 },
}

describe('zoneAt', () => {
  it('la costa está debajo y la cumbre encima', () => {
    expect(zoneAt(DECK, 5)).toBe('below')
    expect(zoneAt(DECK, 2426)).toBe('above')
  })

  it('dentro de la incertidumbre no se elige lado a cara o cruz', () => {
    // 1751 m está por encima del techo (1500) pero no por encima del techo más
    // su margen (1750): la respuesta honesta es que no se sabe.
    expect(zoneAt(DECK, 1751)).toBe('above')
    expect(zoneAt(DECK, 1749)).toBe('within')
    expect(zoneAt(DECK, 751)).toBe('within')
    expect(zoneAt(DECK, 749)).toBe('below')
  })

  it('la banda entera cuenta como dentro', () => {
    expect(zoneAt(DECK, 1000)).toBe('within')
    expect(zoneAt(DECK, 1250)).toBe('within')
    expect(zoneAt(DECK, 1500)).toBe('within')
  })
})

describe('sunlightAbove', () => {
  it('promete sol desde el techo MÁS el margen, redondeado hacia arriba', () => {
    // 1500 + 250 = 1750, que es múltiplo exacto de 50: la cota tiene que
    // saltar al siguiente escalón, porque 1750 clavado sigue estando DENTRO
    // de la banda según `zoneAt`.
    expect(sunlightAbove(DECK)).toBe(1800)
    expect(zoneAt(DECK, 1750)).toBe('within')
  })

  it('nunca devuelve una cota que siga estando dentro de la banda', () => {
    // Se barren todos los techos de metro en metro sobre el rango en que la
    // inversión del alisio vive: los múltiplos exactos de 50 son justo los que
    // fallaban, y una lista de cuatro casos elegidos a mano no los tocaba.
    for (let top = 700; top <= 2000; top++) {
      for (const resolutionM of [116, 246, 250]) {
        // La base se deriva del techo: una banda con `top` por debajo de `base`
        // no es un diagnóstico que `summarizeDeck` pueda producir, y barrerla
        // sólo probaría cómo se comporta el código ante datos imposibles.
        const deck = { ...DECK, base: top - 400, top, resolutionM }
        expect(zoneAt(deck, sunlightAbove(deck)), `techo ${top} ± ${resolutionM}`).toBe(
          'above',
        )
      }
    }
  })
})
