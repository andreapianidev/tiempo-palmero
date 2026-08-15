import { describe, expect, it } from 'vitest'
import { hazeExtinction, hazeFraction, HAZE_FACTOR, RAYLEIGH_PER_M } from './haze'
import { oceanLight } from '../ocean/light'

const LON = -17.86
const LAT = 28.66
const NOON = Date.UTC(2026, 7, 15, 13, 0)

const clean = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: null })
const dusty = oceanLight(NOON, LON, LAT, { pm10: 300, solarWm2: null })

describe('el aire que hay entre la cámara y lo que se mira', () => {
  it('con aire limpio se traga la isla a la mitad', () => {
    // La isla mide 45 km de punta a punta. Con Rayleigh puro, una nube al otro
    // extremo se ve con un 43 % de bruma encima: es lo que hace que una sierra
    // lejana se vea azulada, y es lo que faltaba.
    expect(hazeFraction(clean, 45_000)).toBeCloseTo(0.43, 2)
    // Y lo que está cerca no se toca: a 5 km, un 6 %.
    expect(hazeFraction(clean, 5_000)).toBeCloseTo(0.06, 2)
  })

  it('empieza en cero pegado a la cámara', () => {
    expect(hazeFraction(clean, 0)).toBe(0)
    expect(hazeFraction(clean, -100)).toBe(0)
  })

  it('la calima multiplica, y la calima es una medida', () => {
    // El PM10 de las estaciones, no un número de dibujo. Con un episodio
    // cerrado el horizonte desaparece: a 45 km, el 97 %.
    expect(hazeExtinction(dusty) / hazeExtinction(clean)).toBeCloseTo(HAZE_FACTOR, 5)
    expect(hazeFraction(dusty, 45_000)).toBeGreaterThan(0.95)
  })

  it('el aire limpio es el de la física, no uno elegido', () => {
    // Espesor óptico vertical 0,10 a 550 nm repartido en 8 km de altura de
    // escala. Si alguien lo cambia, que sea porque cambió la atmósfera.
    expect(RAYLEIGH_PER_M).toBeCloseTo(0.1 / 8000, 8)
    expect(hazeExtinction(clean)).toBeCloseTo(RAYLEIGH_PER_M, 8)
  })

  it('crece con la distancia y nunca pasa de uno', () => {
    let prev = -1
    for (const km of [0, 1, 5, 20, 50, 200, 1000]) {
      const v = hazeFraction(dusty, km * 1000)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
  })
})
