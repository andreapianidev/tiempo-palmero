/**
 * Adelgazamiento de un trazado (Douglas-Peucker) y redondeo de coordenadas.
 *
 * Lo usa la preparación del viario de OSM, que baja 19.770 trazados con 225.201
 * vértices. Sin adelgazar son 6,7 MB de GeoJSON; con la tolerancia de aquí,
 * 5,2 MB. El resto de capas no lo necesitan —61 tramos de carretera o 49
 * senderos no pesan— así que esto no se aplica en ningún otro sitio.
 *
 * La tolerancia se mide en GRADOS, no en metros, porque el algoritmo trabaja
 * sobre las coordenadas tal cual. A la latitud de La Palma (28,7°) un grado de
 * latitud son 111 km y uno de longitud 97,6 km, así que 1e-5 grados es como
 * mucho 1,11 m de desvío. El mapa llega hasta zoom 16, donde un píxel mide
 * 156543 · cos(28,7°) / 2^16 = 2,10 m: el error máximo es MEDIO PÍXEL en la
 * vista más cercana que la aplicación permite. Por eso 1e-5 y no más —a 5e-5
 * (5,5 m, 2,6 px) las curvas de las medianías empiezan a verse recortadas— ni
 * menos, porque por debajo se paga tamaño por un desvío que ya no se ve.
 */

export type Point = [number, number]

/** Distancia perpendicular de `p` al SEGMENTO `a`–`b` (no a la recta). */
function perpendicular(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  // Proyección acotada al segmento: sin el acotado, un trazado que vuelve sobre
  // sí mismo —una horquilla de una pista de medianías— mide su desvío contra la
  // prolongación de la recta y se colapsa a la cuerda.
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  )
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Douglas-Peucker iterativo. Iterativo y no recursivo a propósito: la pila de
 * Node se agota con trazados de miles de vértices, y en OSM los hay.
 */
export function simplifyPath(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3 || tolerance <= 0) return points.slice()

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    let index = -1
    let max = tolerance
    for (let i = first + 1; i < last; i++) {
      const d = perpendicular(points[i], points[first], points[last])
      if (d > max) {
        max = d
        index = i
      }
    }
    if (index === -1) continue
    keep[index] = 1
    stack.push([first, index], [index, last])
  }

  return points.filter((_, i) => keep[i] === 1)
}

/** Redondea a `decimals` y tira los vértices que el redondeo ha hecho iguales. */
export function roundPath(points: readonly Point[], decimals: number): Point[] {
  const f = 10 ** decimals
  const out: Point[] = []
  for (const [lon, lat] of points) {
    const p: Point = [Math.round(lon * f) / f, Math.round(lat * f) / f]
    const prev = out[out.length - 1]
    if (prev && prev[0] === p[0] && prev[1] === p[1]) continue
    out.push(p)
  }
  return out
}
