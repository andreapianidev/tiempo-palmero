/**
 * El icono, a píxeles.
 *
 * Aquí no hay ninguna biblioteca de dibujo, y no es purismo: no hay ninguna a
 * mano. El proyecto tiene tres dependencias de ejecución y `pngjs` entre las de
 * desarrollo, que escribe PNG pero no rasteriza nada. Lo demás era añadir
 * `sharp` —binario nativo de 30 MB— o depender de que quien regenere el icono
 * tenga ImageMagick instalado. Un relleno de polígono con antialias son sesenta
 * líneas y no caduca.
 *
 * CÓMO SE SUAVIZA EL BORDE. Por barrido: cada fila de píxeles se muestrea `SS`
 * veces en vertical, y en horizontal el tramo se reparte con la fracción exacta
 * que cubre el píxel en los extremos. Exacto en X, muestreado en Y. Con SS = 4
 * la costa no enseña escalones ni a 512 px ni al lado de la silueta del SVG,
 * que es donde se compararían.
 */

import { PNG } from 'pngjs'
import type { Pt } from '../contour.js'
import {
  FLAT_BOTTOM,
  FLAT_TOP,
  INK,
  TERRAIN_CEILING,
  TERRAIN_HIGH,
  TERRAIN_LOW,
  TERRAIN_MID,
  type IconArt,
} from './art.js'
import { light, type Sampler } from './relief.js'

/** Submuestras verticales por píxel. */
const SS = 4

/**
 * Entre qué tamaños aparece el relieve.
 *
 * Por debajo de 48 px la isla mide 39 px de alto para 45 km de isla: cada píxel
 * son 1,2 km y el sombreado solo mete grano. Ahí se dibuja la silueta plana,
 * que es exactamente lo que dibuja el SVG de la pestaña. De 128 px en adelante
 * —el icono más pequeño que se instala son 180— se dibuja entero.
 */
const RELIEF_FROM = 48
const RELIEF_FULL = 128

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Cobertura del polígono, por píxel, de 0 a 1. */
function polygonCoverage(ring: Pt[], size: number): Float32Array {
  const cov = new Float32Array(size * size)
  const px = ring.map(([x, y]) => [x * size, y * size] as Pt)
  const w = 1 / SS

  for (let sy = 0; sy < size * SS; sy++) {
    const y = (sy + 0.5) / SS
    const row = Math.floor(y)
    if (row < 0 || row >= size) continue

    const xs: number[] = []
    for (let i = 0; i < px.length; i++) {
      const [ax, ay] = px[i]
      const [bx, by] = px[(i + 1) % px.length]
      if (ay === by) continue
      if (y >= Math.min(ay, by) && y < Math.max(ay, by)) {
        xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax))
      }
    }
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)

    for (let i = 0; i + 1 < xs.length; i += 2) span(cov, row * size, size, xs[i], xs[i + 1], w)
  }
  return cov
}

/** Suma `weight` al tramo [xa, xb] de una fila, con los extremos fraccionarios. */
function span(cov: Float32Array, base: number, size: number, xa: number, xb: number, weight: number): void {
  const a = Math.max(xa, 0)
  const b = Math.min(xb, size)
  if (b <= a) return
  const first = Math.floor(a)
  const last = Math.min(Math.floor(b - 1e-9), size - 1)
  if (first === last) {
    cov[base + first] += (b - a) * weight
    return
  }
  cov[base + first] += (first + 1 - a) * weight
  for (let x = first + 1; x < last; x++) cov[base + x] += weight
  cov[base + last] += (b - last) * weight
}

/** Cobertura del rectángulo redondeado, muestreada SS×SS. `corner` 0 es a sangre. */
function cardCoverage(size: number, corner: number): Float32Array {
  const cov = new Float32Array(size * size)
  const r = corner * size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (corner <= 0) {
        cov[y * size + x] = 1
        continue
      }
      let sum = 0
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const dx = Math.abs(x + (i + 0.5) / SS - size / 2) - (size / 2 - r)
          const dy = Math.abs(y + (j + 0.5) / SS - size / 2) - (size / 2 - r)
          if (dx <= 0 || dy <= 0 || Math.hypot(dx, dy) <= r) sum++
        }
      }
      cov[y * size + x] = sum / (SS * SS)
    }
  }
  return cov
}

export function render(art: IconArt, size: number, dem: Sampler): Buffer {
  const card = cardCoverage(size, art.corner)
  const island = polygonCoverage(art.island, size)
  const relief = clamp((size - RELIEF_FROM) / (RELIEF_FULL - RELIEF_FROM))

  let top = Infinity
  let bottom = -Infinity
  for (const [, y] of art.island) {
    if (y < top) top = y
    if (y > bottom) bottom = y
  }

  const ink = rgb(INK)
  const low = rgb(TERRAIN_LOW)
  const mid = rgb(TERRAIN_MID)
  const high = rgb(TERRAIN_HIGH)
  const flatTop = rgb(FLAT_TOP)
  const flatBottom = rgb(FLAT_BOTTOM)

  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5) / size
    // El degradado de la versión plana va de la cumbre a la costa, igual que el
    // `linearGradient` del SVG: los dos se miden sobre la caja de la silueta.
    const flat = mix(flatTop, flatBottom, clamp((ny - top) / (bottom - top)))

    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const clip = card[i]
      const cover = Math.min(island[i], clip)
      if (clip <= 0) continue

      let color = flat
      if (cover > 0 && relief > 0) {
        const nx = (x + 0.5) / size
        const h = dem.at(nx, ny)
        const t = clamp(h / TERRAIN_CEILING)
        const hyps = t < 0.5 ? mix(low, mid, t * 2) : mix(mid, high, (t - 0.5) * 2)
        const k = 1 + relief * (light(dem, art, nx, ny, 1 / size) - 1)
        const lit: Rgb = [
          Math.min(hyps[0] * k, 255),
          Math.min(hyps[1] * k, 255),
          Math.min(hyps[2] * k, 255),
        ]
        color = mix(flat, lit, relief)
      }

      const o = i * 4
      png.data[o] = Math.round(ink[0] + (color[0] - ink[0]) * cover)
      png.data[o + 1] = Math.round(ink[1] + (color[1] - ink[1]) * cover)
      png.data[o + 2] = Math.round(ink[2] + (color[2] - ink[2]) * cover)
      png.data[o + 3] = Math.round(clip * 255)
    }
  }
  return PNG.sync.write(png)
}
