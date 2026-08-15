import { describe, expect, it } from 'vitest'
import { RainDrops } from './rain'
import type { Cloud } from './scene'

/** Un generador determinista, para que la prueba no dependa del azar. */
function seeded(seed = 1): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function cloud(precipMm: number, over: Partial<Cloud> = {}): Cloud {
  return {
    lon: -17.86,
    lat: 28.66,
    etage: 'low',
    base: 1200,
    top: 1700,
    radiusM: 1500,
    puffs: [
      { dx: 0, dy: 0, h: 0.5, radiusM: 800, seed: 0.5, phase: 0.1 },
      { dx: 1500, dy: 0, h: 0.5, radiusM: 800, seed: 0.5, phase: 0.4 },
      { dx: 0, dy: 1500, h: 0.5, radiusM: 800, seed: 0.5, phase: 0.7 },
    ],
    precipMm,
    density: 0.95,
    u: 0,
    v: 0,
    ...over,
  }
}

function alive(d: RainDrops): number {
  let n = 0
  for (let i = 0; i < d.capacity; i++) if (d.alpha[i] > 0) n++
  return n
}

describe('cortina de lluvia', () => {
  it('sin ninguna nube que llueva no enciende un solo hilo', () => {
    // El caso normal en esta isla: el sotavento tiene lluvia el 10 % de las
    // horas. Tiene que costar cero, no «poco».
    const d = new RainDrops(200)
    d.setClouds([cloud(0), cloud(0)])
    d.step(1, null, seeded())
    expect(alive(d)).toBe(0)
  })

  it('bajo una nube que llueve enciende hilos', () => {
    const d = new RainDrops(200)
    d.setClouds([cloud(1.5)])
    d.step(1, null, seeded())
    expect(alive(d)).toBeGreaterThan(0)
  })

  it('llueve más donde el modelo dice que llueve más', () => {
    // Si la cortina fuese igual de densa con 0,1 mm/h que con 3, la cifra del
    // modelo no significaría nada en pantalla.
    const flojo = new RainDrops(2000)
    flojo.setClouds([cloud(0.2)])
    flojo.step(1, null, seeded())

    const fuerte = new RainDrops(2000)
    fuerte.setClouds([cloud(3.5)])
    fuerte.step(1, null, seeded())

    expect(alive(fuerte)).toBeGreaterThan(alive(flojo))
  })

  it('los hilos caen, y caen a la velocidad terminal de una gota', () => {
    const d = new RainDrops(50)
    d.setClouds([cloud(2)])
    d.step(0.1, null, seeded())
    const i = [...Array(d.capacity).keys()].find((k) => d.alpha[k] > 0)!
    const before = d.alt[i]
    d.step(1, null, seeded())
    // 7 m/s durante 1 s. No se acelera «para que se note más».
    expect(before - d.alt[i]).toBeCloseTo(7, 5)
  })

  it('el hilo muere al llegar al suelo y no sigue hacia abajo', () => {
    // Sin esto la lluvia atravesaría la Cumbre y se vería llover por dentro de
    // la montaña, que es el mismo fallo que tuvo que arreglar la capa de viento.
    const d = new RainDrops(50)
    d.setClouds([cloud(2, { base: 100 })])
    const rand = seeded()
    d.step(0.1, null, rand)
    // Sin DEM el suelo está a cota 0; con una base a 100 m, en 20 s han caído
    // 140 m y todos tienen que haber muerto o haber vuelto a nacer más arriba.
    for (let s = 0; s < 40; s++) d.step(0.5, null, rand)
    for (let i = 0; i < d.capacity; i++) {
      if (d.alpha[i] > 0) expect(d.alt[i]).toBeGreaterThan(d.ground[i])
    }
  })

  it('la lluvia se inclina con el viento de su nube', () => {
    // La gota va dentro del aire. Bajo el alisio la cortina sale sesgada, que es
    // como cae en esta isla; a plomo no cae nunca.
    const d = new RainDrops(50)
    d.setClouds([cloud(2, { u: 12, v: 0 })])
    d.step(0.1, null, seeded())
    const i = [...Array(d.capacity).keys()].find((k) => d.alpha[k] > 0)!
    const before = d.lon[i]
    d.step(1, null, seeded())
    expect(d.lon[i]).toBeGreaterThan(before)
  })

  it('al cambiar de escena no deja colgando la lluvia de la anterior', () => {
    // Los hilos pertenecían a nubes que ya no existen. Sin apagarlos, quedaría
    // lloviendo un rato desde un sitio donde ya no hay nube.
    const d = new RainDrops(200)
    d.setClouds([cloud(3)])
    d.step(1, null, seeded())
    expect(alive(d)).toBeGreaterThan(0)
    d.setClouds([cloud(0)])
    expect(alive(d)).toBe(0)
  })

  it('nunca pasa de su cupo de hilos', () => {
    const d = new RainDrops(120)
    d.setClouds(Array.from({ length: 40 }, () => cloud(9)))
    const rand = seeded()
    for (let s = 0; s < 20; s++) d.step(0.2, null, rand)
    expect(alive(d)).toBeLessThanOrEqual(120)
  })
})
