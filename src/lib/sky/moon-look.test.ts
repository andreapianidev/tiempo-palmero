import { describe, expect, it } from 'vitest'
import { moonLook } from './moon-look'

/** El Roque: 0,130 mag por masa de aire, la mediana publicada del sitio. */
const ROQUE_K = 0.13
/** El nivel del mar de la misma isla: casi el doble de aire por delante. */
const SEA_K = 0.252

const night = (elevationDeg: number, k = ROQUE_K, illumination = 1) =>
  moonLook({
    apparentElevationDeg: elevationDeg,
    illumination,
    extinctionK: k,
    sunElevationDeg: -30,
  })

describe('el color de la luna con la altura', () => {
  it('en el cenit es del color de la luna y no blanco', () => {
    const c = night(90).color
    // En el cenit ya hay una masa de aire por delante, así que el albedo —1 /
    // 0,965 / 0,895— sale con el azul algo comido: 1 / 0,920 / 0,769 desde el
    // Roque. Lo que se comprueba es el ORDEN, que es lo que distingue una luna
    // de un círculo blanco.
    expect(c[0]).toBeCloseTo(1, 6)
    expect(c[1]).toBeCloseTo(0.92, 2)
    expect(c[2]).toBeCloseTo(0.769, 2)
  })

  it('se enrojece al bajar, y bastante', () => {
    const high = night(60).color
    const low = night(3).color
    // Lo que se compara es la RAZÓN azul/rojo, que es lo que significa
    // «enrojecerse». Medido desde el Roque: 0,751 a 60° de altura y 0,089 a 3°.
    // O sea que la luna que sale por el mar es de color ladrillo, y lo es
    // porque el aire se lleva el azul, no porque lo diga una paleta.
    const highRatio = high[2] / high[0]
    const lowRatio = low[2] / low[0]
    expect(highRatio).toBeCloseTo(0.751, 2)
    expect(lowRatio).toBeCloseTo(0.089, 2)
  })

  it('desde el mar se enrojece más que desde la cumbre, con la misma altura', () => {
    // Es la diferencia que se ve de verdad subiendo a la Cumbre, y sale sola de
    // que el coeficiente de extinción del sitio entre en la cuenta.
    const summit = night(5, ROQUE_K).color
    const sea = night(5, SEA_K).color
    expect(sea[2] / sea[0]).toBeLessThan(summit[2] / summit[0])
  })

  it('el canal más fuerte se queda en 1: la luna baja cambia de color, no se apaga', () => {
    // LA OTRA ORILLA. Sin renormalizar, una luna a 2° saldría con el rojo en
    // 0,55 y el azul en 0,15: correctamente enrojecida y más oscura que el
    // cielo que tiene detrás, que es lo contrario de una luna.
    for (const h of [90, 40, 10, 2, 0]) {
      const c = night(h).color
      expect(Math.max(...c)).toBeCloseTo(1, 9)
    }
  })
})

describe('el brillo', () => {
  it('de día se apaga hasta rozar el cielo, pero no se apaga del todo', () => {
    const atNight = moonLook({
      apparentElevationDeg: 40,
      illumination: 0.5,
      extinctionK: ROQUE_K,
      sunElevationDeg: -20,
    })
    const atNoon = moonLook({
      apparentElevationDeg: 40,
      illumination: 0.5,
      extinctionK: ROQUE_K,
      sunElevationDeg: 60,
    })
    expect(atNight.dayness).toBe(0)
    expect(atNoon.dayness).toBe(1)
    expect(atNoon.luminance).toBeLessThan(atNight.luminance)
    // Media isla ve la luna por la mañana: apagarla del todo sería más cómodo
    // que cierto.
    expect(atNoon.luminance).toBeGreaterThan(0.5)
  })

  it('la luz cenicienta crece con el creciente y desaparece con la llena', () => {
    const thin = night(40, ROQUE_K, 0.08).earthshine
    const half = night(40, ROQUE_K, 0.5).earthshine
    const full = night(40, ROQUE_K, 1).earthshine
    expect(thin).toBeGreaterThan(half)
    expect(half).toBeGreaterThan(full)
    expect(full).toBe(0)
    // Y siempre muy por debajo del lado iluminado: es una ceniza, no una
    // segunda luna.
    expect(thin).toBeLessThan(0.1)
  })

  it('de día no hay ceniza que valga', () => {
    const day = moonLook({
      apparentElevationDeg: 40,
      illumination: 0.1,
      extinctionK: ROQUE_K,
      sunElevationDeg: 45,
    })
    expect(day.earthshine).toBe(0)
  })
})
