/**
 * Cuánto detalle real queda por pedirle a la ortofoto de GRAFCAN.
 *
 * El fondo «Satélite» pide teselas z16 con `MAX_DENSITY` 2 (`realce/density.ts`)
 * y no más. Pero el vuelo territorial está a 25 cm: a z16 la foto se pide a
 * 2,4 m por píxel (512) o 1,2 m (1024), o sea que el servidor tiene entre 5 y 10
 * niveles de detalle que no se le piden. La pregunta que contesta este script es
 * si vale la pena pedirlos —subiendo `maxzoom`— y qué cuesta.
 *
 * El KPI es el mismo de `density.ts`: la energía media del laplaciano (|∇²|
 * medio por píxel, luma en 0–255). Más laplaciano = más detalle fino real, y la
 * comparación que importa es la que pasa en pantalla, no la de la petición:
 *
 *   - HOY, cámara a z17: MapLibre pide la tesela z16 y la magnífica ×2. En la
 *     pantalla eso es el laplaciano de la z16 pedida, medido DESPUÉS de la
 *     ampliación (la columna «512 ampliado a 1024» de `density.ts`, que cayó de
 *     52,2 a 18,1).
 *   - CON `maxzoom: 17`: MapLibre pide la tesela z17 a la densidad de la
 *     pantalla, sin magnificar. Cada píxel cubre la mitad de terreno.
 *
 * Y la otra orilla pesa igual: bytes por tesela y por superficie en pantalla,
 * porque la licencia prohíbe la descarga masiva y el ancho de banda es lo que
 * se paga de verdad.
 *
 *   npx tsx scripts/checks/detalle-tiles.ts
 *
 * Pide teselas a GRAFCAN en vivo: 3 recuadros × 6 peticiones.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const MERC = 20037508.342789244
const mercX = (lon: number) => (lon * MERC) / 180
const mercY = (lat: number) =>
  (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (MERC / 180)

const TMP = mkdtempSync(join(tmpdir(), 'detalle-tiles-'))

/** Una petición por recuadro, no una por comparación: z16 y z17 se usan dos veces. */
const CACHE = new Map<string, { luma: Uint8Array; size: number; bytes: number }>()

// --- los recuadros -----------------------------------------------------------
//
// Cada uno contesta una de las preguntas: casas (un pueblo), acantilados (la
// pared de la Caldera, la pendiente más dura de la isla) y costa (las
// escarpaduras al mar del oeste, que en 3D es donde la foto se estira).
interface Area {
  name: string
  lon: number
  lat: number
}

const AREAS: Area[] = [
  { name: 'LosLlanos', lon: -17.91, lat: 28.655 },
  { name: 'Caldera', lon: -17.87, lat: 28.75 },
  { name: 'CostaOeste', lon: -17.96, lat: 28.70 },
]

// --- la petición -------------------------------------------------------------

const LAYER_URL = 'https://idecan1.grafcan.es/ServicioWMS/Ortofoto'

/**
 * La ortofoto sobre un recuadro, a un tamaño pedido. El recuadro va en la
 * cuadrícula 3857 de la tesela, para que la comparación sea la que hace
 * MapLibre con sus zooms enteros.
 */
async function ortofoto(
  tileX: number,
  tileY: number,
  z: number,
  size: number,
  name: string,
): Promise<{ luma: Uint8Array; size: number; bytes: number }> {
  const hit = CACHE.get(name)
  if (hit) return hit
  const n = Math.pow(2, z)
  const x0 = (tileX / n) * MERC * 2 - MERC
  const x1 = ((tileX + 1) / n) * MERC * 2 - MERC
  const y1 = MERC - (tileY / n) * MERC * 2
  const y0 = MERC - ((tileY + 1) / n) * MERC * 2
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
    bbox: `${x0},${y0},${x1},${y1}`,
  })
  const url = `${LAYER_URL}?${q}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GRAFCAN ${res.status} en ${name}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const jpg = join(TMP, `${name}.jpg`)
  const png = join(TMP, `${name}.png`)
  writeFileSync(jpg, buf)
  // Node no decodifica JPEG y el servicio solo sirve JPEG. `sips` es de macOS.
  execFileSync('sips', ['-s', 'format', 'png', jpg, '--out', png], { stdio: 'ignore' })
  const image = PNG.sync.read(readFileSync(png))
  if (image.width !== size || image.height !== size) {
    throw new Error(`${name}: salió ${image.width}×${image.height}, se pedía ${size}`)
  }
  const luma = new Uint8Array(size * size)
  for (let i = 0; i < size * size; i++) {
    luma[i] = Math.round(
      0.2126 * image.data[i * 4] + 0.7152 * image.data[i * 4 + 1] + 0.0722 * image.data[i * 4 + 2],
    )
  }
  const out = { luma, size, bytes: buf.length }
  CACHE.set(name, out)
  return out
}

// --- las medidas -------------------------------------------------------------

/** |∇²| medio por píxel, en niveles de 0–255. El KPI de `density.ts`. */
function laplaciano(luma: Uint8Array, size: number): number {
  let sum = 0
  let n = 0
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const c = luma[y * size + x] * 8
      const s =
        luma[(y - 1) * size + x - 1] +
        luma[(y - 1) * size + x] +
        luma[(y - 1) * size + x + 1] +
        luma[y * size + x - 1] +
        luma[y * size + x + 1] +
        luma[(y + 1) * size + x - 1] +
        luma[(y + 1) * size + x] +
        luma[(y + 1) * size + x + 1]
      sum += Math.abs(c - s)
      n++
    }
  }
  return sum / n
}

/** La mediana de la luma, para saber si hay tierra de verdad en el recuadro. */
function mediana(v: Uint8Array): number {
  const s = [...v].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Ampliación bilineal, como la que hace el navegador/MapLibre cuando la tesela
 * pedida ocupa en pantalla más píxeles de los que trae. Es la columna «512
 * ampliado a 1024» de `density.ts`: lo que de verdad se ve hoy con cámara a
 * z+1 y `maxzoom` en z.
 */
function ampliar(src: Uint8Array, srcSize: number, dstSize: number): Uint8Array {
  const out = new Uint8Array(dstSize * dstSize)
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const fx = ((x + 0.5) / dstSize) * srcSize - 0.5
      const fy = ((y + 0.5) / dstSize) * srcSize - 0.5
      const ix = Math.min(srcSize - 2, Math.max(0, Math.floor(fx)))
      const iy = Math.min(srcSize - 2, Math.max(0, Math.floor(fy)))
      const tx = Math.min(1, Math.max(0, fx - ix))
      const ty = Math.min(1, Math.max(0, fy - iy))
      const at = (px: number, py: number) => src[py * srcSize + px]
      out[y * dstSize + x] = Math.round(
        at(ix, iy) * (1 - tx) * (1 - ty) +
          at(ix + 1, iy) * tx * (1 - ty) +
          at(ix, iy + 1) * (1 - tx) * ty +
          at(ix + 1, iy + 1) * tx * ty,
      )
    }
  }
  return out
}

/** La tesela z16 que contiene el punto, en la cuadrícula de MapLibre. */
function tileOf(lon: number, lat: number, z: number): [number, number] {
  const x = (mercX(lon) + MERC) / (MERC * 2) * Math.pow(2, z)
  const y = (MERC - mercY(lat)) / (MERC * 2) * Math.pow(2, z)
  return [Math.floor(x), Math.floor(y)]
}

/**
 * El escenario que se ve hoy y el que se vería con `maxzoom` un nivel más,
 * medidos sobre los MISMOS píxeles de pantalla.
 *
 * `HOY` = la tesela z (maxzoom) pedida a 1024 y magnificada ×2 hasta 1024.
 * `z+1` = las cuatro subteselas pedidas a 512 cada una, que juntas ocupan los
 * mismos 1024 píxeles sin magnificar. (A cámara z+1 la densidad 2 hace que cada
 * tesela z+1 se pida a 1024 —más detalle todavía—, pero 4×1024 peticiones por
 * pantalla es otro coste; aquí se compara el paso más barato.)
 */
async function main() {
  for (const area of AREAS) {
    const [tx16, ty16] = tileOf(area.lon, area.lat, 16)
    const [tx17, ty17] = tileOf(area.lon, area.lat, 17)
    const [tx18, ty18] = tileOf(area.lon, area.lat, 18)
    console.log(`\n=== ${area.name} (${area.lon}, ${area.lat}) ===`)

    // --- pedidas tal cual ----------------------------------------------------
    const filas: { etiqueta: string; lap: number; bytes: number; luma: number }[] = []
    for (const [z, tx, ty] of [
      [16, tx16, ty16],
      [17, tx17, ty17],
      [18, tx18, ty18],
    ] as const) {
      for (const px of [512, 1024]) {
        const { luma, bytes } = await ortofoto(
          tx, ty, z, px, `${area.name}-z${z}-${px}`,
        )
        filas.push({
          etiqueta: `z${z} @ ${px}`,
          lap: laplaciano(luma, px),
          bytes,
          luma: mediana(luma),
        })
      }
    }

    // --- lo que se ve hoy con cámara a z+1: la z16 magnificada ----------------
    // La subtesela z17 sale del cuadrante de la z16 pedida a 1024 (512 píxeles
    // de lado), ampliado de vuelta a 1024 — que es lo que el navegador dibuja.
    const z16 = await ortofoto(tx16, ty16, 16, 1024, `${area.name}-z16-1024`)
    const cx = (tx17 % 2) * 512
    const cy = (ty17 % 2) * 512
    const cuadrante = new Uint8Array(512 * 512)
    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        cuadrante[y * 512 + x] = z16.luma[(cy + y) * 1024 + cx + x]
      }
    }
    const magnificada = ampliar(cuadrante, 512, 1024)
    const lapHoy = laplaciano(magnificada, 1024)

    // --- lo mismo a densidad 1: la z16 pedida a 512, cuadrante de 256 -------
    const z16b = await ortofoto(tx16, ty16, 16, 512, `${area.name}-z16-512`)
    const cxB = (tx17 % 2) * 256
    const cyB = (ty17 % 2) * 256
    const cuadranteB = new Uint8Array(256 * 256)
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        cuadranteB[y * 256 + x] = z16b.luma[(cyB + y) * 512 + cxB + x]
      }
    }
    const magnificadaB = ampliar(cuadranteB, 256, 512)
    const lapHoyB = laplaciano(magnificadaB, 512)

    // --- lo que se vería con maxzoom 17: la z17 pedida a 1024 -----------------
    const z17 = await ortofoto(tx17, ty17, 17, 1024, `${area.name}-z17-1024`)
    const lapZ17 = laplaciano(z17.luma, 1024)

    // --- lo que se vería con maxzoom 18: la z18 pedida a 512 ------------------
    // Misma resolución de terreno que z17@1024 (mitad de lado, mitad de píxeles).
    const z18 = await ortofoto(tx18, ty18, 18, 512, `${area.name}-z18-512`)
    const lapZ18 = laplaciano(z18.luma, 512)

    console.log('  petición       |∇²|    bytes     luma')
    for (const f of filas) {
      console.log(
        `  ${f.etiqueta.padEnd(12)}  ${f.lap.toFixed(1).padStart(6)}  ` +
          `${String(f.bytes).padStart(7)}   ${f.luma.toFixed(1)}`,
      )
    }
    console.log('  --- pantalla, cámara a z17, 1024 píxeles físicos ---')
    console.log(
      `  HOY (z16 ampliada)   ${lapHoy.toFixed(1).padStart(6)}   ` +
        `${String(z16.bytes).padStart(7)}   (1 tesela)`,
    )
    console.log(
      `  maxzoom 17 (z17 1k)  ${lapZ17.toFixed(1).padStart(6)}   ` +
        `${String(z17.bytes).padStart(7)}   (×4 teselas = ${z17.bytes * 4} bytes)`,
    )
    console.log(
      `  maxzoom 18 (z18 512) ${lapZ18.toFixed(1).padStart(6)}   ` +
        `${String(z18.bytes).padStart(7)}   (×16 teselas = ${z18.bytes * 16} bytes)`,
    )
    console.log(
      `  → z17 da ${(lapZ17 / lapHoy).toFixed(2)}× el detalle de hoy; ` +
        `z18@512 da ${(lapZ18 / lapHoy).toFixed(2)}×`,
    )
    console.log('  --- pantalla, densidad 1 (512 píxeles físicos) ---')
    console.log(
      `  HOY (z16 ampliada)   ${lapHoyB.toFixed(1).padStart(6)}   ` +
        `${String(z16b.bytes).padStart(7)}   (1 tesela)`,
    )
    const z17b = await ortofoto(tx17, ty17, 17, 512, `${area.name}-z17-512`)
    const lapZ17b = laplaciano(z17b.luma, 512)
    console.log(
      `  maxzoom 17 (z17 512) ${lapZ17b.toFixed(1).padStart(6)}   ` +
        `${String(z17b.bytes).padStart(7)}   (×4 teselas = ${z17b.bytes * 4} bytes)`,
    )
    console.log(
      `  → z17 da ${(lapZ17b / lapHoyB).toFixed(2)}× el detalle de hoy`,
    )
  }
  rmSync(TMP, { recursive: true, force: true })
}

main()
