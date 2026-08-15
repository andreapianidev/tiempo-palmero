/**
 * Las horas de luz, escritas. Un día de 10,9947 h no son «10 h 60 min».
 *
 * Los tres casos de abajo no son inventados: son los días de 2026 en los que la
 * duración del día en La Palma cae a menos de medio minuto de la hora entera, y
 * los tres imprimían un minuto sesenta con la primera versión de esta función.
 */

import { describe, expect, it } from 'vitest'
import { horasYMinutos } from './Ephemeris'

describe('horasYMinutos', () => {
  it('escribe las horas y los minutos', () => {
    expect(horasYMinutos(13.1712)).toBe('13 h 10 min')
    expect(horasYMinutos(12)).toBe('12 h 0 min')
  })

  it('no escribe nunca sesenta minutos', () => {
    // 7 de febrero, 27 de septiembre y 3 de noviembre de 2026.
    expect(horasYMinutos(10.9947)).toBe('11 h 0 min')
    expect(horasYMinutos(11.995)).toBe('12 h 0 min')
    expect(horasYMinutos(10.9967)).toBe('11 h 0 min')
  })
})
