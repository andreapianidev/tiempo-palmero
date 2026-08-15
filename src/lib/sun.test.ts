import { describe, expect, it } from 'vitest'
import { dayFactor, solarPosition } from './sun'
import { solarElevation } from './vapor/breath'

/** El centro de La Palma, que es donde se ilumina la escena. */
const LON = -17.86
const LAT = 28.66

describe('posición solar', () => {
  /**
   * La prueba que de verdad importa para la escena: el sol tiene que salir por
   * el este y ponerse por el oeste. El azimut se calcula con un `acos`, que solo
   * devuelve de 0 a 180, y hay que reflejarlo por la tarde. Sin ese reflejo el
   * sol se pone por donde ha salido, las nubes se iluminan por la cara
   * equivocada toda la tarde, y nada de eso da error: sale un número plausible.
   */
  it('sale por el este y se pone por el oeste', () => {
    // 21 de junio de 2026. Salida y puesta aproximadas en La Palma, en UTC.
    const morning = solarPosition(new Date('2026-06-21T08:00:00Z'), LON, LAT)
    const evening = solarPosition(new Date('2026-06-21T19:00:00Z'), LON, LAT)

    expect(morning.elevation).toBeGreaterThan(0)
    expect(evening.elevation).toBeGreaterThan(0)
    // Por la mañana el sol está en la mitad este (0-180°).
    expect(morning.azimuth).toBeGreaterThan(45)
    expect(morning.azimuth).toBeLessThan(135)
    // Por la tarde, en la mitad oeste (180-360°).
    expect(evening.azimuth).toBeGreaterThan(250)
    expect(evening.azimuth).toBeLessThan(320)
  })

  it('al mediodía solar está al sur, que es donde culmina en esta latitud', () => {
    // Se comprueba en el solsticio de INVIERNO, y no en el de verano, por una
    // razón que costó un rato entender: en junio el sol culmina a 84,8° sobre
    // La Palma —a cinco grados de la vertical— y ahí el azimut está mal
    // condicionado, porque pasa de 149° a 246° en una sola hora. Un sol casi
    // cenital no está «al sur» de forma medible. En diciembre culmina a 38°,
    // que es donde la prueba dice algo.
    // 13:10 UTC, que es el mediodía solar de ese día en esta longitud —no las
    // 13:20 que usa `breath.test.ts`, donde el sol ya ha corrido tres grados—.
    // Para la elevación esos diez minutos dan igual (37,90 contra 37,84); para
    // el azimut son justo lo que se está midiendo.
    const noon = solarPosition(new Date('2026-12-21T13:10:00Z'), LON, LAT)
    expect(noon.elevation).toBeGreaterThan(36)
    expect(Math.abs(noon.azimuth - 180)).toBeLessThan(1)
  })

  it('en verano culmina casi en la vertical, y el azimut gira deprisa allí', () => {
    // El máximo anual: 90 − (28,66 − 23,44) = 84,8°.
    const noon = solarPosition(new Date('2026-06-21T13:11:00Z'), LON, LAT)
    expect(noon.elevation).toBeGreaterThan(84)
    expect(noon.elevation).toBeLessThan(85.5)
  })

  it('el azimut crece a lo largo del día, sin saltos', () => {
    // Recorre el día de sol y comprueba que el azimut es monótono creciente.
    // Un fallo en el reflejo de la tarde daría un salto brusco hacia atrás justo
    // al pasar el meridiano.
    let prev = -1
    for (let m = 8 * 60; m <= 19 * 60; m += 10) {
      const at = new Date(Date.UTC(2026, 5, 21, 0, m))
      const { azimuth } = solarPosition(at, LON, LAT)
      expect(azimuth).toBeGreaterThan(prev)
      prev = azimuth
    }
  })

  it('sigue dando la misma elevación que antes de mudarse de fichero', () => {
    // `breath.ts` reexporta esto. Si las dos dejaran de coincidir, el reloj de
    // la brisa y la luz de las nubes describirían dos soles distintos.
    for (const iso of [
      '2026-06-21T13:30:00Z',
      '2026-12-21T13:20:00Z',
      '2026-08-13T03:00:00Z',
    ]) {
      const at = new Date(iso)
      expect(solarElevation(at, LON, LAT)).toBe(solarPosition(at, LON, LAT).elevation)
    }
  })

  it('no devuelve NaN en ningún instante del año', () => {
    // El `acos` del azimut recibe un cociente que el redondeo saca de [-1, 1].
    // Sin el recorte, un puñado de instantes al año darían NaN y la escena se
    // quedaría sin iluminar sin decir por qué.
    for (let d = 0; d < 365; d += 7) {
      for (let h = 0; h < 24; h += 3) {
        const at = new Date(Date.UTC(2026, 0, 1 + d, h))
        const { elevation, azimuth } = solarPosition(at, LON, LAT)
        expect(Number.isFinite(elevation)).toBe(true)
        expect(Number.isFinite(azimuth)).toBe(true)
      }
    }
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
