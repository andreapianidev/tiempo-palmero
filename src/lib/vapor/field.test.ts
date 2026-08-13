import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CEILING_M,
  ESPY_M_PER_K,
  VPD_FULL_KPA,
  condensationCeiling,
  demandAt,
  type VaporField,
} from './field'
import type { CloudDeck } from '../clouds'

const deck = (over: Partial<CloudDeck> = {}): CloudDeck => ({
  present: true,
  base: 1200,
  top: 1600,
  resolutionM: 250,
  deltaT: 1.4,
  deltaRh: -35,
  coverage: 70,
  observedAt: 0,
  agreement: { withInversion: 4, total: 4 },
  ...over,
})

describe('el techo del vapor', () => {
  /**
   * LA REGLA QUE NO SE NEGOCIA. La banda del mar de nubes tiene ~250 m de
   * incertidumbre a cada lado. El vapor se corta por el borde de ABAJO de esa
   * banda, no por su centro: dibujar bruma dentro de la franja donde no se
   * puede afirmar que la haya sería afirmarlo.
   */
  it('con manta, corta por debajo de la banda de incertidumbre', () => {
    const c = condensationCeiling(deck(), 22, 14)
    expect(c.from).toBe('deck')
    expect(c.ceilingM).toBe(1200 - 250)
  })

  it('una inversión seca no es manta y no manda', () => {
    const c = condensationCeiling(deck({ present: false }), 22, 14)
    expect(c.from).toBe('lcl')
  })

  it('sin manta, el techo es el nivel de condensación por ascenso', () => {
    const c = condensationCeiling(null, 24, 16)
    expect(c.from).toBe('lcl')
    expect(c.ceilingM).toBeCloseTo(ESPY_M_PER_K * 8, 5)
  })

  it('con el aire ya saturado no se inventa un techo alto', () => {
    // T igual al rocío: no hay margen de ascenso antes de condensar.
    const c = condensationCeiling(null, 18, 18)
    expect(c.from).toBe('default')
    expect(c.ceilingM).toBe(DEFAULT_CEILING_M)
  })

  it('el techo por ascenso no se va por encima de la isla', () => {
    // 40 K de depresión darían 5.000 m, que es más alto que La Palma entera.
    expect(condensationCeiling(null, 45, 5).ceilingM).toBe(DEFAULT_CEILING_M)
  })
})

describe('la demanda evaporativa', () => {
  const field: VaporField = {
    bounds: [-18, 28.4, -17.7, 28.9],
    width: 2,
    height: 2,
    // Fila 0 = norte. Noroeste 0, noreste 1, suroeste 0, sureste 1.
    demand: new Float32Array([0, 1, 0, 1]),
    ceilingM: 1000,
    ceilingFrom: 'lcl',
    activeShare: 0.5,
  }

  it('interpola entre celdas en vez de dar escalones', () => {
    expect(demandAt(field, -18, 28.65)).toBeCloseTo(0, 5)
    expect(demandAt(field, -17.7, 28.65)).toBeCloseTo(1, 5)
    expect(demandAt(field, -17.85, 28.65)).toBeCloseTo(0.5, 5)
  })

  it('fuera del campo no hay demanda, y por tanto no hay vapor', () => {
    expect(demandAt(field, -16, 28.65)).toBe(0)
    expect(demandAt(field, -17.85, 30)).toBe(0)
  })

  /** El techo de la escala tiene que quedar por encima del p95 medido: 1,94 kPa. */
  it('la escala deja sitio a las tardes de sotavento', () => {
    expect(VPD_FULL_KPA).toBeGreaterThan(1.94)
    expect(VPD_FULL_KPA).toBeLessThan(3.51)
  })
})
