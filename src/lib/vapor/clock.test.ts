import { describe, expect, it } from 'vitest'
import {
  CYCLE_SECONDS,
  PARTICLE_SPEEDUP,
  SUN_SPEEDUP,
  canaryClockLabel,
  cycleProgress,
  startOfDayUtc,
  virtualTime,
} from './clock'

describe('el día en cuarenta segundos', () => {
  const day = startOfDayUtc(new Date('2026-08-13T17:42:00Z'))

  it('empieza en la medianoche de HOY, no de un día cualquiera', () => {
    expect(day.toISOString()).toBe('2026-08-13T00:00:00.000Z')
  })

  it('a mitad del ciclo va por el mediodía', () => {
    const mid = virtualTime(day, (CYCLE_SECONDS / 2) * 1000)
    expect(mid.toISOString()).toBe('2026-08-13T12:00:00.000Z')
  })

  it('da la vuelta sin cambiar de día', () => {
    const vuelta = virtualTime(day, (CYCLE_SECONDS + 1) * 1000)
    expect(vuelta.toISOString().slice(0, 10)).toBe('2026-08-13')
    expect(vuelta.getTime()).toBeLessThan(day.getTime() + 86_400_000)
  })

  it('la barra recorre de cero a uno y vuelve a empezar', () => {
    expect(cycleProgress(0)).toBe(0)
    expect(cycleProgress(CYCLE_SECONDS * 500)).toBeCloseTo(0.5, 5)
    expect(cycleProgress(CYCLE_SECONDS * 1000)).toBeCloseTo(0, 5)
  })

  /**
   * LO QUE SE ACELERA ES EL SOL, NO EL AIRE. Si las partículas corrieran al
   * ritmo del sol subirían kilómetros por fotograma y no se vería un ascenso,
   * se vería ruido. Esta prueba está para que nadie iguale los dos factores
   * pensando que es más coherente.
   */
  it('las partículas van muchísimo más despacio que el sol', () => {
    expect(SUN_SPEEDUP).toBe(2160)
    expect(PARTICLE_SPEEDUP).toBeLessThan(SUN_SPEEDUP / 100)
  })

  it('la hora se escribe en hora canaria, con su horario de verano', () => {
    // 13 ago: Canarias va en WEST, una hora por delante de UTC.
    expect(canaryClockLabel(new Date('2026-08-13T12:00:00Z'))).toBe('13:00')
    // 13 ene: en invierno coincide con UTC.
    expect(canaryClockLabel(new Date('2026-01-13T12:00:00Z'))).toBe('12:00')
  })
})
