/**
 * Isolíneas del DEM: de la malla de alturas a polilíneas simplificadas.
 *
 * Esto lo escribió `web-island.ts` para dibujar la portada, y sigue siendo lo
 * mismo que hace falta para dibujar el icono: la costa de La Palma sale de
 * marchar por la malla del modelo de elevación, no de una ilustración. Cuando
 * el segundo consumidor apareció, copiar 180 líneas de marching squares habría
 * sido dos sitios donde arreglar el mismo borde —justo lo que dice la cabecera
 * de `dem-node.ts` que ya pasó una vez con la lectura del DEM—.
 *
 * Aquí no hay ninguna decisión de dibujo: ni cotas, ni tolerancias, ni tamaños.
 * Eso lo pone quien llama, porque la portada y el icono no quieren lo mismo —la
 * portada quiere la Caldera legible a pantalla completa; el icono, una silueta
 * que sobreviva a 16 px—.
 */

export type Pt = [number, number]

export interface Grid {
  v: Float32Array
  w: number
  h: number
}

/** La malla de alturas mínima que necesita esto. Es la de `src/lib/dem.ts`. */
interface HeightField {
  heights: Float32Array
  width: number
  height: number
}

/** Promedia bloques de `step`×`step` del DEM. Suaviza el escalón del muestreo. */
export function coarsen(dem: HeightField, step: number): Grid {
  const w = Math.floor(dem.width / step)
  const h = Math.floor(dem.height / step)
  const v = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let j = 0; j < step; j++) {
        const row = (y * step + j) * dem.width + x * step
        for (let i = 0; i < step; i++) sum += dem.heights[row + i]
      }
      v[y * w + x] = sum / (step * step)
    }
  }
  return { v, w, h }
}

/**
 * Suavizado 3×3, aplicado sobre la malla ya reducida.
 *
 * Sin él marching squares saca la escalera del muestreo tal cual y las
 * isohipsas salen en zigzag de diente de sierra —se ve a simple vista en la
 * cara de barlovento, donde la pendiente es suave y el contorno serpentea entre
 * dos celdas—. Dos pasadas bastan; con cuatro la Caldera empieza a redondearse.
 *
 * El mar entra en la media como una cota más, y así debe ser: la isohipsa de la
 * costa ES la frontera entre tierra y agua, y suavizarla es justo lo que quita
 * el diente de sierra del litoral.
 */
export function smooth(g: Grid, passes: number): Grid {
  let cur = g
  for (let p = 0; p < passes; p++) {
    const v = new Float32Array(cur.v.length)
    for (let y = 0; y < cur.h; y++) {
      for (let x = 0; x < cur.w; x++) {
        let sum = 0
        let n = 0
        for (let j = -1; j <= 1; j++) {
          const yy = y + j
          if (yy < 0 || yy >= cur.h) continue
          for (let i = -1; i <= 1; i++) {
            const xx = x + i
            if (xx < 0 || xx >= cur.w) continue
            sum += cur.v[yy * cur.w + xx]
            n++
          }
        }
        v[y * cur.w + x] = sum / n
      }
    }
    cur = { v, w: cur.w, h: cur.h }
  }
  return cur
}

/**
 * Segmentos de la isolínea `level`, celda a celda.
 *
 * Se resuelve con el caso clásico de 16 configuraciones. Las dos ambiguas —la
 * silla de montar— se desempatan con la media de las cuatro esquinas, que es lo
 * que evita que dos barrancos contiguos se unan por un puente que no existe.
 */
export function isoSegments(g: Grid, level: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = []
  const at = (x: number, y: number) => g.v[y * g.w + x]

  /** Cruce por interpolación lineal entre dos esquinas vecinas. */
  const cross = (xa: number, ya: number, xb: number, yb: number): Pt => {
    const va = at(xa, ya)
    const vb = at(xb, yb)
    const t = Math.abs(vb - va) < 1e-9 ? 0.5 : (level - va) / (vb - va)
    return [xa + (xb - xa) * t, ya + (yb - ya) * t]
  }

  for (let y = 0; y < g.h - 1; y++) {
    for (let x = 0; x < g.w - 1; x++) {
      const tl = at(x, y)
      const tr = at(x + 1, y)
      const br = at(x + 1, y + 1)
      const bl = at(x, y + 1)

      let code = 0
      if (tl > level) code |= 8
      if (tr > level) code |= 4
      if (br > level) code |= 2
      if (bl > level) code |= 1
      if (code === 0 || code === 15) continue

      const top = () => cross(x, y, x + 1, y)
      const right = () => cross(x + 1, y, x + 1, y + 1)
      const bottom = () => cross(x, y + 1, x + 1, y + 1)
      const left = () => cross(x, y, x, y + 1)

      switch (code) {
        case 1: case 14: out.push([left(), bottom()]); break
        case 2: case 13: out.push([bottom(), right()]); break
        case 3: case 12: out.push([left(), right()]); break
        case 4: case 11: out.push([top(), right()]); break
        case 6: case 9: out.push([top(), bottom()]); break
        case 7: case 8: out.push([left(), top()]); break
        case 5: case 10: {
          // Silla: la media decide qué par de esquinas está conectado.
          const mid = (tl + tr + br + bl) / 4
          const joined = code === 5 ? mid > level : mid <= level
          if (joined) {
            out.push([left(), top()], [bottom(), right()])
          } else {
            out.push([left(), bottom()], [top(), right()])
          }
          break
        }
      }
    }
  }
  return out
}

/**
 * Los segmentos salen desordenados; esto los cose por extremos coincidentes.
 *
 * Se cose SIN mirar el sentido de cada segmento. El caso 1 y el caso 14 de
 * marching squares son el mismo corte con el interior al otro lado, y esta
 * implementación los emite con los extremos en el mismo orden: exigir que el
 * final de uno sea el principio del siguiente parte la costa de la isla en 332
 * trozos de seis puntos. Aceptando el enlace por cualquiera de los dos extremos
 * sale un solo anillo.
 */
export function stitch(segments: [Pt, Pt][]): Pt[][] {
  const key = (p: Pt) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`

  /** Índices de los segmentos que tocan cada punto. */
  const touching = new Map<string, number[]>()
  segments.forEach((s, i) => {
    for (const p of s) {
      const k = key(p)
      const list = touching.get(k)
      if (list) list.push(i)
      else touching.set(k, [i])
    }
  })

  const used = new Uint8Array(segments.length)
  const lines: Pt[][] = []

  /** Extremo del segmento `i` que no es `from`. */
  const other = (i: number, from: string): Pt =>
    key(segments[i][0]) === from ? segments[i][1] : segments[i][0]

  for (let seed = 0; seed < segments.length; seed++) {
    if (used[seed]) continue
    used[seed] = 1
    const line: Pt[] = [segments[seed][0], segments[seed][1]]

    // Hacia delante desde la cola, y luego hacia atrás desde la cabeza.
    for (const forward of [true, false]) {
      for (;;) {
        const tip = forward ? line[line.length - 1] : line[0]
        const k = key(tip)
        const next = touching.get(k)?.find((i) => !used[i])
        if (next === undefined) break
        used[next] = 1
        const p = other(next, k)
        if (forward) line.push(p)
        else line.unshift(p)
        if (key(p) === key(forward ? line[0] : line[line.length - 1])) break // anillo
      }
    }
    lines.push(line)
  }
  return lines
}

/** Douglas-Peucker iterativo: la recursión desborda con anillos de la costa. */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()!
    if (last - first < 2) continue
    const [ax, ay] = points[first]
    const [bx, by] = points[last]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)

    let worst = -1
    let worstAt = -1
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i]
      const d = len < 1e-9
        ? Math.hypot(px - ax, py - ay)
        : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > worst) {
        worst = d
        worstAt = i
      }
    }
    if (worst > tolerance) {
      keep[worstAt] = 1
      stack.push([first, worstAt], [worstAt, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}
