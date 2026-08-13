/**
 * La cobertura simulada de los repetidores de TDT, del KMZ que publica el
 * Cabildo, fundida en un solo PNG.
 *
 * De dónde sale: el elemento `75692adf55a74abfac6c4f1ce48a5a84` del portal del
 * Cabildo en ArcGIS Online —«Televisión digital terrestre (TDT) en la isla de
 * La Palma», fichero `Simulaciones_Rep_TDT.kmz`, publicado en abril de 2018—.
 * Dentro hay 49 `GroundOverlay`: una imagen por sector de repetidor, cada una
 * con su caja de coordenadas. Es lo único de cobertura de televisión que existe
 * publicado de esta isla: el catálogo CKAN no lo tiene, y el Feature Service de
 * `Telecomunicaciones` solo trae los 100 emplazamientos de antena, sin ninguna
 * geometría de cobertura.
 *
 * Qué hace este script:
 *
 *  1. Baja el KMZ y lo abre (es un ZIP; ver `unzip()`, abajo).
 *  2. Funde las 49 imágenes en una rejilla del tamaño del bbox insular, a la
 *     resolución de la más fina de ellas —92 m—, contando CUÁNTOS sectores
 *     alcanzan cada celda.
 *  3. Recorta a la línea de costa con `limite-insular.geojson`. La simulación
 *     pinta también mar abierto: 43.143 celdas de las 92.610 que cubría.
 *  4. Graba el conteo en el canal alfa, en tres escalones (ver `lib/tdt/mask.ts`).
 *
 * Lo que NO hace, y por eso la interfaz lo repite: no convierte esto en «dónde
 * se ve la tele». Son los repetidores, el cálculo es de 2018 y no es una medida.
 *
 *   npm run prepare-data -- --only=tdt
 */

import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { PNG } from 'pngjs'
import { ISLAND_BBOX } from '../src/lib/geo.js'
import { TDT_COLOR, TDT_TIER_ALPHA } from '../src/lib/tdt/mask.js'
import { PUBLIC, UA, log, warn, type LayerIndexEntry } from './shared.js'

const ITEM = '75692adf55a74abfac6c4f1ce48a5a84'
const KMZ = `https://www.arcgis.com/sharing/rest/content/items/${ITEM}/data`
const OUT = 'tdt-cobertura.png'

/**
 * Lector de ZIP mínimo, y a propósito.
 *
 * Node no trae ninguno, y meter una dependencia entera para abrir un fichero de
 * 55 KB en un script que se ejecuta a mano no sale a cuenta. Se lee el
 * directorio central —que es lo que manda en un ZIP, no las cabeceras locales—
 * y se infla cada entrada. Sólo se soportan los dos métodos que usa un KMZ:
 * 0 (almacenado) y 8 (deflate). Cualquier otra cosa revienta con su nombre
 * delante, en vez de devolver medio fichero.
 */
function unzip(buf: Buffer): Map<string, Buffer> {
  // Fin del directorio central: firma PK\5\6, buscada desde el final porque
  // puede llevar comentario detrás.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('el KMZ no es un ZIP: no aparece el fin del directorio central')

  const entries = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map<string, Buffer>()

  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('directorio central corrupto')
    const method = buf.readUInt16LE(p + 10)
    const compressed = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    // La cabecera local repite el nombre y trae SU PROPIA longitud de extra,
    // que no tiene por qué ser la del directorio central. Se lee de ahí.
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compressed)

    if (method === 0) out.set(name, Buffer.from(raw))
    else if (method === 8) out.set(name, inflateRawSync(raw))
    else throw new Error(`${name}: método de compresión ${method} no soportado`)

    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const tag = (xml: string, name: string): string | undefined =>
  xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]

interface Overlay {
  name: string
  href: string
  north: number
  south: number
  east: number
  west: number
}

function parseOverlays(kml: string): Overlay[] {
  const out: Overlay[] = []
  for (const m of kml.matchAll(/<GroundOverlay>([\s\S]*?)<\/GroundOverlay>/g)) {
    const o = m[1]
    const href = tag(o, 'href')
    const north = Number(tag(o, 'north'))
    const south = Number(tag(o, 'south'))
    const east = Number(tag(o, 'east'))
    const west = Number(tag(o, 'west'))
    const rotation = Number(tag(o, 'rotation') ?? 0)
    if (!href || ![north, south, east, west].every(Number.isFinite)) continue
    // Ninguna de las 49 viene rotada. Si algún día una lo viniera, colocarla
    // como si no lo estuviera la pondría en otro sitio, así que se avisa.
    if (rotation) {
      warn(`TDT: «${tag(o, 'name')}» viene rotada ${rotation}°, se descarta`)
      continue
    }
    out.push({ name: tag(o, 'name') ?? href, href: decodeURIComponent(href), north, south, east, west })
  }
  return out
}

/**
 * Máscara de tierra por barrido de filas.
 *
 * Punto-en-polígono celda a celda serían 260.000 celdas × 73.605 vértices. Por
 * filas es un cruce por fila: se cortan los anillos con la latitud del centro
 * de la fila, se ordenan los cortes y se rellena entre pares. Comprobado contra
 * la superficie real: las 95.801 celdas de tierra que salen son 711 km², y La
 * Palma tiene 708.
 */
function landMask(rings: number[][][], width: number, height: number): Uint8Array {
  const { west, east, south, north } = ISLAND_BBOX
  const inside = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const lat = north - ((y + 0.5) / height) * (north - south)
    const xs: number[] = []
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [x1, y1] = ring[i - 1]
        const [x2, y2] = ring[i]
        if (y1 > lat === y2 > lat) continue
        xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.round(((xs[k] - west) / (east - west)) * width))
      const x1 = Math.min(width, Math.round(((xs[k + 1] - west) / (east - west)) * width))
      for (let x = x0; x < x1; x++) inside[y * width + x] = 1
    }
  }
  return inside
}

function ringsOf(geojson: unknown): number[][][] {
  const rings: number[][][] = []
  const features = (geojson as { features?: { geometry?: { type: string; coordinates: unknown } }[] })
    .features
  for (const f of features ?? []) {
    const g = f.geometry
    if (!g) continue
    const polys = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as number[][][][]
    for (const poly of polys) for (const ring of poly) rings.push(ring)
  }
  return rings
}

export async function prepareTdt(): Promise<Record<string, LayerIndexEntry>> {
  let files: Map<string, Buffer>
  try {
    const res = await fetch(KMZ, { headers: UA })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    files = unzip(Buffer.from(await res.arrayBuffer()))
  } catch (e) {
    warn(`TDT: ${String(e)} — se deja el fichero anterior`)
    return {}
  }

  const kml = files.get('doc.kml')?.toString('utf8')
  if (!kml) {
    warn('TDT: el KMZ no trae doc.kml')
    return {}
  }

  const overlays = parseOverlays(kml)
  if (!overlays.length) {
    warn('TDT: ninguna simulación en el KMZ')
    return {}
  }

  // La rejilla se hace a la resolución de la simulación MÁS FINA: subirla no
  // inventa detalle, y bajarla se comería las sombras de radio estrechas, que
  // son justo lo que este dato tiene de valioso.
  const images = new Map<string, PNG>()
  let cell = Infinity
  for (const o of overlays) {
    const raw = files.get(o.href)
    if (!raw) {
      warn(`TDT: falta la imagen ${o.href}`)
      continue
    }
    const png = PNG.sync.read(raw)
    images.set(o.href, png)
    cell = Math.min(cell, (o.east - o.west) / png.width, (o.north - o.south) / png.height)
  }

  const { west, east, south, north } = ISLAND_BBOX
  const width = Math.round((east - west) / cell)
  const height = Math.round((north - south) / cell)
  const cover = new Uint8Array(width * height)

  for (const o of overlays) {
    const png = images.get(o.href)
    if (!png) continue
    // Un sector cuenta UNA vez por celda aunque cubra varios de sus píxeles.
    const counted = new Uint8Array(width * height)
    for (let sy = 0; sy < png.height; sy++) {
      for (let sx = 0; sx < png.width; sx++) {
        if (png.data[(sy * png.width + sx) * 4 + 3] === 0) continue
        const lonA = o.west + (sx / png.width) * (o.east - o.west)
        const lonB = o.west + ((sx + 1) / png.width) * (o.east - o.west)
        const latB = o.north - (sy / png.height) * (o.north - o.south)
        const latA = o.north - ((sy + 1) / png.height) * (o.north - o.south)
        const x0 = Math.max(0, Math.floor(((lonA - west) / (east - west)) * width))
        const x1 = Math.min(width, Math.ceil(((lonB - west) / (east - west)) * width))
        const y0 = Math.max(0, Math.floor(((north - latB) / (north - south)) * height))
        const y1 = Math.min(height, Math.ceil(((north - latA) / (north - south)) * height))
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = y * width + x
            if (!counted[i]) {
              counted[i] = 1
              cover[i]++
            }
          }
        }
      }
    }
  }

  const island = JSON.parse(
    await readFile(path.join(PUBLIC, 'layers', 'limite-insular.geojson'), 'utf8'),
  )
  const land = landMask(ringsOf(island), width, height)

  const out = new PNG({ width, height })
  out.data.fill(0)
  const histogram = [0, 0, 0, 0]
  let landCells = 0
  let clipped = 0
  for (let i = 0; i < cover.length; i++) {
    if (land[i]) landCells++
    if (!cover[i]) continue
    if (!land[i]) {
      clipped++
      continue
    }
    const tier = Math.min(3, cover[i])
    histogram[tier]++
    const p = i * 4
    out.data[p] = TDT_COLOR[0]
    out.data[p + 1] = TDT_COLOR[1]
    out.data[p + 2] = TDT_COLOR[2]
    out.data[p + 3] = TDT_TIER_ALPHA[tier]
  }

  const png = PNG.sync.write(out, { colorType: 6 })
  await writeFile(path.join(PUBLIC, 'layers', OUT), png)

  const covered = histogram[1] + histogram[2] + histogram[3]
  log(
    `${OUT}: ${overlays.length} simulaciones, ${width}×${height} celdas de ` +
      `${Math.round(cell * 111320)} m, ${(png.length / 1024).toFixed(0)} KB`,
  )
  log(
    `TDT: ${covered} celdas de tierra con simulación de ${landCells} ` +
      `(${((covered / landCells) * 100).toFixed(1)} %) · un repetidor ${histogram[1]}, ` +
      `dos ${histogram[2]}, tres o más ${histogram[3]} · ${clipped} celdas de mar recortadas`,
  )

  return {
    'tdt-cobertura': {
      file: `/layers/${OUT}`,
      features: overlays.length,
      label: `Cobertura simulada de los repetidores de TDT (${overlays.length} simulaciones, 2018)`,
      source: `Cabildo Insular de La Palma — Simulaciones_Rep_TDT.kmz (ArcGIS Online, elemento ${ITEM})`,
      license: 'CC-BY 4.0',
    },
  }
}
