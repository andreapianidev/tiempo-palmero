/**
 * El peligro del día y las etiquetas del índice.
 *
 * Dos cosas se fijan aquí, y la segunda pesa más que la primera:
 *
 *  1. Que el percentil se lea bien de la curva y que las ausencias no se
 *     rellenen. Sin Fosberg no hay peligro; sin sequía, hay medio y se dice.
 *  2. Que **ninguna etiqueta de esta capa prometa nada**. Es la misma regla que
 *     ya vigilan los tests del CO₂ y de la cobertura móvil, y aquí importa más
 *     que en ninguna: un mapa de incendios que en alguna parte diga «seguro»,
 *     «sin riesgo» o «no arde» es peor que no tener mapa.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dangerOf, fireIndex, percentileIn } from './danger'
import { FIRE_BANDS, fireBand } from '../palette'
import { VARIABLES } from '../variables'
import type { FireModelSpec } from './model'

const spec = JSON.parse(
  readFileSync(new URL('../../../public/fire/model.json', import.meta.url), 'utf8'),
) as FireModelSpec

describe('el percentil dentro de la curva', () => {
  const curve = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

  it('el mínimo es 0 y el máximo es 1', () => {
    expect(percentileIn(curve, 0)).toBe(0)
    expect(percentileIn(curve, 100)).toBe(1)
  })

  it('interpola entre dos cuantiles', () => {
    expect(percentileIn(curve, 25)).toBeCloseTo(0.25, 6)
    expect(percentileIn(curve, 55)).toBeCloseTo(0.55, 6)
  })

  it('no extrapola: un día peor que el peor del archivo es el tope, no más', () => {
    // «Percentil 104» no existe. El archivo tiene 24 años y no sabe decir más.
    expect(percentileIn(curve, 500)).toBe(1)
    expect(percentileIn(curve, -500)).toBe(0)
  })

  it('un tramo plano de la curva no divide por cero', () => {
    expect(percentileIn([0, 5, 5, 5, 9], 5)).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(percentileIn([0, 5, 5, 5, 9], 5))).toBe(true)
  })
})

describe('el peligro del día', () => {
  it('sin Fosberg no hay peligro, y eso no es un peligro bajo', () => {
    expect(dangerOf(spec, { fosberg: null, daysSinceRain: 40 })).toBeNull()
  })

  it('sin sequía se devuelve la mitad que sí se sabe, marcada como tal', () => {
    const d = dangerOf(spec, { fosberg: 30, daysSinceRain: null })
    expect(d).not.toBeNull()
    expect(d!.drynessPercentile).toBeNull()
    expect(d!.value).toBe(d!.fosbergPercentile)
  })

  it('los dos factores tienen que estar altos: media geométrica, no aritmética', () => {
    // Seco pero en calma, o ventoso sobre suelo mojado, es justo la situación
    // en la que no pasa nada. Una media aritmética dejaría que un extremo
    // tapara al otro.
    const mixto = dangerOf(spec, { fosberg: 100, daysSinceRain: 0 })!
    const parejo = dangerOf(spec, { fosberg: 30, daysSinceRain: 30 })!
    expect(mixto.fosbergPercentile).toBeGreaterThan(0.9)
    expect(mixto.value).toBeLessThan((mixto.fosbergPercentile + 0) / 2 + 0.01)
    expect(parejo.value).toBeGreaterThan(0)
  })

  it('el índice no existe si le falta cualquiera de sus dos mitades', () => {
    expect(fireIndex(null, dangerOf(spec, { fosberg: 30, daysSinceRain: 10 }))).toBeNull()
    expect(fireIndex(0.5, null)).toBeNull()
  })
})

describe('las etiquetas no prometen nada', () => {
  // La misma lista que vigilan `co2.test.ts` y `coverage/field.test.ts`, más
  // las formas que solo tendrían sentido en una capa de incendios.
  const prohibidas = /segur|inocu|sin riesgo|no hay peligro|apto|no arde|a salvo|protegid/i

  it('ninguna banda del índice promete seguridad', () => {
    for (const band of FIRE_BANDS) {
      expect(band.label, band.label).not.toMatch(prohibidas)
    }
  })

  it('la banda más baja se llama «bajo», no «sin riesgo»', () => {
    // El 18,3 % de esta isla que ya se ha quemado incluye celdas que antes de
    // arder tenían el índice bajo. «Bajo» es una comparación; «sin riesgo»
    // sería una promesa.
    expect(FIRE_BANDS[0].label.toLowerCase()).toContain('bajo')
  })

  it('las cadenas del catálogo tampoco', () => {
    const v = VARIABLES.fire
    for (const text of [v.label, v.short, v.local ?? '', v.hint ?? '']) {
      expect(text, text).not.toMatch(prohibidas)
    }
  })

  it('la etiqueta dice que es experimental allá donde se lea sola', () => {
    // En un chip plegado o en una captura de pantalla la nota al pie no se ve,
    // así que la advertencia viaja pegada al nombre. Es la misma regla que puso
    // el año dentro de «Cobertura móvil (2013)».
    expect(VARIABLES.fire.label.toLowerCase()).toContain('experimental')
    expect((VARIABLES.fire.local ?? '').toLowerCase()).toContain('no es un aviso oficial')
  })

  it('en ningún sitio se llama probabilidad a lo que no lo es', () => {
    const v = VARIABLES.fire
    expect(v.label.toLowerCase()).not.toContain('probabilidad')
    expect(v.short.toLowerCase()).not.toContain('probabilidad')
  })
})

describe('los tramos del índice', () => {
  it('están en la escala de 0 a 100 que se pinta, no en la de 0 a 1', () => {
    // Es el fallo que no se ve: con los cortes en 0,15 y 0,35 sobre valores de
    // 0 a 100, la isla entera saldría del color más alto.
    expect(FIRE_BANDS[FIRE_BANDS.length - 1].from).toBeGreaterThan(1)
    expect(fireBand(5).label).toBe(FIRE_BANDS[0].label)
    expect(fireBand(95).label).toBe(FIRE_BANDS[FIRE_BANDS.length - 1].label)
  })

  it('la rampa que pinta la malla va en la misma escala que los tramos', () => {
    const stops = VARIABLES.fire.stops
    expect(stops[stops.length - 1][0]).toBeGreaterThan(1)
    expect(stops[0][0]).toBe(0)
  })
})
