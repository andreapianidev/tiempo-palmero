/**
 * Lo que hay que impedir aquí es que un hueco del archivo se convierta en una
 * sequía. Es el fallo silencioso de este módulo: si un día sin dato cuenta como
 * un día sin lluvia, una celda que dejó de publicar sale en el mapa como la
 * zona más seca de la isla, y nadie lo nota porque el número tiene buena pinta.
 */

import { describe, expect, it } from 'vitest'
import { dryness, RAIN_DAY_MM, type RainDay } from './drought'

/** Serie de `n` días acabando en hoy, con la lluvia que diga `mm(i)`. */
function series(n: number, mm: (dayIndex: number) => number | null): RainDay[] {
  const out: RainDay[] = []
  for (let i = 0; i < n; i++) {
    const at = Date.UTC(2026, 7, 13) - (n - 1 - i) * 86_400_000
    out.push({ day: new Date(at).toISOString().slice(0, 10), mm: mm(i) })
  }
  return out
}

describe('días desde la última lluvia', () => {
  it('cuenta hacia atrás desde el final de la serie', () => {
    // Llovió hace exactamente 10 días y nada más.
    const s = series(120, (i) => (i === 109 ? 4 : 0))
    expect(dryness(s).daysSinceRain).toBe(10)
  })

  it('hoy con lluvia son cero días, no uno', () => {
    expect(dryness(series(30, (i) => (i === 29 ? 3 : 0))).daysSinceRain).toBe(0)
  })

  it('una llovizna por debajo del umbral no rompe la racha', () => {
    const s = series(120, (i) => (i === 100 ? RAIN_DAY_MM - 0.1 : i === 60 ? 8 : 0))
    expect(dryness(s).daysSinceRain).toBe(59)
  })

  it('si en toda la serie no llovió, no son «infinitos días»: es que no se sabe', () => {
    // Devolver la longitud de la ventana diría «llevamos 120 días secos» con la
    // misma cara tanto si llovió el día 121 como si no ha llovido en un año.
    expect(dryness(series(120, () => 0)).daysSinceRain).toBeNull()
  })
})

describe('los huecos del archivo', () => {
  it('la racha se cuenta en días de calendario, pero el hueco viaja al lado', () => {
    // Llovió hace 50 días y de los 50 hay 40 sin dato. La racha seca son 50
    // días —lo que seca el combustible es el tiempo, no las filas del
    // archivo—, pero de 40 de ellos no se sabe nada, y eso va pegado a la
    // cifra en vez de dejarla pasar por una racha comprobada.
    const s = series(120, (i) => {
      if (i >= 110) return 0
      if (i >= 70) return null
      if (i === 69) return 6
      return 0
    })
    const d = dryness(s)
    expect(d.daysSinceRain).toBe(50)
    expect(d.gapDays).toBe(40)
    expect(d.days).toBe(80)
  })

  it('sin huecos, el hueco es cero', () => {
    const d = dryness(series(120, (i) => (i === 109 ? 4 : 0)))
    expect(d.daysSinceRain).toBe(10)
    expect(d.gapDays).toBe(0)
  })

  it('los acumulados no suman ceros inventados', () => {
    const conHueco = dryness(series(120, (i) => (i >= 100 ? null : 1)))
    expect(conHueco.rain30).toBe(10) // solo los 10 días con dato de la ventana
    expect(conHueco.days).toBe(100)
  })
})

describe('acumulados', () => {
  it('30 y 90 días son ventanas que acaban hoy', () => {
    const d = dryness(series(120, () => 2))
    expect(d.rain30).toBeCloseTo(60, 6)
    expect(d.rain90).toBeCloseTo(180, 6)
  })

  it('lo anterior a la ventana no cuenta', () => {
    const d = dryness(series(120, (i) => (i < 30 ? 100 : 0)))
    expect(d.rain30).toBe(0)
    expect(d.rain90).toBe(0)
  })
})

describe('el umbral', () => {
  it('está en 1 mm, que es lo medido contra las seis celdas de la isla', () => {
    // La medición está en la cabecera del módulo: con 0,1 mm el sur de la isla
    // sale con los mismos 32 días secos que el centro cuando lleva 62, y con
    // 5 mm el noroeste pierde una lluvia real y salta de 15 a 33. Cambiar esta
    // constante sin repetir esa medición es elegir un umbral, no medirlo.
    expect(RAIN_DAY_MM).toBe(1)
  })
})

describe('una serie vacía', () => {
  it('no dice que lleve seco desde siempre', () => {
    const d = dryness([])
    expect(d.daysSinceRain).toBeNull()
    expect(d.days).toBe(0)
    expect(d.rain30).toBe(0)
  })
})
