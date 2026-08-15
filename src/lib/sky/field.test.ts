import { describe, expect, it } from 'vitest'
import { toComponents } from '../wind/field'
import { RAIN_HEAVY_MM, RAIN_MIN_MM, rainingCount, skyAt, skyAverage, windAt } from './field'
import type { SkySample } from './model'

const calm = { u: 0, v: 0 }

function sample(
  lon: number,
  lat: number,
  low: number,
  extra: Partial<SkySample> = {},
): SkySample {
  return {
    lon,
    lat,
    low,
    mid: 0,
    high: 0,
    precipMm: 0,
    wind: { low: calm, mid: calm, high: calm },
    ...extra,
  }
}

describe('leer la rejilla en un punto', () => {
  /**
   * El caso real que motiva todo el suavizado: el 15 de agosto de 2026 dos
   * puntos vecinos de la malla, separados unos 5 km, marcaban 0 % y 72 % de
   * nubosidad baja. Es el borde de la manta del alisio, y es real; lo que no
   * es real es que ese borde sea una línea recta.
   */
  it('reparte el salto de 0 a 72 en vez de cortarlo en seco', () => {
    // Dos puntos a ~5 km (0,045° de latitud ≈ 5 km).
    const samples = [sample(-17.86, 28.62, 0), sample(-17.86, 28.667, 72)]

    const a = skyAt(samples, -17.86, 28.62)
    const b = skyAt(samples, -17.86, 28.667)
    const mid = skyAt(samples, -17.86, 28.6435)

    // Encima de cada muestra manda esa muestra.
    expect(a.low).toBeLessThan(12)
    expect(b.low).toBeGreaterThan(60)
    // Y en medio hay un valor intermedio de verdad, no uno de los dos extremos.
    expect(mid.low).toBeGreaterThan(15)
    expect(mid.low).toBeLessThan(57)
  })

  it('nunca inventa nubosidad donde el modelo dice cero', () => {
    // La otra orilla del suavizado, y la que importa: es una media ponderada,
    // así que el resultado no puede salirse del intervalo de las muestras. Con
    // todo a cero, cero — nada de neblina de cortesía.
    const samples = [sample(-17.9, 28.5, 0), sample(-17.8, 28.7, 0)]
    expect(skyAt(samples, -17.86, 28.6).low).toBe(0)
  })

  it('no se sale del intervalo de las muestras en ningún punto', () => {
    const samples = [sample(-17.9, 28.5, 20), sample(-17.8, 28.7, 80)]
    for (let i = 0; i <= 20; i++) {
      const { low } = skyAt(samples, -17.9 + (i / 20) * 0.1, 28.5 + (i / 20) * 0.2)
      expect(low).toBeGreaterThanOrEqual(20)
      expect(low).toBeLessThanOrEqual(80)
    }
  })

  it('sin muestras devuelve cielo raso en vez de NaN', () => {
    expect(skyAt([], -17.86, 28.66)).toEqual({ low: 0, mid: 0, high: 0, precipMm: 0 })
  })
})

describe('viento de un estrato', () => {
  /**
   * La regla de toda la aplicación: el viento se interpola en componentes y
   * nunca en grados. La media aritmética de 350° y 10° es 180°, que es el
   * viento exactamente contrario al real.
   */
  it('promedia 350° y 10° como un viento del norte, no del sur', () => {
    const samples = [
      sample(-17.9, 28.6, 0, { wind: { low: toComponents(5, 350), mid: calm, high: calm } }),
      sample(-17.8, 28.6, 0, { wind: { low: toComponents(5, 10), mid: calm, high: calm } }),
    ]
    const w = windAt(samples, 'low', -17.85, 28.6)
    // Viento DEL norte: empuja hacia el sur, así que la componente norte es
    // negativa y la este, casi nula.
    expect(w.v).toBeLessThan(-4)
    expect(Math.abs(w.u)).toBeLessThan(1)
  })

  it('cada estrato se lee por separado, sin contagiarse', () => {
    // Es la razón de ser de pedir viento a tres niveles: el 15 de agosto de
    // 2026 el aire de 900 hPa venía del 44° y el de 700 hPa del 275°.
    const samples = [
      sample(-17.86, 28.66, 0, {
        wind: { low: toComponents(5, 44), mid: toComponents(6, 275), high: calm },
      }),
    ]
    const low = windAt(samples, 'low', -17.86, 28.66)
    const mid = windAt(samples, 'mid', -17.86, 28.66)
    // Del noreste empuja al suroeste; del oeste empuja al este.
    expect(low.u).toBeLessThan(0)
    expect(mid.u).toBeGreaterThan(0)
  })
})

describe('resumen para el panel', () => {
  it('promedia sobre el área, que es lo que significa «cuánta nube hay»', () => {
    // Media y no mediana, al revés que en `clouds.ts`: la mediana del 15 de
    // agosto habría dicho 0 % con el norte de la isla al 72 %.
    const samples = [
      ...Array.from({ length: 5 }, (_, i) => sample(-17.9, 28.5 + i * 0.01, 0)),
      sample(-17.8, 28.8, 72),
    ]
    const avg = skyAverage({ samples, observedAt: 1, isDay: true })!
    expect(avg.low).toBeCloseTo(12, 0)
  })

  it('sin rejilla no resume nada', () => {
    expect(skyAverage(null)).toBeNull()
    expect(skyAverage({ samples: [], observedAt: 1, isDay: true })).toBeNull()
  })

  it('cuenta los puntos con lluvia por encima del umbral', () => {
    const samples = [
      sample(-17.9, 28.5, 50, { precipMm: 0 }),
      sample(-17.8, 28.6, 50, { precipMm: 0.04 }),
      sample(-17.7, 28.7, 50, { precipMm: 0.2 }),
    ]
    // 0,04 se queda fuera y 0,2 entra: la mediana de las horas con lluvia en
    // esta isla es justo 0,20 mm/h, así que el umbral tiene que dejarla pasar.
    expect(rainingCount({ samples, observedAt: 1, isDay: true })).toBe(1)
  })
})

describe('umbrales de lluvia', () => {
  it('el de lluvia intensa cae dentro del rango real de la isla', () => {
    // Las dos orillas, medidas sobre dos años de archivo horario (ago 2024 –
    // ago 2026) en barlovento, cumbre y sotavento: el percentil 99 de las horas
    // con lluvia está en 3,6 / 3,9 / 5,1 mm/h y el máximo absoluto en 14,2.
    // El umbral tiene que quedar por debajo de ese p99 —si no, no se enseña
    // nunca— y muy por debajo del máximo, o no distinguiría nada.
    expect(RAIN_HEAVY_MM).toBeLessThan(3.6)
    expect(RAIN_HEAVY_MM).toBeLessThan(14.2 / 2)
    // Y por encima de la mediana de las horas con lluvia, 0,20 mm/h: si no,
    // la lluvia fina del alisio saldría marcada como chubasco.
    expect(RAIN_HEAVY_MM).toBeGreaterThan(0.2)
  })

  it('el mínimo deja pasar la lluvia fina, que es la normal aquí', () => {
    expect(RAIN_MIN_MM).toBeLessThan(0.2)
    expect(RAIN_MIN_MM).toBeGreaterThan(0)
  })
})
