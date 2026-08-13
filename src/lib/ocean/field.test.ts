/**
 * La interpolación del estado del mar.
 *
 * Lo que hay que comprobar no es que interpole —eso lo hace cualquier media
 * ponderada— sino que NO se cargue por el camino el abrigo de la isla, que es
 * lo único que este campo aporta sobre poner un solo número para todo el mar.
 */

import { describe, expect, it } from 'vitest'
import { ISLAND_BBOX, MAP_BBOX } from '../geo'
import { buildOceanField, localWindShare, seaStateAt, MAX_WIND_MS } from './field'
import type { MarineSample } from './marine'
import { buildWindField, toComponents, type WindSample } from '../wind/field'

/** Dos puntos reales del 13 ago 2026: el norte batido y el sotavento suroeste. */
const MARINE: MarineSample[] = [
  {
    lon: -17.875,
    lat: 28.95,
    swell: { heightM: 0.84, directionDeg: 4, periodS: 5.5 },
    windWave: { heightM: 0.96, directionDeg: 65, periodS: 3.9 },
    significantHeightM: 1.62,
    sstC: 23.9,
    seaLevelM: -0.55,
    currentSpeedMs: 0.14,
    currentTowardDeg: 270,
  },
  {
    lon: -18.1167,
    lat: 28.4379,
    swell: { heightM: 1.0, directionDeg: 69, periodS: 4.65 },
    windWave: { heightM: 0.02, directionDeg: 203, periodS: 1 },
    significantHeightM: 1.38,
    sstC: 24.8,
    seaLevelM: -0.53,
    currentSpeedMs: 0.33,
    currentTowardDeg: 117,
  },
]

const OFFSHORE: WindSample[] = MARINE.map((s) => ({
  lon: s.lon,
  lat: s.lat,
  ...toComponents(9, 45),
  source: 'model' as const,
}))

describe('interpolación del oleaje', () => {
  it('en cada punto de muestreo devuelve prácticamente su propio valor', () => {
    for (const s of MARINE) {
      const got = seaStateAt(MARINE, null, OFFSHORE, s.lon, s.lat)
      // No es exacto porque el suavizado deja que el vecino asome un poco; con
      // 63 km entre estos dos puntos, ese «poco» es menos de un 15 %.
      expect(Math.abs(got.swell.heightM - s.swell.heightM)).toBeLessThan(
        0.15 * Math.max(0.2, s.swell.heightM),
      )
    }
  })

  it('conserva el sotavento en vez de promediarlo con el barlovento', () => {
    const lee = seaStateAt(MARINE, null, OFFSHORE, -18.1167, 28.4379)
    const exposed = seaStateAt(MARINE, null, OFFSHORE, -17.875, 28.95)
    expect(lee.windSea.heightM).toBeLessThan(0.25)
    expect(exposed.windSea.heightM).toBeGreaterThan(0.7)
  })

  it('no anula la altura donde se cruzan dos mares opuestos', () => {
    // El mar de viento del norte va al suroeste y el del sotavento, al noreste:
    // justo opuestos. Promediando vectores de dirección POR altura, en el medio
    // saldría cero; y en el medio hay mar.
    const middle = seaStateAt(MARINE, null, OFFSHORE, -17.99, 28.69)
    expect(middle.windSea.heightM).toBeGreaterThan(0.1)
    expect(Math.hypot(middle.windSea.dirX, middle.windSea.dirY)).toBeCloseTo(1, 6)
  })

  it('el período interpolado se queda entre los dos de origen', () => {
    const middle = seaStateAt(MARINE, null, OFFSHORE, -17.99, 28.69)
    expect(middle.swell.periodS).toBeGreaterThan(4.65)
    expect(middle.swell.periodS).toBeLessThan(5.5)
  })
})

describe('el viento propio manda dentro del recuadro insular', () => {
  const stations: WindSample[] = [
    { lon: -17.76, lat: 28.68, ...toComponents(3, 45), source: 'cabildo' },
    { lon: -17.95, lat: 28.6, ...toComponents(2, 40), source: 'cabildo' },
  ]
  const field = buildWindField(
    [...stations, ...OFFSHORE],
    [ISLAND_BBOX.west, ISLAND_BBOX.south, ISLAND_BBOX.east, ISLAND_BBOX.north],
    32,
    32,
  )

  it('vale 1 en el centro y 0 fuera, sin escalón', () => {
    expect(localWindShare(-17.86, 28.66)).toBe(1)
    expect(localWindShare(-18.3, 28.66)).toBe(0)
    // Justo dentro del borde, a medio margen: entre 0 y 1, y sin saltos.
    const half = localWindShare(ISLAND_BBOX.west + 0.025, 28.66)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)
  })

  it('junto a una estación pesa la estación y no el modelo', () => {
    const near = seaStateAt(MARINE, field, OFFSHORE, -17.76, 28.68)
    const offshore = seaStateAt(MARINE, field, OFFSHORE, -18.3, 28.66)
    // Las estaciones marcan 3 y 2 m/s; el modelo, 9. Cerca de la costa este
    // tiene que salir claramente por debajo del mar abierto.
    expect(near.windSpeedMs).toBeLessThan(offshore.windSpeedMs)
    expect(offshore.windSpeedMs).toBeCloseTo(9, 0)
  })
})

describe('empaquetado en texturas', () => {
  const field = buildOceanField(MARINE, null, OFFSHORE, 16)

  it('devuelve las tres texturas con el tamaño pedido', () => {
    expect(field.size).toBe(16)
    for (const t of [field.swell, field.windSea, field.wind]) {
      expect(t).toHaveLength(16 * 16 * 4)
    }
  })

  it('cubre el recuadro entero del mapa', () => {
    expect(field.box.width).toBeGreaterThan(0)
    expect(field.box.height).toBeGreaterThan(0)
    const west = (MAP_BBOX.west + 180) / 360
    expect(field.box.x0).toBeCloseTo(west, 9)
  })

  it('el viento sale codificado alrededor del medio', () => {
    // 9 m/s del nordeste sobre un techo de 35: las dos componentes negativas y
    // no muy lejos del 128, que es el cero.
    const i = (8 * 16 + 8) * 4
    expect(field.wind[i]).toBeLessThan(128)
    expect(field.wind[i + 1]).toBeLessThan(128)
    expect(field.wind[i]).toBeGreaterThan(128 - (255 * 9) / MAX_WIND_MS)
  })

  it('la dirección del oleaje es un vector unitario en los dos canales', () => {
    const i = (8 * 16 + 8) * 4
    const x = (field.swell[i] / 255 - 0.5) * 2
    const y = (field.swell[i + 1] / 255 - 0.5) * 2
    expect(Math.hypot(x, y)).toBeCloseTo(1, 1)
  })
})
