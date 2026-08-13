/**
 * La luz sobre el mar.
 *
 * Se comprueban las tres transiciones que se ven en pantalla —día a noche, sol
 * alto a sol bajo, cielo raso a cubierto— y que el dato medido de radiación
 * mande sobre la geometría cuando existe, que es lo que separa este mar de un
 * mar decorativo.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIMA_ONSET,
  calimaFactor,
  clearSkyIrradiance,
  clearnessIndex,
  oceanLight,
} from './light'

const LON = -17.7642
const LAT = 28.6835
const utc = (iso: string) => Date.parse(iso)
/** 13 de agosto de 2026, mediodía y medianoche solares aproximados. */
const NOON = utc('2026-08-13T13:10:00Z')
const NIGHT = utc('2026-08-13T02:00:00Z')

describe('cielo raso', () => {
  it('da valores de manual al mediodía de verano', () => {
    // Con el sol a 75° la irradiancia de cielo raso ronda los 1000 W/m², que es
    // la cifra que usa la industria fotovoltaica como condición estándar.
    const g = clearSkyIrradiance(75)
    expect(g).toBeGreaterThan(900)
    expect(g).toBeLessThan(1100)
  })

  it('cae a nada con el sol en el horizonte', () => {
    expect(clearSkyIrradiance(2)).toBe(0)
    expect(clearSkyIrradiance(-10)).toBe(0)
    expect(clearSkyIrradiance(10)).toBeLessThan(clearSkyIrradiance(30))
  })
})

describe('índice de claridad', () => {
  it('un día despejado se queda cerca del techo del modelo', () => {
    const k = clearnessIndex(950, 75)!
    expect(k).toBeGreaterThan(0.85)
    expect(k).toBeLessThan(1.2)
  })

  it('bajo el mar de nubes cae a un tercio', () => {
    expect(clearnessIndex(300, 75)!).toBeLessThan(0.35)
  })

  it('no se pronuncia sin medida ni con el sol demasiado bajo', () => {
    expect(clearnessIndex(null, 75)).toBeNull()
    expect(clearnessIndex(500, 1)).toBeNull()
  })

  it('recorta el exceso de las nubes rotas en vez de creérselo', () => {
    expect(clearnessIndex(2000, 75)).toBe(1.2)
  })
})

describe('calima', () => {
  it('no hace nada por debajo del umbral', () => {
    expect(calimaFactor(20)).toBe(0)
    expect(calimaFactor(CALIMA_ONSET)).toBe(0)
    expect(calimaFactor(null)).toBe(0)
  })

  it('crece hasta saturar en un episodio fuerte', () => {
    expect(calimaFactor(170)).toBeCloseTo(0.5, 1)
    expect(calimaFactor(500)).toBe(1)
  })

  it('vuelve el cielo dorado y difumina el reflejo', () => {
    const clean = oceanLight(NOON, LON, LAT, { pm10: 10, solarWm2: null })
    const dusty = oceanLight(NOON, LON, LAT, { pm10: 300, solarWm2: null })
    // Menos azul y más rojo: eso es un cielo de calima.
    expect(dusty.zenith[2]).toBeLessThan(clean.zenith[2])
    expect(dusty.zenith[0]).toBeGreaterThan(clean.zenith[0])
    expect(dusty.haze).toBeGreaterThan(clean.haze)
    // Y menos sol directo, aunque el sol siga donde estaba.
    expect(dusty.sunIntensity).toBeLessThan(clean.sunIntensity)
  })
})

describe('el ciclo del día', () => {
  it('de noche no hay sol y el cielo es casi negro', () => {
    const night = oceanLight(NIGHT, LON, LAT)
    expect(night.sunDir[2]).toBeLessThan(0)
    expect(night.sunIntensity).toBe(0)
    expect(night.zenith[2]).toBeLessThan(0.08)
  })

  it('a mediodía el sol está alto y blanco', () => {
    const noon = oceanLight(NOON, LON, LAT)
    expect(noon.sunDir[2]).toBeGreaterThan(0.9)
    expect(noon.sunIntensity).toBe(1)
    // Blanco: los tres canales parecidos.
    expect(Math.abs(noon.sunColor[0] - noon.sunColor[2])).toBeLessThan(0.2)
  })

  it('al atardecer el sol enrojece antes de apagarse', () => {
    const dusk = oceanLight(utc('2026-08-13T19:40:00Z'), LON, LAT)
    expect(dusk.sunColor[0] - dusk.sunColor[2]).toBeGreaterThan(0.3)
    expect(dusk.sunIntensity).toBeGreaterThan(0)
    expect(dusk.sunIntensity).toBeLessThan(1)
  })

  it('la luna solo alumbra de noche y según su fase', () => {
    // 1 de febrero de 2026 a las 22:00: luna llena y alta (ver `sun.test.ts`).
    const full = oceanLight(utc('2026-02-01T22:00:00Z'), LON, LAT)
    expect(full.moonIntensity).toBeGreaterThan(0.8)
    // A mediodía la luna no cuenta aunque esté en el cielo.
    expect(oceanLight(NOON, LON, LAT).moonIntensity).toBe(0)
  })
})

describe('la radiación medida manda', () => {
  it('un mediodía cubierto apaga el sol sin mover el sol', () => {
    const clear = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: 950 })
    const overcast = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: 180 })
    expect(overcast.sunIntensity).toBeLessThan(clear.sunIntensity * 0.5)
    expect(overcast.haze).toBeGreaterThan(clear.haze)
    expect(overcast.sunDir).toEqual(clear.sunDir)
  })

  it('sin medida se comporta como antes de tenerla', () => {
    const blind = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: null })
    const clear = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: 950 })
    expect(blind.clearness).toBeNull()
    expect(blind.sunIntensity).toBeCloseTo(clear.sunIntensity, 1)
  })
})
