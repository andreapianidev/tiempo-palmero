import { describe, expect, it } from 'vitest'
import {
  BREEZE_THRESHOLD_DEG,
  GROUND_LAG_HOURS,
  breathAt,
  solarElevation,
} from './breath'

/** El centro de la isla, que es donde se evalúa la respiración. */
const LON = -17.86
const LAT = 28.66

/**
 * La posición del sol se comprueba contra efemérides publicadas, no contra sí
 * misma. Los valores de referencia son del calculador solar de la NOAA para
 * Santa Cruz de La Palma; la tolerancia de 0,6° cubre la diferencia entre el
 * punto exacto que usa la NOAA y el centro de la isla que se usa aquí.
 */
describe('posición del sol', () => {
  it('a mediodía solar del solsticio de verano el sol está casi en la vertical', () => {
    // 21 jun 2026, 13:30 UTC ≈ mediodía solar en La Palma (lon −17,86°).
    const e = solarElevation(new Date('2026-06-21T13:30:00Z'), LON, LAT)
    expect(e).toBeGreaterThan(83)
    expect(e).toBeLessThan(85.5)
  })

  it('a mediodía solar del solsticio de invierno el sol se queda a media altura', () => {
    const e = solarElevation(new Date('2026-12-21T13:20:00Z'), LON, LAT)
    expect(e).toBeGreaterThan(36)
    expect(e).toBeLessThan(39)
  })

  it('de madrugada está por debajo del horizonte', () => {
    expect(solarElevation(new Date('2026-08-13T03:00:00Z'), LON, LAT)).toBeLessThan(-10)
  })

  it('en el equinoccio sale y se pone a doce horas de distancia', () => {
    const day = '2026-03-20'
    let sunrise = NaN
    let sunset = NaN
    let prev = solarElevation(new Date(`${day}T00:00:00Z`), LON, LAT)
    for (let m = 1; m <= 1440; m++) {
      const now = solarElevation(
        new Date(new Date(`${day}T00:00:00Z`).getTime() + m * 60_000),
        LON,
        LAT,
      )
      if (prev < 0 && now >= 0) sunrise = m
      if (prev >= 0 && now < 0) sunset = m
      prev = now
    }
    expect(sunset - sunrise).toBeGreaterThan(710) // 11 h 50
    expect(sunset - sunrise).toBeLessThan(730) // 12 h 10
  })
})

describe('la respiración de la isla', () => {
  it('a media tarde la isla inspira: el aire sube por las laderas', () => {
    const b = breathAt(new Date('2026-08-13T16:00:00Z'), LON, LAT)
    expect(b.phase).toBe('up')
    expect(b.flow).toBeGreaterThan(0.9)
  })

  it('de madrugada espira: el aire baja por los barrancos', () => {
    const b = breathAt(new Date('2026-08-13T04:00:00Z'), LON, LAT)
    expect(b.phase).toBe('down')
    expect(b.flow).toBeLessThan(-0.9)
  })

  /**
   * LA COMPROBACIÓN QUE DE VERDAD IMPORTA. El retraso del suelo no es un
   * adorno: es lo que hace que el mar de nubes trepe por la tarde y no a
   * mediodía. Si alguien lo pone a cero «porque parece más limpio», la isla
   * empieza a espirar en cuanto el sol baja, que es justo lo contrario de lo
   * que pasa.
   */
  it('sigue inspirando después de la puesta de sol, por el calor acumulado', () => {
    // 13 ago 2026: el sol se pone hacia las 20:50 UTC en La Palma.
    const puesta = breathAt(new Date('2026-08-13T20:50:00Z'), LON, LAT)
    expect(puesta.sunDeg).toBeLessThan(2)
    expect(puesta.phase).toBe('up')
    expect(GROUND_LAG_HOURS).toBeGreaterThan(0)
  })

  it('todavía espira un rato después de amanecer', () => {
    // Sale hacia las 07:20 UTC; a las 08:00 el suelo aún viene de la noche.
    const b = breathAt(new Date('2026-08-13T08:00:00Z'), LON, LAT)
    expect(b.sunDeg).toBeGreaterThan(0)
    expect(b.phase).toBe('down')
  })

  it('el ciclo se da la vuelta una vez para arriba y otra para abajo en un día', () => {
    const t0 = new Date('2026-08-13T00:00:00Z').getTime()
    let cambios = 0
    let prev = breathAt(new Date(t0), LON, LAT).phase
    for (let m = 10; m <= 1440; m += 10) {
      const now = breathAt(new Date(t0 + m * 60_000), LON, LAT).phase
      if (now !== prev) cambios++
      prev = now
    }
    expect(cambios).toBe(2)
  })

  it('el umbral está por encima del horizonte, no en él', () => {
    expect(BREEZE_THRESHOLD_DEG).toBeGreaterThan(0)
  })
})
