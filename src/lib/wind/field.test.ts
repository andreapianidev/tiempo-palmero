/**
 * El campo de viento, comprobado por sus garantías, no por su aspecto.
 *
 * Lo que hay que asegurar aquí es que la mezcla entre lo medido y lo modelado
 * hace lo que la interfaz promete: la estación manda donde mide, el modelo
 * contesta donde no hay nadie, y `station` dice la verdad sobre cuál de los dos
 * sostiene cada celda. Un fallo aquí no se ve en pantalla —las partículas se
 * moverían igual de bonito— pero convertiría el mapa en una estimación
 * disfrazada de medida.
 */

import { describe, it, expect } from 'vitest'
import {
  buildWindField,
  sampleField,
  speedOf,
  toComponents,
  toDirection,
  type WindSample,
} from './field'

const BOUNDS: [number, number, number, number] = [-18.05, 28.4, -17.7, 28.9]

function field(samples: WindSample[]) {
  return buildWindField(samples, BOUNDS, 48, 64)
}

const station = (lon: number, lat: number, speed: number, dir: number): WindSample => ({
  lon,
  lat,
  ...toComponents(speed, dir),
  source: 'cabildo',
})

const model = (lon: number, lat: number, speed: number, dir: number): WindSample => ({
  lon,
  lat,
  ...toComponents(speed, dir),
  source: 'model',
})

describe('componentes del viento', () => {
  it('la dirección meteorológica dice DE DÓNDE viene, no hacia dónde va', () => {
    // Viento del norte (0°): sopla hacia el sur, así que la componente norte
    // es negativa. Confundir el signo aquí invierte el mapa entero.
    const north = toComponents(10, 0)
    expect(north.v).toBeCloseTo(-10, 6)
    expect(north.u).toBeCloseTo(0, 6)

    // Viento del este (90°): sopla hacia el oeste.
    const east = toComponents(10, 90)
    expect(east.u).toBeCloseTo(-10, 6)
    expect(east.v).toBeCloseTo(0, 6)
  })

  it('ida y vuelta entre grados y componentes', () => {
    for (const dir of [0, 45, 90, 170, 235, 359]) {
      const { u, v } = toComponents(7.5, dir)
      expect(toDirection(u, v)).toBeCloseTo(dir, 4)
      expect(speedOf(u, v)).toBeCloseTo(7.5, 6)
    }
  })

  it('dos vientos opuestos se cancelan en vez de promediar a un tercero', () => {
    // Es el motivo de trabajar en u/v: la media aritmética de 350° y 10° da
    // 180°, que es justo el viento contrario al real.
    const a = toComponents(10, 350)
    const b = toComponents(10, 10)
    const dir = toDirection((a.u + b.u) / 2, (a.v + b.v) / 2)
    expect(Math.min(dir, 360 - dir)).toBeLessThan(1)
  })
})

describe('mezcla de estaciones y modelo', () => {
  it('en la propia estación mandan sus componentes, no el modelo', () => {
    const f = field([
      station(-17.9, 28.65, 12, 45),
      model(-17.9, 28.65, 3, 225), // el modelo dice justo lo contrario
      model(-17.8, 28.5, 3, 225),
    ])
    const at = sampleField(f, -17.9, 28.65)
    expect(at).not.toBeNull()
    // La estación pesa la mitad frente al modelo (peso 1 contra 1) y aún así
    // domina el sentido: la dirección tiene que parecerse a la medida.
    expect(at!.station).toBeGreaterThan(0.45)
    const dir = toDirection(at!.u, at!.v)
    expect(Math.abs(dir - 45)).toBeLessThan(20)
  })

  it('lejos de toda estación el valor lo pone el modelo y se declara', () => {
    const f = field([
      station(-18.0, 28.45, 12, 45),
      model(-17.75, 28.85, 6, 180),
      model(-17.8, 28.8, 6, 180),
    ])
    const far = sampleField(f, -17.75, 28.85)
    expect(far).not.toBeNull()
    // Casi 45 km de la única estación: no puede quedar nada de ella.
    expect(far!.station).toBeLessThan(0.02)
    expect(Math.abs(toDirection(far!.u, far!.v) - 180)).toBeLessThan(15)
  })

  it('la influencia de una estación cae rápido con la distancia', () => {
    const f = field([station(-17.9, 28.65, 10, 90), model(-17.9, 28.65, 10, 90)])
    const here = sampleField(f, -17.9, 28.65)!
    // ~10 km al oeste: fuera del radio de influencia por completo.
    const away = sampleField(f, -18.0, 28.65)!
    expect(here.station).toBeGreaterThan(away.station * 20)
  })

  it('modelShare cuenta las celdas que sostiene mayoritariamente el modelo', () => {
    const soloModelo = field([model(-17.9, 28.65, 5, 90), model(-17.8, 28.5, 5, 90)])
    expect(soloModelo.modelShare).toBe(1)

    // Una isla cubierta de estaciones cada pocos km deja poco al modelo.
    const densas: WindSample[] = []
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 10; j++) {
        densas.push(station(-18.03 + i * 0.045, 28.43 + j * 0.05, 8, 45))
      }
    }
    densas.push(model(-17.9, 28.65, 8, 45))
    expect(field(densas).modelShare).toBeLessThan(0.25)
  })

  it('sin modelo el campo se construye igual, solo con estaciones', () => {
    const f = field([station(-17.9, 28.65, 9, 270)])
    expect(f.counts.model).toBe(0)
    const at = sampleField(f, -17.9, 28.65)!
    expect(at.station).toBe(1)
    expect(Math.abs(toDirection(at.u, at.v) - 270)).toBeLessThan(1)
  })
})

describe('lectura del campo', () => {
  it('fuera de los límites devuelve null en vez de repetir el borde', () => {
    const f = field([model(-17.9, 28.65, 5, 90)])
    expect(sampleField(f, -17.9, 28.65)).not.toBeNull()
    expect(sampleField(f, -19, 28.65)).toBeNull()
    expect(sampleField(f, -17.9, 29.5)).toBeNull()
    expect(sampleField(f, -17.5, 28.65)).toBeNull()
  })

  it('interpola sin salirse del rango de las celdas vecinas', () => {
    const f = field([
      model(-18.0, 28.5, 4, 90),
      model(-17.75, 28.85, 12, 90),
      station(-17.9, 28.65, 8, 90),
    ])
    for (let i = 0; i <= 20; i++) {
      const lon = -18.04 + (i / 20) * 0.33
      const at = sampleField(f, lon, 28.65)
      expect(at).not.toBeNull()
      expect(speedOf(at!.u, at!.v)).toBeLessThanOrEqual(f.maxSpeed + 1e-6)
      expect(at!.station).toBeGreaterThanOrEqual(0)
      expect(at!.station).toBeLessThanOrEqual(1)
    }
  })
})
