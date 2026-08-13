/**
 * Sol y luna, contra hechos astronómicos y no contra otra implementación.
 *
 * No hay aquí ninguna tabla de orto y ocaso copiada de un servicio: lo que se
 * comprueba son cosas que tienen que salir por definición —la declinación en
 * los solsticios, la ecuación del tiempo en sus dos extremos, la duración del
 * día del solsticio en esta latitud— y la coherencia interna de las dos
 * efemérides entre sí. Un test contra una tabla copiada solo demuestra que se
 * copió bien.
 */

import { describe, expect, it } from 'vitest'
import { dayLengthHours, moonState, solarGeometry, sunPosition } from './sun'

/** Santa Cruz de La Palma. */
const LON = -17.7642
const LAT = 28.6835

const utc = (iso: string) => Date.parse(iso)

describe('geometría solar', () => {
  it('da 23,44° de declinación en los solsticios', () => {
    expect(solarGeometry(utc('2026-06-21T12:00:00Z')).declinationDeg).toBeCloseTo(23.44, 1)
    expect(solarGeometry(utc('2026-12-21T12:00:00Z')).declinationDeg).toBeCloseTo(-23.44, 1)
  })

  it('cruza el cero en los equinoccios', () => {
    // El equinoccio de marzo de 2026 cae el día 20; a mediodía de ese día la
    // declinación tiene que estar a menos de un cuarto de grado del cero.
    expect(Math.abs(solarGeometry(utc('2026-03-20T12:00:00Z')).declinationDeg)).toBeLessThan(0.25)
    expect(Math.abs(solarGeometry(utc('2026-09-23T00:00:00Z')).declinationDeg)).toBeLessThan(0.25)
  })

  it('reproduce los dos extremos de la ecuación del tiempo', () => {
    // Los valores de manual: el sol va 16,4 minutos adelantado a principios de
    // noviembre y 14,2 minutos atrasado a mediados de febrero. Es la prueba de
    // que la serie está transcrita entera y no a medias.
    expect(solarGeometry(utc('2026-11-03T12:00:00Z')).equationOfTimeMin).toBeCloseTo(16.4, 0)
    expect(solarGeometry(utc('2026-02-11T12:00:00Z')).equationOfTimeMin).toBeCloseTo(-14.2, 0)
  })
})

describe('el sol sobre la isla', () => {
  it('al mediodía solar está al sur y a la altura que toca', () => {
    // En el solsticio de junio la declinación es 23,44° y la latitud 28,68°:
    // el sol culmina a 90 − (28,68 − 23,44) = 84,8°, alto pero nunca cenital,
    // porque La Palma está por encima del trópico de Cáncer.
    let best = { elevationDeg: -90, azimuthDeg: 0 }
    for (let m = 0; m < 1440; m++) {
      const p = sunPosition(utc('2026-06-21T00:00:00Z') + m * 60000, LON, LAT)
      if (p.elevationDeg > best.elevationDeg) best = p
    }
    expect(best.elevationDeg).toBeCloseTo(84.8, 0)
    expect(best.azimuthDeg).toBeCloseTo(180, 0)
  })

  it('sale por el este y se pone por el oeste', () => {
    const morning = sunPosition(utc('2026-08-13T09:00:00Z'), LON, LAT)
    const evening = sunPosition(utc('2026-08-13T19:00:00Z'), LON, LAT)
    expect(morning.azimuthDeg).toBeGreaterThan(45)
    expect(morning.azimuthDeg).toBeLessThan(135)
    expect(evening.azimuthDeg).toBeGreaterThan(225)
    expect(evening.azimuthDeg).toBeLessThan(315)
  })

  it('está bajo el horizonte de madrugada', () => {
    expect(sunPosition(utc('2026-08-13T03:00:00Z'), LON, LAT).elevationDeg).toBeLessThan(0)
  })

  it('la duración del día del solsticio encaja con la fórmula del ángulo horario', () => {
    // 2·acos(−tan 28,6835°·tan 23,44°)/15 = 13,83 h en junio y 10,17 h en
    // diciembre: tres horas y tres cuartos de diferencia entre el mar de agosto
    // y el de Navidad, que en esta latitud es toda la estacionalidad que hay.
    expect(dayLengthHours(utc('2026-06-21T12:00:00Z'), LAT)).toBeCloseTo(13.83, 1)
    expect(dayLengthHours(utc('2026-12-21T12:00:00Z'), LAT)).toBeCloseTo(10.17, 1)
  })
})

describe('la luna', () => {
  it('la fase va de cero a uno y vuelve, con el mes sinódico', () => {
    // Se buscan dos llenas seguidas recorriendo cuarenta días de hora en hora.
    // Entre una y otra tienen que pasar 29,5 días: el mes sinódico. Si la serie
    // de Meeus estuviera mal transcrita, este periodo no saldría.
    const start = utc('2026-01-01T00:00:00Z')
    const peaks: number[] = []
    let previous = 0
    let rising = true
    for (let h = 0; h < 24 * 70; h++) {
      const at = start + h * 3600000
      const f = moonState(at, LON, LAT).illumination
      if (rising && f < previous) {
        peaks.push(at)
        rising = false
      }
      if (!rising && f > previous) rising = true
      previous = f
    }
    expect(peaks.length).toBeGreaterThanOrEqual(2)
    const days = (peaks[1] - peaks[0]) / 86400000
    expect(days).toBeCloseTo(29.53, 0)
  })

  it('la luna llena sale cuando se pone el sol', () => {
    // No es folclore: si está llena, es que está enfrente del sol. Se busca la
    // llena más cercana y se comprueba que a medianoche solar está alta.
    const start = utc('2026-01-01T00:00:00Z')
    let full = start
    let best = 0
    for (let h = 0; h < 24 * 40; h++) {
      const at = start + h * 3600000
      const f = moonState(at, LON, LAT).illumination
      if (f > best) {
        best = f
        full = at
      }
    }
    expect(best).toBeGreaterThan(0.99)
    const sun = sunPosition(full, LON, LAT)
    const moon = moonState(full, LON, LAT)
    // La llena de este barrido cae el 1 de febrero de 2026 a las 20:00 UTC, con
    // el sol a −15,6° —recién puesto por el oeste— y la luna a +15,6° saliendo
    // por el este. Los dos acimutes tienen que estar a media vuelta.
    const separation = Math.abs(((moon.azimuthDeg - sun.azimuthDeg + 540) % 360) - 180)
    expect(separation).toBeGreaterThan(145)
    // Y uno arriba justo cuando el otro está abajo, que es la comprobación que
    // de verdad distingue una luna llena de una nueva.
    expect(Math.sign(moon.elevationDeg)).toBe(-Math.sign(sun.elevationDeg))
  })

  it('la nueva no ilumina nada', () => {
    const start = utc('2026-01-01T00:00:00Z')
    let worst = 1
    for (let h = 0; h < 24 * 40; h++) {
      worst = Math.min(worst, moonState(start + h * 3600000, LON, LAT).illumination)
    }
    expect(worst).toBeLessThan(0.01)
  })
})
