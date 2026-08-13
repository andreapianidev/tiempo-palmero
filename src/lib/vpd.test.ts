/**
 * El déficit de presión de vapor, y por qué no es la humedad relativa disfrazada.
 */

import { describe, expect, it } from 'vitest'
import { saturationVapourPressure, vapourPressureDeficit } from './psychro'
import { VARIABLES, VARIABLE_ORDER, vpdBand } from './variables'
import { BOUNDS, stationReading, type Station } from './quality'

describe('vapourPressureDeficit', () => {
  it('es cero cuando el aire está saturado, a cualquier temperatura', () => {
    for (const tempC of [-5, 0, 12, 20, 28, 40]) {
      expect(vapourPressureDeficit(tempC, 100)).toBeCloseTo(0, 10)
    }
  })

  it('con 0 % de humedad vale la presión de saturación entera', () => {
    // es(20 °C) = 23,4 hPa = 2,34 kPa. Es la definición, no una aproximación.
    expect(vapourPressureDeficit(20, 0)).toBeCloseTo(saturationVapourPressure(20) / 10, 10)
  })

  it('la misma humedad relativa es casi el triple de demanda en la costa que en la cumbre', () => {
    // El caso que justifica la variable entera: 80 % no significa lo mismo a
    // 12 °C que a 28 °C, y sobre esta isla las dos cosas pasan a la vez.
    const cumbre = vapourPressureDeficit(12, 80)
    const costa = vapourPressureDeficit(28, 80)
    expect(cumbre).toBeCloseTo(0.28, 2)
    expect(costa).toBeCloseTo(0.76, 2)
    expect(costa / cumbre).toBeGreaterThan(2.5)
  })

  it('crece con la temperatura y decrece con la humedad', () => {
    expect(vapourPressureDeficit(25, 50)).toBeGreaterThan(vapourPressureDeficit(20, 50))
    expect(vapourPressureDeficit(25, 70)).toBeLessThan(vapourPressureDeficit(25, 50))
  })

  it('nunca es negativo, aunque la humedad venga fuera de rango', () => {
    // El modelo lineal puede pasarse de 100 al extrapolar en altitud.
    expect(vapourPressureDeficit(20, 130)).toBe(0)
    expect(vapourPressureDeficit(20, -10)).toBeCloseTo(
      vapourPressureDeficit(20, 0),
      10,
    )
  })

  it('el peor caso físico de la isla cabe en BOUNDS.vpd', () => {
    // 45 °C es el techo de `temperature`; con 0 % de humedad sale la cifra más
    // alta que este campo puede tomar sin que algo esté roto.
    const worst = vapourPressureDeficit(BOUNDS.temperature[1], 0)
    expect(worst).toBeLessThanOrEqual(BOUNDS.vpd[1])
    expect(worst).toBeGreaterThan(9)
  })
})

describe('vpdBand', () => {
  it('ordena los cuatro tramos de manejo', () => {
    expect(vpdBand(0.2)).toBe('humid')
    expect(vpdBand(0.4)).toBe('comfortable')
    expect(vpdBand(0.9)).toBe('comfortable')
    expect(vpdBand(1.0)).toBe('demanding')
    expect(vpdBand(1.59)).toBe('demanding')
    expect(vpdBand(1.6)).toBe('stress')
    expect(vpdBand(3.4)).toBe('stress')
  })
})

// ---------------------------------------------------------------------------

function station(over: Partial<Station>): Station {
  return {
    entityId: 'TEST',
    name: 'Estación de prueba',
    lon: -17.88,
    lat: 28.68,
    elevation: 800,
    temperature: null,
    relativehumidity: null,
    dewpoint: null,
    observedAt: Date.now(),
    ...over,
  } as Station
}

describe('stationReading("vpd")', () => {
  it('sale de T y humedad, y va marcado como calculado', () => {
    const r = stationReading(station({ temperature: 20, relativehumidity: 60 }), 'vpd')
    expect(r).not.toBeNull()
    expect(r!.derived).toBe(true)
    expect(r!.value).toBeCloseTo(0.935, 3)
  })

  it('también sale con T y rocío, sin columna de humedad', () => {
    const r = stationReading(station({ temperature: 20, dewpoint: 12 }), 'vpd')
    expect(r).not.toBeNull()
    expect(r!.value).toBeGreaterThan(0)
  })

  it('sin temperatura no hay VPD', () => {
    expect(stationReading(station({ relativehumidity: 60 }), 'vpd')).toBeNull()
  })

  it('el sensor de humedad muerto NO se cuela con aspecto de cifra buena', () => {
    // CABLPA BELLIDO publicando 1 % a 852 m. El VPD que sale (2,3 kPa) está
    // dentro del rango físico y pasaría desapercibido; lo que lo delata es el
    // punto de rocío que implica, −38,4 °C, fuera de BOUNDS.dewpoint.
    const dead = station({ temperature: 20, relativehumidity: 1 })
    expect(stationReading(dead, 'dewpoint')).toBeNull()
    expect(stationReading(dead, 'vpd')).toBeNull()
  })
})

describe('catálogo de variables', () => {
  it('cada variable del orden tiene ficha completa', () => {
    for (const id of VARIABLE_ORDER) {
      const spec = VARIABLES[id]
      expect(spec.id).toBe(id)
      expect(spec.label.length).toBeGreaterThan(0)
      expect(spec.short.length).toBeGreaterThan(0)
      expect(spec.unit.length).toBeGreaterThan(0)
      expect(spec.stops.length).toBeGreaterThan(1)
    }
  })

  it('el orden cubre TODAS las claves del catálogo', () => {
    // Si alguien añade una variable y se olvida del orden, la web la pinta y
    // el móvil no. Esto lo detiene aquí.
    expect([...VARIABLE_ORDER].sort()).toEqual(Object.keys(VARIABLES).sort())
  })

  it('lo derivado lleva su explicación, y lo medido no la necesita', () => {
    for (const id of VARIABLE_ORDER) {
      const spec = VARIABLES[id]
      if (spec.derived) expect(spec.hint).toBeTruthy()
    }
  })

  it('las paradas de cada paleta van en orden creciente', () => {
    for (const id of VARIABLE_ORDER) {
      const values = VARIABLES[id].stops.map(([v]) => v)
      expect(values).toEqual([...values].sort((a, b) => a - b))
    }
  })
})
