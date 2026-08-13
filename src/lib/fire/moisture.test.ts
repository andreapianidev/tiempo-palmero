/**
 * Lo que se fija aquí no es «el índice da tal número» sino que las dos
 * funciones se comporten como la física que dicen representar. Un error de
 * signo o un tramo mal empalmado en Simard no rompe nada visible: produce un
 * mapa con buena pinta que pinta de rojo la vertiente húmeda.
 *
 * Todas las cifras están calculadas con estas mismas fórmulas el 13 ago 2026 y
 * comprobadas contra el comportamiento conocido del combustible fino: a 25 °C,
 * 1,22 % de humedad con aire al 5 % y 25,70 % con aire saturado.
 */

import { describe, expect, it } from 'vitest'
import { equilibriumMoisture, fosbergIndex } from './moisture'

describe('humedad de equilibrio', () => {
  it('crece con la humedad del aire, sin un solo escalón hacia abajo', () => {
    // Simard son tres tramos distintos empalmados en el 10 % y el 50 %. Un
    // empalme mal hecho se ve exactamente aquí y en ningún otro sitio.
    let prev = -1
    for (let h = 0; h <= 100; h += 0.5) {
      const m = equilibriumMoisture(25, h)!
      expect(m).toBeGreaterThanOrEqual(prev)
      prev = m
    }
  })

  it('baja con la temperatura, que es lo que hace secarse a la hojarasca', () => {
    for (const h of [20, 50, 80]) {
      expect(equilibriumMoisture(30, h)!).toBeLessThan(equilibriumMoisture(10, h)!)
    }
  })

  it('el aire seco deja el combustible por debajo del 2 % y el saturado por encima del 25 %', () => {
    expect(equilibriumMoisture(25, 5)).toBeCloseTo(1.22, 2)
    expect(equilibriumMoisture(25, 100)).toBeCloseTo(25.7, 1)
  })

  it('manda la humedad relativa, no la temperatura', () => {
    // La diferencia entre la cumbre y la costa a igual humedad relativa es de
    // 0,37 puntos; la que va del 20 % al 40 % de humedad relativa, 3,2. Si
    // alguna vez esto se invierte, es que un coeficiente está mal transcrito.
    const porTemperatura = equilibriumMoisture(12, 30)! - equilibriumMoisture(26, 30)!
    const porHumedad = equilibriumMoisture(25, 40)! - equilibriumMoisture(25, 20)!
    expect(porTemperatura).toBeCloseTo(0.37, 2)
    expect(porHumedad).toBeCloseTo(3.2, 1)
    expect(porHumedad).toBeGreaterThan(porTemperatura * 5)
  })

  it('nunca sale negativa ni pasa del punto de saturación de la fibra', () => {
    for (const t of [-5, 0, 15, 30, 45]) {
      for (const h of [0, 1, 9.9, 10, 50, 50.1, 99, 100]) {
        const m = equilibriumMoisture(t, h)!
        expect(m).toBeGreaterThanOrEqual(0)
        expect(m).toBeLessThanOrEqual(35)
      }
    }
  })

  it('sin dato no hay humedad, y eso no es lo mismo que combustible seco', () => {
    expect(equilibriumMoisture(NaN, 40)).toBeNull()
    expect(equilibriumMoisture(20, NaN)).toBeNull()
  })
})

describe('índice de Fosberg', () => {
  it('el caso extremo del artículo vale 100', () => {
    // Combustible a cero con 30 mph (13,41 m/s) es de donde sale el 0,3002 de
    // la fórmula. Con humedad relativa 0 y 30 °C la humedad de equilibrio no
    // llega a ser exactamente cero, de ahí los 99,8 en vez de 100 clavados.
    expect(fosbergIndex(30, 0, 13.4112)!).toBeCloseTo(99.8, 1)
  })

  it('sube al bajar la humedad y al subir el viento', () => {
    const seco = fosbergIndex(25, 15, 4)!
    const humedo = fosbergIndex(25, 85, 4)!
    expect(seco).toBeGreaterThan(humedo * 3)

    let prev = -1
    for (let u = 0; u <= 25; u += 0.5) {
      const v = fosbergIndex(25, 30, u)!
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('sin viento el índice es pequeño aunque el combustible esté seco', () => {
    // 3,1 con aire al 5 % y calma. No es un fallo: Fosberg mide peligro
    // METEOROLÓGICO, y sin viento el fuego no corre. Que sea pequeño es
    // justamente lo que obliga a que el modelo no dependa solo de él.
    expect(fosbergIndex(30, 5, 0)!).toBeCloseTo(3.1, 1)
  })

  it('se queda dentro de 0 y 100', () => {
    for (const u of [0, 5, 20, 60]) {
      for (const h of [0, 30, 100]) {
        const v = fosbergIndex(25, h, u)!
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })

  it('sin viento medido no hay índice', () => {
    expect(fosbergIndex(25, 30, NaN)).toBeNull()
    expect(fosbergIndex(NaN, 30, 4)).toBeNull()
  })
})
