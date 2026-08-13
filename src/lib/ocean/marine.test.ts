/**
 * Lectura del estado del mar.
 *
 * La respuesta de abajo no está inventada: es la que devolvió el servicio para
 * el anillo de ocho puntos el 13 de agosto de 2026 a las 17:00 UTC, recortada
 * a tres puntos —el norte expuesto, el suroeste abrigado y uno con huecos— que
 * son los tres casos que hay que leer bien.
 */

import { describe, expect, it } from 'vitest'
import { ISLAND_BBOX, MAP_BBOX } from '../geo'
import {
  MARINE_POINTS,
  marineUrl,
  meanSeaLevel,
  meanSst,
  parseMarineTime,
  readMarine,
  type MarinePoint,
} from './marine'

const POINTS: MarinePoint[] = [
  { lon: -17.875, lat: 28.95 },
  { lon: -18.1167, lat: 28.4379 },
  { lon: -17.5331, lat: 28.65 },
]

const RESPONSE = [
  {
    latitude: 28.958336,
    longitude: -17.874985,
    elevation: 0,
    current: {
      time: '2026-08-13T17:00',
      wave_height: 1.62,
      wave_direction: 33,
      wave_period: 5.1,
      wind_wave_height: 0.96,
      wind_wave_direction: 65,
      wind_wave_period: 3.9,
      swell_wave_height: 0.84,
      swell_wave_direction: 4,
      swell_wave_period: 5.5,
      sea_surface_temperature: 23.9,
      sea_level_height_msl: -0.55,
      ocean_current_velocity: 0.5,
      ocean_current_direction: 270,
    },
  },
  {
    latitude: 28.458336,
    longitude: -18.124985,
    elevation: 0,
    current: {
      time: '2026-08-13T17:00',
      wave_height: 1.38,
      wave_direction: 62,
      wave_period: 4.7,
      // El sotavento de la isla: el modelo dice que aquí no hay mar de viento,
      // y lo dice con dos centímetros y un período que no es un período.
      wind_wave_height: 0.02,
      wind_wave_direction: 203,
      wind_wave_period: 0,
      swell_wave_height: 1.0,
      swell_wave_direction: 69,
      swell_wave_period: 4.65,
      sea_surface_temperature: 24.8,
      sea_level_height_msl: -0.53,
      ocean_current_velocity: 1.2,
      ocean_current_direction: 117,
    },
  },
  {
    latitude: 28.625,
    longitude: -17.541656,
    elevation: 0,
    // Un punto que el modelo no resuelve: sin altura de ola no hay muestra.
    current: {
      time: '2026-08-13T17:00',
      wave_height: null,
      sea_surface_temperature: null,
      sea_level_height_msl: null,
    },
  },
]

describe('el anillo de muestreo', () => {
  it('cae entero en el mar y dentro de lo que el mapa deja mirar', () => {
    expect(MARINE_POINTS).toHaveLength(8)
    for (const p of MARINE_POINTS) {
      // Dentro del recuadro arrastrable: un punto fuera sería estado del mar
      // que nadie puede llegar a ver.
      expect(p.lon).toBeGreaterThan(MAP_BBOX.west)
      expect(p.lon).toBeLessThan(MAP_BBOX.east)
      expect(p.lat).toBeGreaterThan(MAP_BBOX.south)
      expect(p.lat).toBeLessThan(MAP_BBOX.north)
      // Y fuera del recuadro insular, que ya lleva unos 3 km de margen sobre la
      // costa: así ninguno cae en tierra. Comprobado además contra el propio
      // servicio, que devuelve `elevation: 0` en los ocho.
      const outside =
        p.lon < ISLAND_BBOX.west ||
        p.lon > ISLAND_BBOX.east ||
        p.lat < ISLAND_BBOX.south ||
        p.lat > ISLAND_BBOX.north
      expect(outside).toBe(true)
    }
  })

  it('pide los ocho puntos en una sola petición', () => {
    const url = marineUrl(MARINE_POINTS)
    expect(url.match(/latitude=([^&]*)/)![1].split(',')).toHaveLength(8)
    expect(url.match(/longitude=([^&]*)/)![1].split(',')).toHaveLength(8)
  })
})

describe('readMarine', () => {
  const state = readMarine(RESPONSE, POINTS)

  it('separa el mar de fondo del mar de viento', () => {
    const north = state.samples[0]
    expect(north.swell).toEqual({ heightM: 0.84, directionDeg: 4, periodS: 5.5 })
    expect(north.windWave).toEqual({ heightM: 0.96, directionDeg: 65, periodS: 3.9 })
    // La combinada la publica el modelo; aquí no se suma nada.
    expect(north.significantHeightM).toBe(1.62)
  })

  it('conserva el abrigo del sotavento en vez de suavizarlo', () => {
    const lee = state.samples[1]
    expect(lee.windWave.heightM).toBe(0.02)
    expect(lee.swell.heightM).toBe(1)
  })

  it('no deja períodos nulos, que dividirían por cero', () => {
    expect(state.samples[1].windWave.periodS).toBeGreaterThan(0)
  })

  it('descarta el punto sin altura de ola en vez de rellenarlo con calma', () => {
    expect(state.samples).toHaveLength(2)
    expect(state.samples.some((s) => s.lon === -17.5331)).toBe(false)
  })

  it('convierte la corriente a m/s', () => {
    expect(state.samples[0].currentSpeedMs).toBeCloseTo(0.5 / 3.6, 6)
    expect(state.samples[0].currentTowardDeg).toBe(270)
  })

  it('fecha la pasada en UTC aunque venga sin la Z', () => {
    expect(state.observedAt).toBe(Date.parse('2026-08-13T17:00:00Z'))
  })
})

describe('parseMarineTime', () => {
  it('lee la hora como UTC', () => {
    expect(parseMarineTime('2026-08-13T17:00')).toBe(Date.parse('2026-08-13T17:00:00Z'))
  })

  it('devuelve NaN sin hora', () => {
    expect(parseMarineTime(undefined)).toBeNaN()
    expect(parseMarineTime('ayer')).toBeNaN()
  })
})

describe('promedios de isla', () => {
  const { samples } = readMarine(RESPONSE, POINTS)

  it('la marea es una sola para toda la isla', () => {
    expect(meanSeaLevel(samples)).toBeCloseTo((-0.55 + -0.53) / 2, 6)
  })

  it('la temperatura del agua también', () => {
    expect(meanSst(samples)).toBeCloseTo((23.9 + 24.8) / 2, 6)
  })

  it('sin muestras no se inventa un cero', () => {
    expect(meanSeaLevel([])).toBeNull()
    expect(meanSst([])).toBeNull()
  })
})
