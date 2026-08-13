import { describe, expect, it } from 'vitest'
import { ParticleSystem, TAIL_LENGTH } from './particles'
import {
  fillTrailVertices,
  mercatorX,
  mercatorY,
  STRONG_WIND_MS,
  trailBufferSize,
  VERTEX_FLOATS,
} from './trails'

/**
 * Una partícula con la estela ya puesta a mano, para no depender de la
 * simulación: aquí se comprueba el VOLCADO, no el movimiento.
 *
 * Va por la costa de Tijarafe hacia el este, un punto cada milésima de grado.
 */
function oneParticle(fill = 3): ParticleSystem {
  const p = new ParticleSystem(1)
  p.lon[0] = -17.95
  p.lat[0] = 28.7
  p.speed[0] = 7
  p.station[0] = 0.5
  p.elevation[0] = 300
  for (let k = 0; k < fill; k++) {
    p.tailLon[k] = -17.95 - (k + 1) * 0.001
    p.tailLat[k] = 28.7
    p.tailElevation[k] = 300 - (k + 1) * 10
  }
  p.tailFill[0] = fill
  return p
}

const buffer = () => new Float32Array(trailBufferSize(1))

/** Los diez flotantes del vértice `v`, ya con nombre. */
function vertex(out: Float32Array, v: number) {
  const o = v * VERTEX_FLOATS
  return {
    pos: [out[o], out[o + 1], out[o + 2]],
    other: [out[o + 3], out[o + 4], out[o + 5]],
    side: out[o + 6],
    alpha: out[o + 7],
    speed: out[o + 8],
    station: out[o + 9],
  }
}

describe('las estelas volcadas a vértices', () => {
  it('escribe dos vértices por segmento y ni uno más', () => {
    const out = buffer()
    expect(fillTrailVertices(oneParticle(3), out, 0)).toBe(6)
  })

  it('una partícula sin estela no escribe nada', () => {
    const out = buffer()
    expect(fillTrailVertices(oneParticle(0), out, 0)).toBe(0)
  })

  it('el primer segmento sale de la posición actual, que aún no está apuntada', () => {
    const out = buffer()
    fillTrailVertices(oneParticle(3), out, 0)
    // La cabeza de la estela es dónde está la partícula AHORA; si saliera del
    // primer punto apuntado, la estela se quedaría clavada 40 ms cada vez.
    // Siete decimales y no más: el buffer es de flotantes de 32 bits, que es lo
    // que se le manda a la GPU, y ahí no caben quince cifras.
    expect(vertex(out, 0).pos[0]).toBeCloseTo(mercatorX(-17.95), 7)
    expect(vertex(out, 1).pos[0]).toBeCloseTo(mercatorX(-17.951), 7)
  })

  /*
   * ESTOS DOS SON EL MOTIVO DE QUE EXISTA EL FICHERO. El halo se desplaza
   * perpendicular al segmento, y la perpendicular la calcula el shader con lo
   * que le llegue aquí escrito.
   */
  it('cada vértice lleva el extremo CONTRARIO del segmento', () => {
    const out = buffer()
    fillTrailVertices(oneParticle(3), out, 0)
    for (let s = 0; s < 3; s++) {
      const a = vertex(out, s * 2)
      const b = vertex(out, s * 2 + 1)
      expect(a.other).toEqual(b.pos)
      expect(b.other).toEqual(a.pos)
    }
  })

  it('y el signo opuesto, o la estela saldría girada en vez de desplazada', () => {
    const out = buffer()
    fillTrailVertices(oneParticle(3), out, 0)
    for (let s = 0; s < 3; s++) {
      expect(vertex(out, s * 2).side).toBe(1)
      expect(vertex(out, s * 2 + 1).side).toBe(-1)
    }
  })

  it('la cola se apaga hacia atrás, y sin escalones entre segmentos', () => {
    const out = buffer()
    fillTrailVertices(oneParticle(3), out, 0)
    const alphas = [0, 1, 2, 3, 4, 5].map((v) => vertex(out, v).alpha)
    // No es estrictamente decreciente y no debe serlo: el final de un segmento
    // y el principio del siguiente son el MISMO punto de la estela, así que
    // valen igual. Si no valieran igual, la estela tendría un escalón de
    // opacidad en cada apunte.
    for (let v = 1; v < alphas.length; v++) expect(alphas[v]).toBeLessThanOrEqual(alphas[v - 1])
    expect(alphas[1]).toBeCloseTo(alphas[2], 6)
    expect(alphas[3]).toBeCloseTo(alphas[4], 6)
    // Y de punta a punta sí cae: la cabeza es lo más opaco de la estela.
    expect(alphas[0]).toBeCloseTo(1, 6)
    expect(alphas[5]).toBeLessThan(alphas[0])
  })

  it('la velocidad va normalizada y se satura, no se sale de 1', () => {
    const p = oneParticle(1)
    p.speed[0] = STRONG_WIND_MS * 3
    const out = buffer()
    fillTrailVertices(p, out, 0)
    expect(vertex(out, 0).speed).toBe(1)
    expect(vertex(out, 0).station).toBeCloseTo(0.5, 6)
  })

  it('en el mapa plano la Z es cero, y en 3D sube con la cota y la exageración', () => {
    const flat = buffer()
    fillTrailVertices(oneParticle(1), flat, 0)
    expect(vertex(flat, 0).pos[2]).toBe(0)

    const solid = buffer()
    fillTrailVertices(oneParticle(1), solid, 1)
    const doubled = buffer()
    fillTrailVertices(oneParticle(1), doubled, 2)
    expect(vertex(solid, 0).pos[2]).toBeGreaterThan(0)
    expect(vertex(doubled, 0).pos[2]).toBeCloseTo(vertex(solid, 0).pos[2] * 2, 12)
  })

  it('el buffer declarado da para la estela más larga posible', () => {
    const p = new ParticleSystem(2)
    for (let i = 0; i < 2; i++) {
      p.tailFill[i] = TAIL_LENGTH
      p.speed[i] = 5
      for (let k = 0; k < TAIL_LENGTH; k++) {
        p.tailLon[i * TAIL_LENGTH + k] = -17.9 - k * 0.001
        p.tailLat[i * TAIL_LENGTH + k] = 28.7
      }
    }
    const out = new Float32Array(trailBufferSize(2))
    const vertices = fillTrailVertices(p, out, 0)
    expect(vertices).toBe(2 * TAIL_LENGTH * 2)
    expect(vertices * VERTEX_FLOATS).toBe(out.length)
  })

  it('mercator normalizado deja el meridiano cero en el medio y el ecuador también', () => {
    expect(mercatorX(0)).toBeCloseTo(0.5, 12)
    expect(mercatorY(0)).toBeCloseTo(0.5, 12)
    // La Palma queda en el cuadrante noroeste del mundo normalizado.
    expect(mercatorX(-17.9)).toBeLessThan(0.5)
    expect(mercatorY(28.7)).toBeLessThan(0.5)
  })
})
