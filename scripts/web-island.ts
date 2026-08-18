/**
 * Las curvas de nivel de La Palma que dibuja la portada, sacadas del DEM.
 *
 * La portada de `web/` no es una ilustración: la silueta y las isohipsas que se
 * dibujan solas al cargar salen del MISMO modelo de elevación con el que la
 * aplicación corrige la temperatura por altitud —`public/dem/`, teselas
 * terrarium de Mapzen a 33,54 m/píxel—. Si el DEM cambia, se vuelve a pasar
 * esto y la portada cambia con él.
 *
 *     npm run web:island
 *
 * Escribe el SVG entre los dos comentarios marcadores de `web/index.html`, así
 * que el fichero se puede regenerar tantas veces como haga falta sin tocar el
 * resto de la página a mano.
 *
 * Por qué va en línea y no como `<img src=...>`: la animación de trazado
 * necesita alcanzar cada `<path>` desde el CSS, y un SVG referenciado con `img`
 * es una caja negra para la hoja de estilos de fuera.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadDem, REPO_ROOT } from './dem-node.js'
import type { Dem } from '../src/lib/dem.js'

/**
 * Cotas que se dibujan: la costa, y de ahí para arriba cada 300 m.
 *
 * Hasta dónde llega no se escribe a mano, se pregunta al modelo. La cota máxima
 * del DEM son 2400 m —el Roque son 2426, y la diferencia es el muestreo a 33,5
 * m/píxel—, pero además esto contornea sobre la malla ya promediada y suavizada,
 * cuyo máximo baja a 2367 m: pedir la isohipsa de 2400 devolvía cero trazados.
 */
const CONTOUR_STEP_M = 300
const COAST_M = 1.5

/**
 * Cuántos píxeles del DEM entran en cada celda de la malla de contorneo.
 *
 * Medido sobre esta isla, con la tolerancia en 0,55: a 1 salen 4.405 puntos y
 * 51,0 kB de SVG; a 2, 2.195 y 25,8 kB; a 3, 1.370 y 16,4 kB; a 6, 620 y 7,8 kB
 * pero las isohipsas de 1.200 y 1.500 se funden en manchas y el interior de la
 * Caldera deja de leerse —el Barranco de las Angustias aún se distingue, pero
 * el circo ya no—. En 3, que son 100 m de paso, la Caldera se lee entera y el
 * SVG cabe dentro de la página sin cargar un fichero aparte.
 */
const STEP = 3

/**
 * Tolerancia del simplificado, en unidades de la malla ya reducida —es decir,
 * 0,55 son 55 m sobre el terreno.
 *
 * Medido con STEP en 3: sin simplificar son 10.230 puntos y 117,3 kB de SVG;
 * con 0,3 bajan a 2.038 y 24,0 kB; con 0,55, a 1.370 y 16,4 kB; con 1,0, a 946
 * y 11,5 kB; con 2,0, a 577 y 7,3 kB. El corte está en que el trazo deje de
 * parecer una curva: 0,55 quita el 87 % de los puntos y la costa se sigue
 * viendo curva a pantalla completa.
 */
const TOLERANCE = 0.55

/** Pasadas del suavizado 3×3 sobre la malla reducida. */
const SMOOTH_PASSES = 2

/** Polilíneas más cortas que esto son ruido de muestreo: fuera. */
const MIN_POINTS = 12

type Pt = [number, number]

/* ── malla reducida ─────────────────────────────────────────────────────── */

interface Grid {
  v: Float32Array
  w: number
  h: number
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
function smooth(g: Grid, passes: number): Grid {
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

/** Promedia bloques de STEP×STEP del DEM. Suaviza el escalón del muestreo. */
function coarsen(dem: Dem, step: number): Grid {
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

/* ── marching squares ───────────────────────────────────────────────────── */

/**
 * Segmentos de la isolínea `level`, celda a celda.
 *
 * Se resuelve con el caso clásico de 16 configuraciones. Las dos ambiguas —la
 * silla de montar— se desempatan con la media de las cuatro esquinas, que es lo
 * que evita que dos barrancos contiguos se unan por un puente que no existe.
 */
function isoSegments(g: Grid, level: number): [Pt, Pt][] {
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

/* ── de segmentos sueltos a polilíneas ──────────────────────────────────── */

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
function stitch(segments: [Pt, Pt][]): Pt[][] {
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

/* ── simplificado ───────────────────────────────────────────────────────── */

/** Douglas-Peucker iterativo: la recursión desborda con anillos de la costa. */
function simplify(points: Pt[], tolerance: number): Pt[] {
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

/* ── SVG ────────────────────────────────────────────────────────────────── */

interface Contour {
  level: number
  lines: Pt[][]
}

/** Recorta el lienzo a lo que ocupa la costa, con un margen de una celda. */
function islandBox(contours: Contour[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const line of contours[0].lines) {
    for (const [x, y] of line) {
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  return { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 }
}

function main(): void {
  const dem = loadDem()
  const grid = smooth(coarsen(dem, STEP), SMOOTH_PASSES)

  let peak = 0
  for (const h of grid.v) if (h > peak) peak = h

  const levels = [COAST_M]
  for (let m = CONTOUR_STEP_M; m < peak; m += CONTOUR_STEP_M) levels.push(m)

  const contours: Contour[] = levels.map((level) => {
    const raw = stitch(isoSegments(grid, level))
    const long = raw.filter((l) => l.length >= MIN_POINTS)
    const lines = long.map((l) => simplify(l, TOLERANCE)).filter((l) => l.length >= 4)
    if (process.env.ISLA_DEBUG) {
      const pts = (ls: Pt[][]) => ls.reduce((n, l) => n + l.length, 0)
      console.error(
        `  ${String(level).padStart(6)} m  crudo ${raw.length} líneas / ${pts(raw)} pts` +
          `  →  largas ${long.length} / ${pts(long)}  →  simple ${lines.length} / ${pts(lines)}`,
      )
    }
    return { level, lines }
  })

  const box = islandBox(contours)
  // El lienzo se lleva a 1000 de ancho: coordenadas con un decimal bastan y el
  // fichero se queda en la mitad que con la malla en crudo.
  const scale = 1000 / (box.x1 - box.x0)
  const height = Math.round((box.y1 - box.y0) * scale)

  const num = (n: number) => {
    const r = Math.round(n * 10) / 10
    return String(r === 0 ? 0 : r)
  }
  const toPath = (line: Pt[]) => {
    const closed =
      Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]) < 1e-6
    const pts = closed ? line.slice(0, -1) : line
    const d = pts
      .map(([x, y], i) => `${i ? 'L' : 'M'}${num((x - box.x0) * scale)} ${num((y - box.y0) * scale)}`)
      .join('')
    return d + (closed ? 'Z' : '')
  }

  const groups = contours
    .map(({ level, lines }) => {
      const paths = lines.map((l) => `<path d="${toPath(l)}" pathLength="1"/>`).join('')
      const label = level < 10 ? 'costa' : `${level} m`
      // Sin atributo `style`: la CSP del sitio no admite estilo en línea, así
      // que el índice de cota lo pone la hoja con `:nth-child`.
      return `<g class="iso" data-cota="${label}">${paths}</g>`
    })
    .join('\n')

  const total = contours.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.length, 0), 0)
  const svg =
    `<svg class="isla" viewBox="0 0 1000 ${height}" preserveAspectRatio="xMidYMid meet"\n` +
    `     fill="none" aria-hidden="true" focusable="false">\n${groups}\n</svg>`

  const htmlPath = join(REPO_ROOT, 'web/index.html')
  const html = readFileSync(htmlPath, 'utf8')
  const open = '<!--isla:inicio-->'
  const close = '<!--isla:fin-->'
  const a = html.indexOf(open)
  const b = html.indexOf(close)
  if (a < 0 || b < 0) {
    throw new Error(`Faltan los marcadores ${open} … ${close} en web/index.html`)
  }
  writeFileSync(
    htmlPath,
    html.slice(0, a + open.length) + '\n' + svg + '\n' + html.slice(b),
    'utf8',
  )

  const kb = (Buffer.byteLength(svg) / 1024).toFixed(1)
  console.log(
    `web/index.html ← ${contours.length} cotas hasta ${Math.round(peak)} m, ` +
      `${contours.reduce((n, c) => n + c.lines.length, 0)} trazados, ${total} puntos, ${kb} kB`,
  )
}

main()
