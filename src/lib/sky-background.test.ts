import { describe, expect, it } from 'vitest'
import { seaBackground } from './sky-dome'
import { COLORS } from './mapStyle'
import { oceanLight } from './ocean/light'

const LON = -17.86
const LAT = 28.66
const CLEAR = { pm10: null, solarWm2: null }

const at = (ms: number) => oceanLight(ms, LON, LAT, CLEAR)
const rgb = (hex: string) =>
  [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16))
const luma = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/** Mediodía y madrugada del 15 de agosto de 2026, hora de Canarias. */
const NOON = Date.UTC(2026, 7, 15, 13, 0)
const NIGHT = Date.UTC(2026, 7, 15, 2, 0)

describe('el fondo del mapa', () => {
  it('apagado es el de siempre, exactamente', () => {
    // Con el interruptor quitado no puede cambiar ni un nivel: es el fondo de
    // la aplicación, no un adorno de la función experimental.
    expect(seaBackground(null)).toBe(COLORS.sea)
  })

  it('de día es más claro que de noche', () => {
    // Es toda la corrección: la superficie más grande de la pantalla dejaba de
    // ser un color fijo. Medido sobre el propio modelo del agua.
    expect(luma(rgb(seaBackground(at(NOON))))).toBeGreaterThan(
      luma(rgb(seaBackground(at(NIGHT)))),
    )
  })

  it('sigue siendo mar, no cielo', () => {
    // La trampa de esto era pintar el fondo con el color del horizonte, que es
    // claro: la mitad de abajo de la pantalla se habría vuelto cielo. El agua
    // absorbe el rojo y devuelve muy poco, así que aun a mediodía es oscura.
    const day = at(NOON)
    expect(luma(rgb(seaBackground(day)))).toBeLessThan(luma(day.horizon.map((v) => v * 255)))
    // Y azul: más azul que rojo a cualquier hora.
    for (const light of [at(NOON), at(NIGHT)]) {
      const c = rgb(seaBackground(light))
      expect(c[2]).toBeGreaterThan(c[0])
    }
  })

  it('no se va a negro de noche', () => {
    // El agua tiene su propio suelo de luz —`LIT_FLOOR`— por la misma razón que
    // el horizonte: un rectángulo negro no se lee como mar.
    expect(luma(rgb(seaBackground(at(NIGHT))))).toBeGreaterThan(4)
  })
})
