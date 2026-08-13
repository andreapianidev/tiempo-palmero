/**
 * ETo, cultivos y balance hídrico.
 *
 * Las cifras de ETo son las que devolvió Open-Meteo el 13 ago 2026 para tres
 * cotas reales de La Palma; no son inventadas ni redondeadas para que salga
 * bonito el test.
 */

import { describe, expect, it } from 'vitest'
import {
  CROPS,
  CROPPED_HECTARES_2008,
  CATALOGUED_HECTARES_2008,
  cropByCode,
} from './crops'
import { sampleEto, type EtoField } from './eto'
import { DEFAULT_SPACING_M2, litresPerPlant, waterBalance } from './balance'

describe('catálogo de cultivos', () => {
  it('no hay códigos repetidos', () => {
    const codes = CROPS.map((c) => c.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('lo que no es cultivo NO tiene Kc, y no es lo mismo que tener Kc cero', () => {
    for (const code of ['16', '17', '36', '35', '39', '171']) {
      expect(cropByCode(code)!.kcMid).toBeNull()
      expect(cropByCode(code)!.family).toBe('sinCultivo')
    }
  })

  it('todo lo que se riega tiene un Kc en el rango de FAO-56', () => {
    for (const c of CROPS.filter((x) => x.family !== 'sinCultivo')) {
      expect(c.kcMid, c.label).not.toBeNull()
      // Fuera de [0,2 – 1,3] ya no es un Kc mid de ningún cultivo herbáceo ni
      // leñoso de la tabla 12; sería un error de transcripción.
      expect(c.kcMid!).toBeGreaterThanOrEqual(0.2)
      expect(c.kcMid!).toBeLessThanOrEqual(1.3)
    }
  })

  it('la superficie en cultivo es una fracción pequeña de lo catalogado', () => {
    // 6.873,6 de 70.666 ha: la capa de 2008 es sobre todo monte, erial y
    // huerta abandonada. Que salgan las dos cifras juntas evita presentar la
    // segunda como si fuera agricultura.
    expect(CROPPED_HECTARES_2008 / CATALOGUED_HECTARES_2008).toBeLessThan(0.12)
    expect(CROPPED_HECTARES_2008 / CATALOGUED_HECTARES_2008).toBeGreaterThan(0.08)
  })

  it('un código desconocido no se inventa un cultivo', () => {
    expect(cropByCode('V99')).toBeNull()
    expect(cropByCode('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------

/** Tres puntos reales, con la ETo que devolvió la API el 13 ago 2026. */
const FIELD: EtoField = {
  day: '2026-08-13',
  observedAt: 1_786_608_000_000,
  samples: [
    { lon: -17.8157, lat: 28.5062, elevation: 50, etoMm: 6.99, rainMm: 0 },
    { lon: -17.8563, lat: 28.6467, elevation: 870, etoMm: 5.43, rainMm: 0 },
    { lon: -17.8767, lat: 28.717, elevation: 2114, etoMm: 4.97, rainMm: 0 },
  ],
}

describe('sampleEto', () => {
  it('un punto sobre una muestra devuelve su valor exacto', () => {
    const r = sampleEto(FIELD, -17.8563, 28.6467, 870)!
    expect(r.etoMm).toBeCloseTo(5.43, 6)
  })

  it('la altitud manda sobre la distancia', () => {
    // Un punto de cumbre justo encima de la muestra de costa. Sin corrección
    // por altitud se llevaría los 6,99 mm del nivel del mar; con ella, algo
    // mucho más cercano a la ETo de las cotas altas.
    const cumbre = sampleEto(FIELD, -17.8157, 28.5062, 2100)!
    expect(cumbre.etoMm).toBeLessThan(6)
    const costa = sampleEto(FIELD, -17.8157, 28.5062, 50)!
    expect(costa.etoMm).toBeCloseTo(6.99, 6)
    expect(costa.etoMm).toBeGreaterThan(cumbre.etoMm)
  })

  it('el gradiente con la altitud se conserva, no se aplana', () => {
    // La ETo de la costa es ~40 % mayor que la de la cumbre. Si el muestreo
    // promediara los 54 puntos, esta diferencia se perdería y el mapa entero
    // diría lo mismo en todas partes.
    const bajo = sampleEto(FIELD, -17.85, 28.6, 100)!
    const alto = sampleEto(FIELD, -17.85, 28.6, 2000)!
    expect(bajo.etoMm / alto.etoMm).toBeGreaterThan(1.15)
  })

  it('un campo vacío devuelve null', () => {
    expect(sampleEto({ ...FIELD, samples: [] }, -17.88, 28.7, 500)).toBeNull()
  })
})

// ---------------------------------------------------------------------------

describe('waterBalance', () => {
  it('la platanera de costa pide más que la ETo de referencia', () => {
    // Kc 1,1: una platanera transpira MÁS que la pradera de referencia.
    const b = waterBalance('21', 6.99, 0)!
    expect(b.crop.label).toBe('Platanera Aire Libre')
    expect(b.etcMm).toBeCloseTo(7.689, 3)
    expect(b.etcMm).toBeGreaterThan(b.etoMm)
    expect(b.deficitMm).toBeCloseTo(7.689, 3)
    expect(b.surplusMm).toBe(0)
  })

  it('el aguacate pide menos que la platanera en el mismo sitio', () => {
    const platanera = waterBalance('21', 6.99, 0)!
    const aguacate = waterBalance('4', 6.99, 0)!
    expect(aguacate.etcMm).toBeLessThan(platanera.etcMm)
  })

  it('la lluvia descuenta', () => {
    const b = waterBalance('21', 6.99, 3)!
    expect(b.rainMm).toBe(3)
    expect(b.deficitMm).toBeCloseTo(4.689, 3)
  })

  it('llover de más NO produce riego negativo', () => {
    const b = waterBalance('21', 5, 40)!
    expect(b.deficitMm).toBe(0)
    expect(b.surplusMm).toBeCloseTo(34.5, 3)
  })

  it('el monte y la huerta abandonada no tienen balance, y eso no es cero', () => {
    expect(waterBalance('16', 6.99, 0)).toBeNull() // Monte
    expect(waterBalance('36', 6.99, 0)).toBeNull() // Huerta Abandonada
    expect(waterBalance('171', 6.99, 0)).toBeNull() // Urbano
  })

  it('un cultivo desconocido tampoco lo tiene', () => {
    expect(waterBalance('V99', 6.99, 0)).toBeNull()
  })

  it('una ETo imposible no se cuela', () => {
    expect(waterBalance('21', NaN, 0)).toBeNull()
    expect(waterBalance('21', -1, 0)).toBeNull()
  })

  it('una lluvia negativa se trata como cero, no como riego extra', () => {
    const b = waterBalance('21', 5, -3)!
    expect(b.rainMm).toBe(0)
    expect(b.deficitMm).toBeCloseTo(5.5, 5)
  })
})

describe('litresPerPlant', () => {
  it('un milímetro sobre un metro cuadrado es un litro', () => {
    expect(litresPerPlant(1, 1)).toBe(1)
  })

  it('la platanera de costa, hoy, pide unos 46 litros por planta', () => {
    // 6,99 mm × Kc 1,1 = 7,689 mm; con marco de 6 m²/planta salen 46,1 L.
    const b = waterBalance('21', 6.99, 0)!
    const litres = litresPerPlant(b.deficitMm, DEFAULT_SPACING_M2.platanera!)
    expect(litres).toBeCloseTo(46.1, 1)
  })

  it('cambiar el marco cambia el litro proporcionalmente', () => {
    expect(litresPerPlant(5, 12)).toBe(2 * litresPerPlant(5, 6))
  })
})
