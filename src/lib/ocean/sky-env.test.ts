/**
 * La convención del mapa de cielo. Si esto falla, las nubes del reflejo del
 * agua salen giradas o invertidas sin que ningún otro número se entere.
 */

import { describe, expect, it } from 'vitest'
import { cloudEnvRect, envDirection, ENV_H, ENV_W } from './sky-env'

describe('la convención equirect', () => {
  it('el norte está en el centro horizontal y el horizonte en la mitad vertical', () => {
    const r = cloudEnvRect(-17.86, 28.76, 0, 1000) // 10 km al norte, a ras del agua
    expect(r.u).toBeCloseTo(0.5, 6)
    expect(r.v).toBeCloseTo(0.5, 2)
  })

  it('el este cae en la cuarta parte y el oeste en las tres cuartas', () => {
    const este = cloudEnvRect(-17.86 + 0.18, 28.66, 0, 1000)
    const oeste = cloudEnvRect(-17.86 - 0.18, 28.66, 0, 1000)
    expect(este.u).toBeCloseTo(0.75, 2)
    expect(oeste.u).toBeCloseTo(0.25, 2)
  })

  it('una nube al nivel del agua no se ve: cae en el horizonte', () => {
    const r = cloudEnvRect(-17.86 + 0.1, 28.66, 0, 1000)
    expect(r.v).toBeCloseTo(0.5, 2)
  })

  it('la misma nube levantada a su cota sube sobre el horizonte', () => {
    const baja = cloudEnvRect(-17.86 + 0.1, 28.66, 0, 1000)
    const alta = cloudEnvRect(-17.86 + 0.1, 28.66, 1500, 1000)
    expect(alta.v).toBeLessThan(baja.v)
    // 1500 m vistos desde 9,8 km son 8,7° sobre el horizonte: 0,049 del
    // rango vertical, medido aquí mismo.
    expect(baja.v - alta.v).toBeCloseTo(8.73 / 180, 2)
  })

  it('el radio crece con la distancia angular, y el disco nunca es menor que dos texeles', () => {
    const cerca = cloudEnvRect(-17.86 + 0.09, 28.66, 1200, 2600)
    const lejos = cloudEnvRect(-17.86 + 0.45, 28.66, 1200, 2600)
    expect(cerca.radiusTexels).toBeGreaterThan(lejos.radiusTexels)
    expect(lejos.radiusTexels).toBeGreaterThanOrEqual(2)
    // El disco cabe en la textura entera: una nube de 2,6 km a 10 km subtiende
    // unos 15°, o sea 10 texeles de 256.
    expect(cerca.radiusTexels).toBeLessThan(ENV_W)
  })

  it('la ida y la vuelta se reconcilian: dirección → UV es la inversa de UV → dirección', () => {
    for (const [u, v] of [
      [0.5, 0.5],
      [0.75, 0.5],
      [0.25, 0.25],
      [0.1, 0.9],
    ] as const) {
      const [x, y, z] = envDirection(u, v)
      // La misma cuenta que `envUv` en GLSL, escrita aquí como test:
      // azimut desde el norte, `atan2(x, y)`.
      const az = Math.atan2(x, y)
      const el = Math.asin(Math.max(-1, Math.min(1, z)))
      expect((az / (2 * Math.PI) + 0.5 + 1) % 1).toBeCloseTo(u, 6)
      expect(0.5 - el / Math.PI).toBeCloseTo(v, 6)
    }
  })

  it('la textura es baja y ancha: el horizonte entero tiene el doble de texeles que el cielo de cénit a nadir', () => {
    expect(ENV_W).toBe(2 * ENV_H)
  })
})
