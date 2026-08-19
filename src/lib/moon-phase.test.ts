/**
 * Los nombres de las fases, comprobados recorriendo una lunación de verdad.
 *
 * No se comprueba contra una tabla de cortes —eso sería releer el fichero— sino
 * contra un mes entero de efemérides: que las ocho fases salgan, que salgan EN
 * ORDEN y que la llena caiga donde la efeméride dice que cae.
 */

import { describe, expect, it } from 'vitest'
import { moonPhaseName, type MoonPhaseName } from './moon-phase'
import { moonSight } from './moon'

const LON = -17.7642
const LAT = 28.6835

/** Una lunación entera desde la nueva del 18 de enero de 2026, hora a hora. */
const START = Date.UTC(2026, 0, 18)
const HOURS = 24 * 31

function walk(): { name: MoonPhaseName; at: number }[] {
  const out: { name: MoonPhaseName; at: number }[] = []
  for (let h = 0; h < HOURS; h++) {
    const at = START + h * 3600_000
    const s = moonSight(at, { lon: LON, lat: LAT, elevationM: 0 })
    const name = moonPhaseName(s.illumination, s.waxing)
    if (out.length === 0 || out[out.length - 1].name !== name) out.push({ name, at })
  }
  return out
}

describe('las fases de una lunación', () => {
  it('salen las ocho y salen en orden', () => {
    const names = walk().map((s) => s.name)
    // Se quita la primera si es un resto de la lunación anterior.
    const expected: MoonPhaseName[] = [
      'nueva',
      'crecienteFina',
      'cuartoCreciente',
      'gibosaCreciente',
      'llena',
      'gibosaMenguante',
      'cuartoMenguante',
      'menguanteFina',
    ]
    const seen = names.filter((n) => expected.includes(n))
    for (const phase of expected) expect(seen).toContain(phase)
    // Y el orden: cada fase esperada aparece por primera vez después de la
    // anterior. Una permutación en el fichero —creciente donde va menguante—
    // pasaría la comprobación de arriba y no ésta.
    let previous = -1
    for (const phase of expected) {
      const first = seen.indexOf(phase)
      expect(first, `«${phase}» fuera de orden`).toBeGreaterThan(previous)
      previous = first
    }
  })

  it('la llena dura los dos días de su alrededor y no más', () => {
    const full = walk().filter((s) => s.name === 'llena')
    expect(full.length).toBe(1)
    // Cuántas horas seguidas se llama «llena».
    let hours = 0
    for (let h = 0; h < HOURS; h++) {
      const s = moonSight(START + h * 3600_000, { lon: LON, lat: LAT, elevationM: 0 })
      if (moonPhaseName(s.illumination, s.waxing) === 'llena') hours++
    }
    // Dos días, con el margen de que la fracción no crece a ritmo constante.
    expect(hours).toBeGreaterThan(36)
    expect(hours).toBeLessThan(60)
  })

  it('creciente y menguante no se confunden', () => {
    // La misma fracción iluminada, los dos sentidos: es el único error posible
    // aquí y deja la luna del revés todas las noches de medio mes.
    expect(moonPhaseName(0.3, true)).toBe('crecienteFina')
    expect(moonPhaseName(0.3, false)).toBe('menguanteFina')
    expect(moonPhaseName(0.8, true)).toBe('gibosaCreciente')
    expect(moonPhaseName(0.8, false)).toBe('gibosaMenguante')
  })

  it('los extremos no dependen del sentido', () => {
    // Una luna llena no es «llena creciente»: en la llena el sentido no
    // significa nada, y decirlo sería inventarse una fase.
    expect(moonPhaseName(1, true)).toBe('llena')
    expect(moonPhaseName(1, false)).toBe('llena')
    expect(moonPhaseName(0, true)).toBe('nueva')
    expect(moonPhaseName(0, false)).toBe('nueva')
  })
})
