/**
 * El sol, contra hechos astronómicos y no contra otra implementación.
 *
 * LA LUNA SE FUE A `moon.test.ts` con su efeméride. Las tres pruebas que estaban
 * aquí —mes sinódico, la llena enfrente del sol, la nueva sin luz— se fueron
 * enteras y sin tocar: comprueban lo mismo sobre el mismo `moonState`.
 *
 * No hay aquí ninguna tabla de orto y ocaso copiada de un servicio: lo que se
 * comprueba son cosas que tienen que salir por definición —la declinación en
 * los solsticios, la ecuación del tiempo en sus dos extremos, la duración del
 * día del solsticio en esta latitud—. Un test contra una tabla copiada solo
 * demuestra que se copió bien.
 */

import { describe, expect, it } from 'vitest'
import { dayFactor, dayLengthHours, solarGeometry, sunPosition } from './sun'

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

  it('el acimut crece a lo largo del día, sin saltos', () => {
    // La fórmula del acimut sale de un `acos`, que solo devuelve de 0 a 180, y
    // hay que reflejarlo después del mediodía. Sin ese reflejo el sol se pone
    // por donde ha salido, y eso NO da ningún error: sale un número plausible y
    // la isla se ilumina por la cara que no es.
    let previous = -1
    for (let m = 8 * 60; m <= 19 * 60; m += 10) {
      const { azimuthDeg } = sunPosition(utc('2026-06-21T00:00:00Z') + m * 60000, LON, LAT)
      expect(azimuthDeg).toBeGreaterThan(previous)
      previous = azimuthDeg
    }
  })

  it('no devuelve NaN en ningún instante del año', () => {
    // El `acos` del acimut recibe un cociente que el redondeo saca de [−1, 1].
    // Sin el recorte, un puñado de instantes al año darían NaN y la escena se
    // quedaría sin iluminar sin decir por qué.
    for (let d = 0; d < 365; d += 7) {
      for (let h = 0; h < 24; h += 3) {
        const p = sunPosition(Date.UTC(2026, 0, 1 + d, h), LON, LAT)
        expect(Number.isFinite(p.elevationDeg)).toBe(true)
        expect(Number.isFinite(p.azimuthDeg)).toBe(true)
      }
    }
  })

  it('la duración del día del solsticio encaja con la fórmula del ángulo horario', () => {
    // 2·acos(−tan 28,6835°·tan 23,44°)/15 = 13,83 h en junio y 10,17 h en
    // diciembre: tres horas y tres cuartos de diferencia entre el mar de agosto
    // y el de Navidad, que en esta latitud es toda la estacionalidad que hay.
    expect(dayLengthHours(utc('2026-06-21T12:00:00Z'), LAT)).toBeCloseTo(13.83, 1)
    expect(dayLengthHours(utc('2026-12-21T12:00:00Z'), LAT)).toBeCloseTo(10.17, 1)
  })
})

describe('cuánto es de día', () => {
  it('está al máximo con el sol alto y a cero de noche cerrada', () => {
    expect(dayFactor(45)).toBe(1)
    expect(dayFactor(-30)).toBe(0)
  })

  it('transiciona en el crepúsculo civil en vez de cortar en el horizonte', () => {
    // Las dos orillas: con el sol justo en el horizonte todavía hay bastante luz
    // —el cielo no se apaga a las 0,0° de elevación— y a −6° ya no queda.
    expect(dayFactor(0)).toBeGreaterThan(0.5)
    expect(dayFactor(0)).toBeLessThan(0.8)
    expect(dayFactor(-6)).toBe(0)
    expect(dayFactor(3)).toBe(1)
  })
})
