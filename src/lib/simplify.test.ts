import { describe, expect, it } from 'vitest'
import { roundPath, simplifyPath, type Point } from './simplify'

/** La tolerancia con la que se prepara el viario: 1e-5 grados ≈ 1,1 m. */
const TOL = 1e-5

/** Desvío máximo del trazado adelgazado respecto a TODOS los vértices originales. */
function maxDeviation(original: readonly Point[], simplified: readonly Point[]): number {
  let worst = 0
  for (const p of original) {
    let best = Infinity
    for (let i = 1; i < simplified.length; i++) {
      const a = simplified[i - 1]
      const b = simplified[i]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const t =
        dx === 0 && dy === 0
          ? 0
          : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)))
      best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
    }
    worst = Math.max(worst, best)
  }
  return worst
}

describe('adelgazado de un trazado', () => {
  it('una recta con vértices de sobra se queda en sus dos extremos', () => {
    const recta: Point[] = Array.from({ length: 50 }, (_, i) => [-17.9 + i * 1e-4, 28.7])
    expect(simplifyPath(recta, TOL)).toEqual([recta[0], recta[49]])
  })

  it('una curva de verdad NO se endereza', () => {
    // Zigzag de 5e-5 grados de amplitud: cinco veces la tolerancia, o sea 5,5 m
    // en el suelo. Es una curva que se ve, y tiene que sobrevivir entera.
    const curva: Point[] = Array.from({ length: 21 }, (_, i) => [
      -17.9 + i * 1e-4,
      28.7 + (i % 2 ? 5e-5 : 0),
    ])
    expect(simplifyPath(curva, TOL)).toHaveLength(curva.length)
  })

  it('un temblor por debajo de la tolerancia sí se plancha', () => {
    // Mismo zigzag, amplitud 2e-6 grados: 22 cm, una décima de píxel al zoom
    // máximo. Guardarlo es pagar bytes por algo que no se puede ver.
    const ruido: Point[] = Array.from({ length: 21 }, (_, i) => [
      -17.9 + i * 1e-4,
      28.7 + (i % 2 ? 2e-6 : 0),
    ])
    expect(simplifyPath(ruido, TOL)).toHaveLength(2)
  })

  it('una horquilla no se colapsa contra su propia cuerda', () => {
    // El caso que obliga a medir contra el SEGMENTO y no contra la recta: la
    // pista sube, gira 180° y vuelve casi por encima. Extremos casi juntos, así
    // que la «recta» que los une es un punto y todo el desvío se mediría contra
    // su prolongación. En las medianías de La Palma esto es media isla.
    const horquilla: Point[] = [
      [-17.9, 28.7],
      [-17.899, 28.7005],
      [-17.898, 28.701],
      [-17.8985, 28.7012],
      [-17.8995, 28.7008],
      [-17.90005, 28.70005],
    ]
    const out = simplifyPath(horquilla, TOL)
    expect(out.length).toBeGreaterThan(2)
    expect(maxDeviation(horquilla, out)).toBeLessThanOrEqual(TOL)
  })

  it('ningún vértice queda a más de la tolerancia del trazado que se guarda', () => {
    // Una espiral: curvatura que cambia de radio todo el rato, que es lo que
    // hace una carretera de montaña. La promesa del módulo es esta, y se
    // comprueba contra los 300 vértices originales, no contra una muestra.
    const espiral: Point[] = Array.from({ length: 300 }, (_, i) => {
      const a = i * 0.08
      const r = 1e-4 + i * 3e-6
      return [-17.9 + r * Math.cos(a), 28.7 + r * Math.sin(a)] as Point
    })
    const out = simplifyPath(espiral, TOL)
    expect(out.length).toBeLessThan(espiral.length)
    expect(maxDeviation(espiral, out)).toBeLessThanOrEqual(TOL)
  })

  it('un trazado de dos puntos y una tolerancia de cero se devuelven intactos', () => {
    const dos: Point[] = [
      [-17.9, 28.7],
      [-17.8, 28.6],
    ]
    expect(simplifyPath(dos, TOL)).toEqual(dos)
    expect(simplifyPath(dos, 0)).toEqual(dos)
  })

  it('no revienta la pila con un trazado enorme', () => {
    // 60.000 vértices en línea casi recta: la versión recursiva se quedaba sin
    // pila justo aquí, y en OSM hay trazados de miles de vértices.
    const largo: Point[] = Array.from({ length: 60000 }, (_, i) => [
      -17.9 + i * 1e-7,
      28.7 + (i % 2 ? 1e-9 : 0),
    ])
    expect(simplifyPath(largo, TOL)).toHaveLength(2)
  })
})

describe('redondeo de coordenadas', () => {
  it('deja cinco decimales y quita los vértices que se han vuelto iguales', () => {
    const p: Point[] = [
      [-17.900001, 28.700001],
      [-17.900002, 28.700002],
      [-17.9001, 28.7001],
    ]
    expect(roundPath(p, 5)).toEqual([
      [-17.9, 28.7],
      [-17.9001, 28.7001],
    ])
  })

  it('un trazado que el redondeo deja en un solo punto se queda en uno', () => {
    // Lo tira quien llama —una línea de un punto no es una línea—, pero esto no
    // inventa un segundo vértice para disimularlo.
    const p: Point[] = [
      [-17.9000001, 28.7000001],
      [-17.9000002, 28.7000002],
    ]
    expect(roundPath(p, 5)).toEqual([[-17.9, 28.7]])
  })
})
