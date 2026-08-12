/**
 * Las series históricas.
 *
 * Lo delicado aquí no es dibujar: es que cada número acabe en la columna que
 * le toca y que lo que no se midió no aparezca como si se hubiera medido. Una
 * serie desplazada una posición pintaría la humedad como si fuera temperatura,
 * y la gráfica saldría igual de suave y creíble.
 */

import { describe, it, expect } from 'vitest'
import {
  coverage,
  daysCovering,
  extremes,
  seriesFor,
  sliceWindow,
  utcDayKey,
  type DayPayload,
} from './history'

const COLUMNS = [
  'temperature',
  'relativehumidity',
  'dewpoint',
  'windspeed',
  'winddirection',
] as const

function day(dayKey: string, samples: (number | null)[][]): DayPayload {
  return {
    day: dayKey,
    step: 0,
    columns: [...COLUMNS],
    stations: [
      { entityId: 'EST-1', name: 'Prueba', lon: -17.9, lat: 28.65, samples },
      { entityId: 'OTRA', name: 'Otra', lon: -17.8, lat: 28.5, samples: [[0, 99, 99, 99, 99, 99]] },
    ],
  }
}

const ms = (dayKey: string, minutes: number) =>
  Date.parse(`${dayKey}T00:00:00Z`) + minutes * 60_000

describe('días que cubren una ventana', () => {
  it('una ventana dentro del mismo día es un solo día', () => {
    const from = Date.parse('2026-08-11T08:00:00Z')
    const to = Date.parse('2026-08-11T20:00:00Z')
    expect(daysCovering(from, to)).toEqual(['2026-08-11'])
  })

  it('una ventana que cruza medianoche son dos días', () => {
    const from = Date.parse('2026-08-11T20:00:00Z')
    const to = Date.parse('2026-08-12T09:00:00Z')
    expect(daysCovering(from, to)).toEqual(['2026-08-11', '2026-08-12'])
  })

  it('una semana son siete u ocho días, nunca menos', () => {
    const to = Date.parse('2026-08-12T14:00:00Z')
    const from = to - 7 * 86_400_000
    const days = daysCovering(from, to)
    expect(days.length).toBe(8)
    expect(days[0]).toBe('2026-08-05')
    expect(days[days.length - 1]).toBe('2026-08-12')
  })

  it('la clave del día es UTC, que es como está fechado el archivo', () => {
    // 00:30 en Canarias en verano es todavía el día anterior en UTC.
    expect(utcDayKey(Date.parse('2026-08-12T00:30:00+01:00'))).toBe('2026-08-11')
  })
})

describe('extracción de la serie de una estación', () => {
  it('cada columna acaba en su campo, sin desplazamientos', () => {
    const payload = day('2026-08-11', [[90, 21.4, 68, 15.2, 3.6, 310]])
    const [p] = seriesFor([payload], 'EST-1')
    expect(p.at).toBe(ms('2026-08-11', 90))
    expect(p.temperature).toBe(21.4)
    expect(p.relativehumidity).toBe(68)
    expect(p.dewpoint).toBe(15.2)
    expect(p.windspeed).toBe(3.6)
    expect(p.winddirection).toBe(310)
    expect(p.dewpointDerived).toBe(false)
  })

  it('no mezcla estaciones distintas', () => {
    const points = seriesFor([day('2026-08-11', [[0, 20, 60, 12, 2, 90]])], 'EST-1')
    expect(points).toHaveLength(1)
    expect(points[0].temperature).toBe(20)
  })

  it('ordena por instante aunque los días lleguen desordenados', () => {
    const a = day('2026-08-11', [[600, 20, 60, 12, 2, 90]])
    const b = day('2026-08-12', [[60, 22, 55, 12, 2, 90]])
    const points = seriesFor([b, a], 'EST-1')
    expect(points.map((p) => p.at)).toEqual([ms('2026-08-11', 600), ms('2026-08-12', 60)])
  })

  it('calcula el rocío que falta a partir de temperatura y humedad', () => {
    const payload = day('2026-08-11', [[0, 20, 60, null, 2, 90]])
    const [p] = seriesFor([payload], 'EST-1')
    expect(p.dewpointDerived).toBe(true)
    // 20 °C con 60 % dan unos 12 °C de punto de rocío.
    expect(p.dewpoint).toBeGreaterThan(11)
    expect(p.dewpoint).toBeLessThan(13)
  })

  it('un rocío derivado inverosímil se descarta en vez de dibujarse', () => {
    // 1 % de humedad a 20 °C es un sensor muerto, no un desierto: de ahí sale
    // un rocío de −38 °C, que la aplicación no puede pintar como si fuera una
    // medida. Es el mismo filtro que aplica el panel de la estación.
    const payload = day('2026-08-11', [[0, 20, 1, null, 2, 90]])
    const [p] = seriesFor([payload], 'EST-1')
    expect(p.dewpoint).toBeNull()
    expect(p.dewpointDerived).toBe(false)
  })

  it('un valor fuera de los límites físicos no llega a la gráfica', () => {
    const payload = day('2026-08-11', [[0, 800, 60, null, 2, 90]])
    const [p] = seriesFor([payload], 'EST-1')
    expect(p.temperature).toBeNull()
  })

  it('una estación que no está en ese día no rompe la serie', () => {
    const points = seriesFor([day('2026-08-11', [[0, 20, 60, 12, 2, 90]])], 'NO-EXISTE')
    expect(points).toEqual([])
  })
})

describe('máxima, mínima y cobertura', () => {
  const payload = day('2026-08-11', [
    [0, 18.2, 80, 14, 1, 0],
    [60, 24.6, 55, 15, 4, 90],
    [120, 21.0, 65, 14, 2, 45],
  ])
  const points = seriesFor([payload], 'EST-1')

  it('devuelve el extremo con la hora a la que ocurrió', () => {
    const e = extremes(points, 'temperature')
    expect(e).not.toBeNull()
    expect(e!.max.value).toBe(24.6)
    expect(e!.max.at).toBe(ms('2026-08-11', 60))
    expect(e!.min.value).toBe(18.2)
    expect(e!.min.at).toBe(ms('2026-08-11', 0))
  })

  it('sin ni un valor no hay extremos que inventar', () => {
    const vacio = seriesFor([day('2026-08-11', [[0, null, null, null, null, null]])], 'EST-1')
    expect(extremes(vacio, 'temperature')).toBeNull()
  })

  it('la cobertura delata a una estación que apenas transmitió', () => {
    const from = ms('2026-08-11', 0)
    const to = from + 24 * 3_600_000
    // Tres muestras donde cabrían 144: la curva se dibujaría igual de bonita.
    expect(coverage(points, 'temperature', from, to, 10)).toBeLessThan(0.05)
  })

  it('una serie completa da cobertura 1 y nunca más', () => {
    const from = ms('2026-08-11', 0)
    const to = from + 3_600_000
    const llena = seriesFor(
      [day('2026-08-11', Array.from({ length: 12 }, (_, i) => [i * 5, 20, 60, 12, 2, 90]))],
      'EST-1',
    )
    expect(coverage(llena, 'temperature', from, to, 5)).toBe(1)
  })
})

describe('recorte de la ventana', () => {
  it('deja fuera lo anterior y lo posterior', () => {
    const points = seriesFor(
      [
        day('2026-08-11', [
          [0, 20, 60, 12, 2, 90],
          [600, 21, 60, 12, 2, 90],
          [1200, 22, 60, 12, 2, 90],
        ]),
      ],
      'EST-1',
    )
    const recorte = sliceWindow(points, ms('2026-08-11', 300), ms('2026-08-11', 900))
    expect(recorte.map((p) => p.temperature)).toEqual([21])
  })
})
