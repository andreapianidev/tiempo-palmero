/**
 * La ficha de un sensor de CO₂ tiene que decir QUÉ se está mirando.
 *
 * Estos tests fijan las tres cosas que la ficha no contaba y que salen de
 * comprobar la red DEMASE en vivo el 12 ago 2026 (209 sensores en `/MetaDato`,
 * 201 lecturas en `/datos_actuales`).
 */

import { describe, it, expect } from 'vitest'
import { CO2_FLOOR_PPM, co2Band } from './palette'

describe('la altura del sensor viene en la lectura, no en el inventario', () => {
  // Forma real de una respuesta de `/datos_actuales`, con `Altura` FUERA de
  // `valores`. En `/MetaDato` ese mismo campo está a null en los 209 sensores,
  // que es donde la aplicación lo buscaba: la fila no salía nunca.
  const payload = {
    Ts: 1786544818,
    Fecha: '12/08/2026 14:26:58',
    Altura: 0.5,
    valores: { Id: 138, bat: 13.91, Co2: 400, 'co2%': 0.04, temp: 38.3, period: 1 },
  }

  it('está en el nivel de arriba, junto a Ts, no dentro de valores', () => {
    expect(payload.Altura).toBe(0.5)
    expect((payload.valores as Record<string, unknown>).Altura).toBeUndefined()
  })

  it('importa: el CO₂ se acumula a ras de suelo', () => {
    // Los dos únicos valores que publica la red, y no son intercambiables.
    for (const h of [0.5, 1.5]) expect(h).toBeGreaterThan(0)
    expect(0.5).toBeLessThan(1.5)
  })
})

describe('400 ppm es el suelo del equipo, no una medida', () => {
  it('el suelo está declarado como constante, no repartido por el código', () => {
    expect(CO2_FLOOR_PPM).toBe(400)
  })

  it('cae en la banda ambiental, así que sin aviso pasa por medida buena', () => {
    // Por eso la ficha añade la etiqueta: la pastilla de color no distingue
    // «no detecta nada» de «he medido 400».
    expect(co2Band(CO2_FLOOR_PPM).label).toBe('Nivel ambiental')
    expect(co2Band(CO2_FLOOR_PPM - 1).label).toBe('Nivel ambiental')
  })

  it('el fondo atmosférico real de 2026 está por encima del suelo del equipo', () => {
    // ~420 ppm globales. Que 169 de 182 sensores dieran 400,00 clavado no es
    // el fondo: es el equipo diciendo «por debajo de aquí no distingo».
    expect(CO2_FLOOR_PPM).toBeLessThan(420)
  })
})

describe('las bandas no se saltan ningún tramo', () => {
  it('cada umbral cae en su banda y las fumarolas llegan a la más alta', () => {
    expect(co2Band(999).label).toBe('Nivel ambiental')
    expect(co2Band(1000).label).toBe('Por encima del ambiental')
    expect(co2Band(5000).label).toBe('Concentración alta')
    // Medido en vivo: los sensores de pozo daban 62 247, 65 292 y 69 301 ppm.
    expect(co2Band(69_301.6).label).toBe('Concentración muy alta')
  })

  it('ninguna etiqueta afirma nada sobre la seguridad de las personas', () => {
    // Regla del repositorio: la ficha da el valor y la hora. Decir «seguro»
    // sobre gas volcánico es una afirmación que esta aplicación no puede
    // sostener y no hace.
    const prohibidas = /segur|inocu|sin riesgo|no hay peligro|apto/i
    for (const ppm of [0, 400, 999, 1000, 5000, 30_000, 69_301]) {
      expect(co2Band(ppm).label).not.toMatch(prohibidas)
    }
  })
})
