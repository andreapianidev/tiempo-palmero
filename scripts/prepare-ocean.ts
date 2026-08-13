/**
 * Batimetría: el talud submarino de La Palma, congelado en build.
 *
 *   npm run prepare-ocean
 *
 * POR QUÉ HACE FALTA UNA FUENTE NUEVA. Las teselas terrarium que ya están en
 * `public/dem/` traen batimetría, pero solo en los zooms bajos, así que
 * `prepare-data.ts` la aplana a cero al guardarlas —un relieve que cambia de
 * forma al acercarse no es un relieve—. El mar se dibujaba encima opaco y no
 * pasaba nada. Con el océano en tres dimensiones sí pasa: la profundidad es lo
 * que decide de qué color es el agua, dónde rompe la ola y dónde se ve el
 * fondo, y a cero todo eso sería mentira uniforme.
 *
 * DE DÓNDE SALE. EMODnet Bathymetry, servicio WCS del consorcio europeo:
 * `emodnet__mean`, «mean depth based on source resolution of 1/16 arc minute».
 * Un dieciseisavo de minuto son 0,0010417°, que a la latitud de la isla son
 * 115,8 m en latitud y 101,7 m en longitud. Comprobado contra el servicio el
 * 13 de agosto de 2026 sobre el recuadro del mapa:
 *
 *   - devuelve GeoTIFF float32 sin comprimir, 912 × 960, exactamente el bbox
 *     pedido y exactamente a resolución nativa;
 *   - mínimo −4046,6 m (la llanura abisal al suroeste) y máximo 2406,6 m en la
 *     cumbre, contra los 2400,1 m del DEM propio y los 2426 m reales del Roque:
 *     las dos mallas se quedan igual de cortas y por el mismo motivo, que es el
 *     tamaño de su celda, así que la costa de una y la del otro coinciden;
 *   - `Access-Control-Allow-Origin: *`, aunque aquí da igual: esto se pide una
 *     vez en build y lo que se sirve es un PNG estático.
 *
 * Licencia CC-BY 4.0. La atribución viaja en el manifiesto y se enseña en la
 * pantalla de fuentes, no en un comentario.
 *
 * QUÉ SE ESCRIBE. Un PNG en gris de 1024 × 1024 en proyección Web Mercator
 * —la misma del mapa, para que leerlo en el sombreador sea una división y no
 * un arcotangente por píxel— con la profundidad codificada por raíz cuadrada.
 * La raíz no es un adorno: reparte los 256 valores donde importan. Con reparto
 * lineal sobre 4100 m cada escalón serían 16 m y los primeros metros de agua
 * —justo donde rompe la ola y donde se ve el fondo— cabrían en un solo valor.
 * Con raíz, el escalón es de 0,06 m a un metro de profundidad, 0,3 m a diez y
 * 2,5 m a mil.
 */

import { mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { PNG } from 'pngjs'
import { MAP_BBOX, latToPixelY, pixelYToLat } from '../src/lib/geo.js'
import { PUBLIC, UA, log } from './shared.js'

const WCS = 'https://ows.emodnet-bathymetry.eu/wcs'
const COVERAGE = 'emodnet__mean'

/**
 * Lado de la textura, en píxeles. 1024 sobre los 0,95° × 1° del recuadro son
 * 92 m en longitud y 108 m en latitud: justo por encima de los 102 × 116 m que
 * de verdad tiene el dato de origen, así que no se inventa detalle ni se tira
 * el que hay. Y es potencia de dos, que es lo que WebGL 1 pide para poder
 * repetir y filtrar una textura sin restricciones.
 */
const SIZE = 1024

/**
 * Techo de la escala de profundidad, en metros.
 *
 * 4100 y no 4046,6 —el fondo real medido— para dejar el número redondo y no
 * tener que regenerar la textura el día que EMODnet corrija un metro. Lo que
 * NO se puede es quedarse corto: una profundidad recortada al techo pintaría
 * una meseta plana donde hay llanura abisal de verdad.
 */
const MAX_DEPTH_M = 4100

// ---------------------------------------------------------------------------
// GeoTIFF: lo justo para leer lo que manda EMODnet
// ---------------------------------------------------------------------------
//
// No entra una librería de GeoTIFF por esto. El servicio devuelve SIEMPRE el
// mismo caso —float32, sin comprimir, en teselas de 512— y leer ese caso son
// cuarenta líneas; una dependencia más en el build para evitarlas costaría más
// de lo que ahorra. Si algún día el servidor cambiara de formato, el script
// avisa con un error que dice qué esperaba, en vez de escribir basura.

interface Raster {
  width: number
  height: number
  values: Float32Array
  /** Grados por píxel y esquina noroeste, del `ModelTransformationTag`. */
  west: number
  north: number
  lonStep: number
  latStep: number
}

function readGeoTiff(buffer: Buffer): Raster {
  const be = buffer.readUInt16BE(0) === 0x4d4d
  const u16 = (o: number) => (be ? buffer.readUInt16BE(o) : buffer.readUInt16LE(o))
  const u32 = (o: number) => (be ? buffer.readUInt32BE(o) : buffer.readUInt32LE(o))
  const f64 = (o: number) => (be ? buffer.readDoubleBE(o) : buffer.readDoubleLE(o))
  const f32 = (o: number) => (be ? buffer.readFloatBE(o) : buffer.readFloatLE(o))

  const SIZE_OF: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 }
  const ifd = u32(4)
  const entries = u16(ifd)
  const tags = new Map<number, { type: number; count: number; at: number }>()
  for (let i = 0; i < entries; i++) {
    const e = ifd + 2 + i * 12
    const tag = u16(e)
    const type = u16(e + 2)
    const count = u32(e + 4)
    const bytes = (SIZE_OF[type] ?? 4) * count
    tags.set(tag, { type, count, at: bytes <= 4 ? e + 8 : u32(e + 8) })
  }
  const values = (tag: number): number[] => {
    const t = tags.get(tag)
    if (!t) throw new Error(`GeoTIFF sin la etiqueta ${tag}`)
    const out: number[] = []
    for (let i = 0; i < t.count; i++) {
      const o = t.at + i * (SIZE_OF[t.type] ?? 4)
      out.push(t.type === 3 ? u16(o) : t.type === 12 ? f64(o) : u32(o))
    }
    return out
  }

  const bits = values(258)[0]
  const format = values(339)[0]
  const compression = values(259)[0]
  if (bits !== 32 || format !== 3 || compression !== 1) {
    throw new Error(
      `GeoTIFF inesperado: ${bits} bits, formato ${format}, compresión ${compression}. ` +
        'Se esperaba float32 sin comprimir.',
    )
  }

  const width = values(256)[0]
  const height = values(257)[0]
  const tileW = values(322)[0]
  const tileH = values(323)[0]
  const offsets = values(324)
  const model = values(34264) // ModelTransformationTag, 4×4

  const out = new Float32Array(width * height)
  const tilesX = Math.ceil(width / tileW)
  for (let t = 0; t < offsets.length; t++) {
    const base = offsets[t]
    const x0 = (t % tilesX) * tileW
    const y0 = Math.floor(t / tilesX) * tileH
    for (let j = 0; j < tileH; j++) {
      const y = y0 + j
      if (y >= height) break
      for (let i = 0; i < tileW; i++) {
        const x = x0 + i
        if (x >= width) continue
        out[y * width + x] = f32(base + (j * tileW + i) * 4)
      }
    }
  }

  return {
    width,
    height,
    values: out,
    west: model[3],
    north: model[7],
    lonStep: model[0],
    latStep: -model[5],
  }
}

/** Altura en el ráster de origen, con muestreo bilineal y borde repetido. */
function sampleRaster(r: Raster, lon: number, lat: number): number {
  const fx = (lon - r.west) / r.lonStep - 0.5
  const fy = (r.north - lat) / r.latStep - 0.5
  const x0 = Math.max(0, Math.min(r.width - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(r.height - 1, Math.floor(fy)))
  const x1 = Math.min(r.width - 1, x0 + 1)
  const y1 = Math.min(r.height - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))
  const a = r.values[y0 * r.width + x0]
  const b = r.values[y0 * r.width + x1]
  const c = r.values[y1 * r.width + x0]
  const d = r.values[y1 * r.width + x1]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}

/** Profundidad (metros, positiva hacia abajo) → byte, por raíz cuadrada. */
export function encodeDepth(depthM: number, maxDepthM = MAX_DEPTH_M): number {
  const d = Math.max(0, Math.min(maxDepthM, depthM))
  return Math.round(255 * Math.sqrt(d / maxDepthM))
}

export async function prepareOcean(): Promise<void> {
  const { west, east, south, north } = MAP_BBOX
  const url =
    `${WCS}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${COVERAGE}` +
    `&subset=Lat(${south},${north})&subset=Long(${west},${east})&format=image/tiff`

  log(`batimetría: pidiendo ${COVERAGE} a EMODnet…`)
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`EMODnet WCS: HTTP ${res.status}`)
  const raster = readGeoTiff(Buffer.from(await res.arrayBuffer()))
  log(
    `batimetría: ${raster.width} × ${raster.height} px a ${raster.lonStep.toFixed(6)}° ` +
      `(${(raster.lonStep * 111320 * Math.cos((28.65 * Math.PI) / 180)).toFixed(1)} m en longitud)`,
  )

  // Remuestreo a Web Mercator. La `y` del mapa no es lineal en latitud, y
  // guardar la textura en latitud obligaría a deshacer la proyección en cada
  // fragmento del sombreador. Se hace aquí una vez.
  const zoom = 0
  const yNorth = latToPixelY(north, zoom)
  const ySouth = latToPixelY(south, zoom)

  const png = new PNG({ width: SIZE, height: SIZE, colorType: 0 })
  let minValue = Infinity
  let maxValue = -Infinity
  let seaPixels = 0
  for (let j = 0; j < SIZE; j++) {
    const lat = pixelYToLat(yNorth + ((j + 0.5) / SIZE) * (ySouth - yNorth), zoom)
    for (let i = 0; i < SIZE; i++) {
      const lon = west + ((i + 0.5) / SIZE) * (east - west)
      const elevation = sampleRaster(raster, lon, lat)
      if (elevation < minValue) minValue = elevation
      if (elevation > maxValue) maxValue = elevation
      if (elevation < 0) seaPixels++
      // En tierra la profundidad es cero. La cota de tierra ya la pone el DEM
      // propio, que a 33,5 m/px la conoce cuatro veces mejor que esto.
      png.data[j * SIZE + i] = encodeDepth(-elevation)
    }
  }

  const dir = path.join(PUBLIC, 'ocean')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'batimetria.png')
  await writeFile(file, PNG.sync.write(png, { colorType: 0, inputColorType: 0 }))
  const size = (await stat(file)).size

  // Puntos de control. No es decoración: son las cifras que acaban en el README
  // y en la interfaz, y si el servicio cambiara de datum o de signo, esto lo
  // canta en la misma ejecución en vez de dejar un mar de color raro.
  const controls: [number, number, string][] = [
    [-17.755, 28.683, 'frente a Santa Cruz'],
    [-17.94, 28.63, 'frente al puerto de Tazacorte'],
    [-18.3, 28.6, 'mar abierto al oeste'],
    [-17.8847, 28.7546, 'Roque de los Muchachos (tierra: 2426 m)'],
  ]
  for (const [lon, lat, name] of controls) {
    log(`  ${name}: ${sampleRaster(raster, lon, lat).toFixed(1)} m`)
  }

  const manifest = {
    /** El recuadro es el mismo que el `maxBounds` del mapa. Ver `geo.ts`. */
    bbox: { west, east, south, north },
    size: SIZE,
    maxDepthM: MAX_DEPTH_M,
    encoding: 'sqrt-depth-8bit' as const,
    projection: 'web-mercator' as const,
    nativeResolution: '1/16 arc minute (~102 × 116 m a 28,6° N)',
    measured: {
      deepestM: +(-minValue).toFixed(1),
      highestM: +maxValue.toFixed(1),
      seaShare: +((100 * seaPixels) / (SIZE * SIZE)).toFixed(1),
    },
    attribution:
      'Batimetría: EMODnet Bathymetry Consortium — EMODnet Digital Bathymetry (DTM), ' +
      'servicio WCS de ows.emodnet-bathymetry.eu. CC-BY 4.0.',
    license: 'CC-BY 4.0',
    generated: new Date().toISOString(),
  }
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  log(
    `batimetría lista: ${SIZE} × ${SIZE}, ${(size / 1024).toFixed(0)} KB, ` +
      `fondo ${manifest.measured.deepestM} m, ${manifest.measured.seaShare} % del recuadro es mar`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('prepare-ocean.ts')) {
  prepareOcean().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
