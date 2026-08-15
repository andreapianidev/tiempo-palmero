import { describe, expect, it } from 'vitest'
import { MAP_BBOX } from '../geo'
import { buildCloudScene, type Cloud } from './scene'
import type { SkySample } from './model'
import { crossShade } from './crossshade'
import type { SkyPosition } from '../sun'

const calm = { u: 0, v: 0 }

function uniform(low: number, mid = 0, high = 0): SkySample[] {
  const out: SkySample[] = []
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 6; i++) {
      out.push({
        lon: MAP_BBOX.west + ((i + 0.5) / 6) * (MAP_BBOX.east - MAP_BBOX.west),
        lat: MAP_BBOX.south + ((j + 0.5) / 9) * (MAP_BBOX.north - MAP_BBOX.south),
        low,
        mid,
        high,
        precipMm: 0,
        wind: { low: calm, mid: calm, high: calm },
      })
    }
  }
  return out
}

const BAND = { base: 1200, top: 1700 }
const SEED = 20260815
const sun = (elevationDeg: number, azimuthDeg: number): SkyPosition => ({
  elevationDeg,
  azimuthDeg,
})
const scene = (low: number, mid = 0, high = 0) =>
  buildCloudScene(uniform(low, mid, high), BAND, SEED)

const mean = (v: Float32Array) => {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i]
  return v.length ? s / v.length : NaN
}

describe('la sombra que una nube le echa a otra', () => {
  it('un solo estrato con el sol alto no se tapa a sí mismo', () => {
    // UNA MANTA NO SE HACE SOMBRA. Todas sus nubes están al mismo nivel: la de
    // al lado no está entre ésta y el sol, está a su lado. Que esto valga 1 es
    // lo que dice que el rayo sale de la SUPERFICIE de la nube y no de su
    // centro — con el centro, cada nube arrancaba dentro de sus vecinas y una
    // manta de mediodía salía con 0,18 de luz, o sea pintada de noche.
    const beam = crossShade(scene(95), sun(70, 180))
    expect(mean(beam)).toBeGreaterThan(0.99)
  })

  it('pero con tres estratos, los de arriba apagan a los de abajo', () => {
    // Y esto es lo que la autosombra no podía dar: un cirro extendido le quita
    // el sol a los cúmulos que tiene debajo, y eso no depende de la forma de
    // ninguna nube sino de dónde está cada una.
    const clouds = scene(60, 50, 40)
    const beam = crossShade(clouds, sun(70, 180))
    expect(mean(beam)).toBeLessThan(0.85)
    const shaded = [...beam].filter((b) => b < 0.7).length
    expect(shaded / beam.length).toBeGreaterThan(0.2)
  })

  it('las de abajo se llevan la sombra, no las de arriba', () => {
    // La prueba del signo, otra vez: si la dirección de la marcha estuviera
    // invertida, la escena saldría igual de sombreada y al revés.
    const clouds = scene(60, 50, 40)
    const beam = crossShade(clouds, sun(70, 180))
    const at = (e: Cloud['etage']) => {
      const v = clouds.map((c, i) => ({ c, b: beam[i] })).filter((r) => r.c.etage === e)
      return v.reduce((a, r) => a + r.b, 0) / (v.length || 1)
    }
    expect(at('low')).toBeLessThan(at('high'))
    expect(at('high')).toBeGreaterThan(0.98)
  })

  it('con el sol rasante hasta un solo estrato se ensombrece', () => {
    // Al amanecer la nube de al lado SÍ está entre ésta y el sol: la sombra
    // pasa de vertical a horizontal, y eso es exactamente lo que se ve.
    const clouds = scene(95)
    const high = crossShade(clouds, sun(70, 180))
    const low = crossShade(clouds, sun(6, 95))
    expect(mean(low)).toBeLessThan(mean(high))
  })

  it('nunca devuelve más de uno ni menos de cero', () => {
    for (const el of [80, 30, 5, -3]) {
      const beam = crossShade(scene(80, 60, 40), sun(el, 120))
      for (let i = 0; i < beam.length; i++) {
        expect(beam[i]).toBeGreaterThanOrEqual(0)
        expect(beam[i]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('reutiliza el array que se le pasa', () => {
    const clouds = scene(70)
    const out = new Float32Array(clouds.length)
    expect(crossShade(clouds, sun(45, 120), out)).toBe(out)
  })

  it('con el cielo vacío no hay nada que sombrear', () => {
    expect(crossShade([], sun(45, 120)).length).toBe(0)
  })
})
