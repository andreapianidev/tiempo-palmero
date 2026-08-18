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
import { coarsen, isoSegments, simplify, smooth, stitch, type Pt } from './contour.js'
import { loadDem, REPO_ROOT } from './dem-node.js'

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
