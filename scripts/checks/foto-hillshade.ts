/**
 * Cuánta luz aguanta la ortofoto encima.
 *
 * De aquí sale el número de `lib/terrain-light-photo.ts`: la opacidad con la
 * que el sombreado del relieve se dibuja SOBRE los fondos fotográficos, donde
 * la foto ya trae su propia luz —la del vuelo— y no se puede tapar.
 *
 * NO ES UNA APROXIMACIÓN DEL SOMBREADO: es el shader de MapLibre reescrito
 * línea a línea desde `node_modules/maplibre-gl/src/shaders/hillshade*.glsl`
 * (v4.7), incluida la cuantización a 8 bits de la textura intermedia y la
 * mezcla premultiplicada con la que la capa se compone. Lo que mide este script
 * es lo que se va a ver.
 *
 *   npx tsx scripts/checks/foto-hillshade.ts
 *
 * Pide teselas a GRAFCAN en vivo: tres recuadros, uno por petición.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { loadDem } from '../dem-node.js'
import { SEA_LEVEL_M } from '../../src/lib/dem.js'
import { pixelXToLon, pixelYToLat } from '../../src/lib/geo.js'
import { sunPosition } from '../../src/lib/sun.js'
import { terrainLight } from '../../src/lib/terrain-light.js'

const dem = loadDem()
const { zoom, metersPerPixel } = dem.manifest

// --- los recuadros -----------------------------------------------------------
//
// Tres sitios, y cada uno contesta una cosa distinta. Van en píxeles del DEM
// para que el recuadro caiga clavado en la malla del modelo y no haya que
// remuestrear las alturas.
const WIN = 192 // píxeles del DEM ≈ 6,4 km de lado
const PHOTO_SCALE = 4 // la foto, a 4 × la malla ≈ 8,4 m por píxel

interface Area {
  name: string
  /** Centro, en grados. */
  lon: number
  lat: number
}

const AREAS: Area[] = [
  // Pared de la Caldera y Roque de los Muchachos: la pendiente más fuerte de
  // la isla, donde el sombreado pega más duro.
  { name: 'Caldera', lon: -17.87, lat: 28.75 },
  // La colada de Tajogaite: negra, con textura propia y con detalle que la
  // aplicación enseña a propósito. Es el sitio donde tapar la foto se nota.
  { name: 'Tajogaite', lon: -17.88, lat: 28.61 },
  // Aridane: llano cultivado, poca pendiente. Aquí el sombreado casi no debería
  // hacer nada, y sirve de control.
  { name: 'Aridane', lon: -17.9, lat: 28.62 },
]

// --- el sol ------------------------------------------------------------------
//
// Tres alturas: rasante, media y alta. La exageración del sombreado sale de la
// altura solar (ver `terrain-light.ts`), así que el caso duro es el sol bajo.
const DAY = Date.UTC(2026, 7, 15)
const CENTER = { lon: -17.87, lat: 28.68 }

function sunAt(targetElevation: number) {
  let best = null as null | { at: number; elev: number }
  for (let m = 0; m < 24 * 60; m += 2) {
    const at = DAY + m * 60_000
    const s = sunPosition(at, CENTER.lon, CENTER.lat)
    // Solo la mañana: da igual cuál de las dos ramas del día se coja, pero
    // mezclarlas devolvería el mismo sol dos veces.
    if (m > 13 * 60) break
    const d = Math.abs(s.elevationDeg - targetElevation)
    if (!best || d < Math.abs(best.elev - targetElevation)) best = { at, elev: s.elevationDeg }
  }
  return sunPosition(best!.at, CENTER.lon, CENTER.lat)
}

const SUNS = [10, 40, 69].map((e) => ({ target: e, sun: sunAt(e) }))

// --- la ortofoto -------------------------------------------------------------

const MERC = 20037508.342789244

const mercX = (lon: number) => (lon * MERC) / 180
const mercY = (lat: number) =>
  (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (MERC / 180)

const TMP = mkdtempSync(join(tmpdir(), 'foto-hillshade-'))

/** Una petición por recuadro y no una por recuadro y sol. */
const CACHE = new Map<string, { rgb: Float32Array; size: number }>()

/** La ortofoto de GRAFCAN sobre un recuadro, en RGB de 0 a 1. */
async function ortofoto(
  bbox: [number, number, number, number],
  size: number,
  name: string,
): Promise<{ rgb: Float32Array; size: number }> {
  const hit = CACHE.get(name)
  if (hit) return hit
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: 'ortofoto',
    styles: '',
    srs: 'EPSG:3857',
    format: 'image/jpeg',
    width: String(size),
    height: String(size),
    bbox: bbox.join(','),
  })
  const url = `https://idecan1.grafcan.es/ServicioWMS/Ortofoto?${q}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GRAFCAN ${res.status} en ${name}`)
  const jpg = join(TMP, `${name}.jpg`)
  const png = join(TMP, `${name}.png`)
  writeFileSync(jpg, Buffer.from(await res.arrayBuffer()))
  // Node no decodifica JPEG y el servicio solo sirve JPEG. `sips` es de macOS y
  // viene con el sistema; este script es de mesa de trabajo, no de CI.
  execFileSync('sips', ['-s', 'format', 'png', jpg, '--out', png], { stdio: 'ignore' })
  const image = PNG.sync.read(readFileSync(png))
  const rgb = new Float32Array(size * size * 3)
  for (let i = 0; i < size * size; i++) {
    rgb[i * 3] = image.data[i * 4] / 255
    rgb[i * 3 + 1] = image.data[i * 4 + 1] / 255
    rgb[i * 3 + 2] = image.data[i * 4 + 2] / 255
  }
  const out = { rgb, size }
  CACHE.set(name, out)
  return out
}

// --- el shader ---------------------------------------------------------------

/** `hillshade_prepare.fragment.glsl`, con su cuantización a 8 bits. */
function prepare(x0: number, y0: number, w: number, h: number): Float32Array {
  const exaggerationFactor = zoom < 2 ? 0.4 : zoom < 4.5 ? 0.35 : 0.3
  const exaggeration = zoom < 15 ? (zoom - 15) * exaggerationFactor : 0
  const div = Math.pow(2, exaggeration + (19.2562 - zoom))
  const out = new Float32Array(w * h * 2)
  // El shader lee la altura ya dividida entre cuatro (`getElevation`), y ese
  // cuarto sobrevive hasta la derivada: si se quita, el sombreado sale cuatro
  // veces más fuerte.
  const E = (px: number, py: number) => {
    const cx = Math.min(dem.width - 1, Math.max(0, px))
    const cy = Math.min(dem.height - 1, Math.max(0, py))
    return dem.heights[cy * dem.width + cx] / 4
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x0 + x
      const py = y0 + y
      const a = E(px - 1, py - 1), b = E(px, py - 1), c = E(px + 1, py - 1)
      const d = E(px - 1, py), f = E(px + 1, py)
      const g = E(px - 1, py + 1), hh = E(px, py + 1), i = E(px + 1, py + 1)
      const dx = (c + f + f + i - (a + d + d + g)) / div
      const dy = (g + hh + hh + i - (a + b + b + c)) / div
      // La textura intermedia es RGBA8: lo que llega al segundo shader está
      // recortado a [0,1] y redondeado a 1/255.
      const q = (v: number) => Math.round(Math.min(1, Math.max(0, v / 2 + 0.5)) * 255) / 255
      out[(y * w + x) * 2] = q(dx) * 2 - 1
      out[(y * w + x) * 2 + 1] = q(dy) * 2 - 1
    }
  }
  return out
}

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Un color de estilo, premultiplicado, que es como llega al shader. */
function color(hex: string, alpha: number): Rgba {
  const ch = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return { r: ch(0) * alpha, g: ch(1) * alpha, b: ch(2) * alpha, a: alpha }
}

/** `hillshade.fragment.glsl`. Devuelve RGBA premultiplicado. */
function shade(
  deriv: Float32Array,
  w: number,
  h: number,
  lat: number,
  light: { direction: number; exaggeration: number; highlight: string; shadow: string; accent: string },
  alpha: number,
): Float32Array {
  const shadow = color(light.shadow, alpha)
  const highlight = color(light.highlight, alpha)
  const accentC = color(light.accent, alpha)
  const intensity = light.exaggeration
  const azimuth = (light.direction * Math.PI) / 180 + Math.PI
  const base = 1.875 - intensity * 1.75
  const maxValue = 0.5 * Math.PI
  const clampI = Math.min(1, Math.max(0, intensity * 2))
  const scaleFactor = Math.cos((lat * Math.PI) / 180)
  const out = new Float32Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const dx = deriv[i * 2]
    const dy = deriv[i * 2 + 1]
    const slope = Math.atan((1.25 * Math.hypot(dx, dy)) / scaleFactor)
    const aspect = dx !== 0 ? Math.atan2(dy, -dx) : (Math.PI / 2) * (dy > 0 ? 1 : -1)
    const scaledSlope =
      intensity !== 0.5
        ? ((Math.pow(base, slope) - 1) / (Math.pow(base, maxValue) - 1)) * maxValue
        : slope
    const accent = Math.cos(scaledSlope)
    const k = (1 - accent) * clampI
    const sin = Math.sin(scaledSlope) * clampI
    let sh = (((aspect + azimuth) / Math.PI + 0.5) % 2 + 2) % 2
    sh = Math.abs(sh - 1)
    const mix = (a: number, b: number) => a + (b - a) * sh
    const sr = mix(shadow.r, highlight.r) * sin
    const sg = mix(shadow.g, highlight.g) * sin
    const sb = mix(shadow.b, highlight.b) * sin
    const sa = mix(shadow.a, highlight.a) * sin
    out[i * 4] = accentC.r * k * (1 - sa) + sr
    out[i * 4 + 1] = accentC.g * k * (1 - sa) + sg
    out[i * 4 + 2] = accentC.b * k * (1 - sa) + sb
    out[i * 4 + 3] = accentC.a * k * (1 - sa) + sa
  }
  return out
}

// --- medidas -----------------------------------------------------------------

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

function median(v: number[]): number {
  if (!v.length) return NaN
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Desviación típica local en ventana de 5 × 5, la misma que usa `realce`. */
function localSigma(lum: Float32Array, size: number, mask: Uint8Array): number[] {
  const out: number[] = []
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      if (!mask[y * size + x]) continue
      let s = 0
      let s2 = 0
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const v = lum[(y + j) * size + x + i]
          s += v
          s2 += v * v
        }
      }
      out.push(Math.sqrt(Math.max(0, s2 / 25 - (s / 25) ** 2)))
    }
  }
  return out
}

async function main() {
  const alphas = [0.2, 0.3, 0.35, 0.4, 0.5, 0.65, 0.8, 1]

  for (const { target, sun } of SUNS) {
    const light = terrainLight(sun, null, 0)
    console.log(
      `\n=== sol a ${sun.elevationDeg.toFixed(1)}° (objetivo ${target}°), acimut ` +
        `${sun.azimuthDeg.toFixed(0)}° · exageración ${light.exaggeration.toFixed(2)} ===`,
    )
    for (const area of AREAS) {
      const cx = Math.round(
        (area.lon - pixelXToLon(dem.originX, zoom)) /
          (pixelXToLon(dem.originX + 1, zoom) - pixelXToLon(dem.originX, zoom)),
      )
      const cyLat = (py: number) => pixelYToLat(dem.originY + py, zoom)
      let cy = 0
      for (let py = 0; py < dem.height; py++) {
        if (cyLat(py) <= area.lat) {
          cy = py
          break
        }
      }
      const x0 = cx - WIN / 2
      const y0 = cy - WIN / 2
      const west = pixelXToLon(dem.originX + x0, zoom)
      const east = pixelXToLon(dem.originX + x0 + WIN, zoom)
      const north = pixelYToLat(dem.originY + y0, zoom)
      const south = pixelYToLat(dem.originY + y0 + WIN, zoom)
      const size = WIN * PHOTO_SCALE
      const photo = await ortofoto(
        [mercX(west), mercY(south), mercX(east), mercY(north)],
        size,
        `${area.name}`,
      )

      const deriv = prepare(x0, y0, WIN, WIN)
      const midLat = (north + south) / 2

      // Máscaras, a resolución de foto: tierra, y las dos laderas —la que mira
      // al sol y la que le da la espalda—, según el DEM.
      const land = new Uint8Array(size * size)
      const facing = new Int8Array(size * size)
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const px = x0 + Math.floor(x / PHOTO_SCALE)
          const py = y0 + Math.floor(y / PHOTO_SCALE)
          const hgt = dem.heights[py * dem.width + px]
          if (hgt <= SEA_LEVEL_M) continue
          land[y * size + x] = 1
          // Pendiente y orientación reales, en grados, no las del shader.
          const e = (ix: number, iy: number) =>
            dem.heights[
              Math.min(dem.height - 1, Math.max(0, py + iy)) * dem.width +
                Math.min(dem.width - 1, Math.max(0, px + ix))
            ]
          const dzdx = (e(1, 0) - e(-1, 0)) / (2 * metersPerPixel)
          const dzdy = (e(0, 1) - e(0, -1)) / (2 * metersPerPixel)
          const slopeDeg = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
          if (slopeDeg < 12) continue
          // Acimut de la ladera: HACIA DÓNDE BAJA, como rumbo desde el norte.
          // El gradiente sube, así que la bajada es su opuesto; y la `y` del DEM
          // crece hacia el sur, así que la componente norte es `+dzdy`.
          const aspect = ((Math.atan2(-dzdx, dzdy) * 180) / Math.PI + 360) % 360
          let d = Math.abs(aspect - sun.azimuthDeg) % 360
          if (d > 180) d = 360 - d
          facing[y * size + x] = d < 45 ? 1 : d > 135 ? -1 : 0
        }
      }

      const lumOf = (rgb: Float32Array) => {
        const l = new Float32Array(size * size)
        for (let i = 0; i < size * size; i++) {
          l[i] = luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])
        }
        return l
      }

      const baseLum = lumOf(photo.rgb)
      const baseSigma = median(localSigma(baseLum, size, land))
      const pick = (l: Float32Array, side: number) => {
        const v: number[] = []
        for (let i = 0; i < size * size; i++) if (facing[i] === side) v.push(l[i])
        return median(v)
      }
      const baseSep = pick(baseLum, 1) - pick(baseLum, -1)
      console.log(
        `\n  ${area.name} — foto sola: luz propia ${baseSep >= 0 ? '+' : ''}` +
          `${baseSep.toFixed(3)} · textura ${baseSigma.toFixed(4)} · ` +
          `luminancia ${median([...baseLum].filter((_, i) => land[i])).toFixed(3)}`,
      )
      console.log('    opacidad   separación   textura   luminancia   negros<0,02')

      for (const alpha of alphas) {
        const rgba = shade(deriv, WIN, WIN, midLat, light, alpha)
        // Se compone como MapLibre: origen premultiplicado sobre destino.
        const out = new Float32Array(size * size * 3)
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            // Bilineal, que es como la capa se estira al acercarse.
            const fx = (x + 0.5) / PHOTO_SCALE - 0.5
            const fy = (y + 0.5) / PHOTO_SCALE - 0.5
            const ix = Math.min(WIN - 2, Math.max(0, Math.floor(fx)))
            const iy = Math.min(WIN - 2, Math.max(0, Math.floor(fy)))
            const tx = Math.min(1, Math.max(0, fx - ix))
            const ty = Math.min(1, Math.max(0, fy - iy))
            const at = (px: number, py: number, c: number) => rgba[(py * WIN + px) * 4 + c]
            const bil = (c: number) =>
              at(ix, iy, c) * (1 - tx) * (1 - ty) +
              at(ix + 1, iy, c) * tx * (1 - ty) +
              at(ix, iy + 1, c) * (1 - tx) * ty +
              at(ix + 1, iy + 1, c) * tx * ty
            const sa = bil(3)
            const i3 = (y * size + x) * 3
            for (let c = 0; c < 3; c++) {
              out[i3 + c] = Math.min(1, Math.max(0, bil(c) + photo.rgb[i3 + c] * (1 - sa)))
            }
          }
        }
        const lum = lumOf(out)
        const sep = pick(lum, 1) - pick(lum, -1)
        const sigma = median(localSigma(lum, size, land))
        const landLum = [...lum].filter((_, i) => land[i])
        let dark = 0
        let landN = 0
        for (let i = 0; i < size * size; i++) {
          if (!land[i]) continue
          landN++
          if (lum[i] < 0.02 && baseLum[i] >= 0.02) dark++
        }
        console.log(
          `    ${alpha.toFixed(2).padStart(6)}   ` +
            `${(sep >= 0 ? '+' : '') + sep.toFixed(3)}       ` +
            `${sigma.toFixed(4)} (${((sigma / baseSigma) * 100).toFixed(0)} %)  ` +
            `${median(landLum).toFixed(3)}        ` +
            `${((dark / landN) * 100).toFixed(2)} %`,
        )
      }
    }
  }
}

main()
