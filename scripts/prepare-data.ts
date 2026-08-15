/**
 * Script de build. Se ejecuta una vez (o cuando haga falta refrescar) y deja
 * en `public/` todo lo que la app necesita de terceros, para que en runtime la
 * única fuente sea la API del Cabildo.
 *
 *   npm run prepare-data                 # todo
 *   npm run prepare-data -- --only=dem   # dem | layers | gazetteer | snapshot
 *
 * Motivo de existir: la app es comercial. Open-Meteo (Free API) es solo no
 * comercial, y la usage policy de Nominatim/Overpass prohíbe el uso sistemático
 * desde una app. Todo lo que venga de ahí se congela aquí, en build, con su
 * atribución, y se sirve como fichero estático.
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import {
  ISLAND_BBOX,
  lonToPixelX,
  latToPixelY,
  metersPerPixel,
  utm28nToWgs84,
} from '../src/lib/geo.js'
import { fetchCda } from '../src/lib/cabildo.js'
import {
  ROOT,
  PUBLIC,
  UA,
  CKAN,
  getJson,
  log,
  mergeLayerIndex,
  overpass,
  warn,
  roundCoords,
  type CkanResource,
  type LayerIndexEntry,
} from './shared.js'
import { prepareGuagua } from './prepare-guagua.js'
import { prepareArcgis } from './prepare-arcgis.js'
import { prepareAgro } from './prepare-agro.js'
import { prepareOsmRoads } from './prepare-osm-roads.js'
import { prepareTdt } from './prepare-tdt.js'
import { prepareOcean } from './prepare-ocean.js'

// ---------------------------------------------------------------------------
// 1. DEM — teselas terrarium
// ---------------------------------------------------------------------------
// Doble uso deliberado: las MISMAS teselas alimentan el lookup de altitud del
// motor de interpolación y la fuente `raster-dem` del hillshade de MapLibre.
// No se duplican en dos formatos.

const DEM_ZOOM = 12
/**
 * El hillshade de MapLibre necesita teselas al zoom que se está mostrando. Con
 * solo z12 el relieve desaparece por debajo de ese nivel — es decir, en la
 * vista inicial de la isla entera. Los niveles bajos cuestan cuatro teselas
 * contadas, así que se bajan también.
 */
const DEM_MIN_ZOOM = 9
const DEM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

/**
 * El fondo del mar se aplana a cero antes de guardar la tesela.
 *
 * POR QUÉ. Las teselas de Mapzen traen batimetría, pero SOLO en los zooms
 * bajos, y eso las hace incoherentes entre sí. Medido sobre lo descargado el
 * 13 de agosto de 2026, antes de este recorte:
 *
 *   z9  — mínimo −4533,7 m, el 95,2 % de los píxeles por debajo de −100 m
 *   z10 — mínimo −4356,6 m, el 93,3 %
 *   z11 — mínimo   −32,2 m, el 0,0 %
 *   z12 — mínimo   −26,9 m, el 0,0 %
 *
 * O sea que el talud submarino existe hasta z10 y desaparece a z11. En el mapa
 * plano no se notaba —el mar se pinta opaco encima—, pero con la vista 3D la
 * isla se levantaba sobre un cono submarino de 4,5 km que se desvanecía en
 * cuanto uno se acercaba: un relieve que cambia de forma al hacer zoom no es un
 * relieve, es un fallo.
 *
 * Se recorta al guardar y no al dibujar porque el que lee estas teselas para el
 * terreno es MapLibre, que las decodifica él y al que no se le puede meter un
 * filtro por el medio.
 *
 * NO CAMBIA NINGUNA COTA DE TIERRA: `SEA_LEVEL_M` ya da por mar todo lo que
 * esté por debajo de 1,5 m, así que nada de lo que el motor consulta pasa por
 * aquí. Y el talud, que es de verdad y es lo más llamativo de esta isla —sube
 * 6,9 km desde el fondo—, no se puede enseñar mientras solo exista en dos de
 * los cuatro niveles.
 */
function flattenSeafloor(png: PNG): boolean {
  let touched = false
  for (let p = 0; p < png.data.length; p += 4) {
    const h = png.data[p] * 256 + png.data[p + 1] + png.data[p + 2] / 256 - 32768
    if (h >= 0) continue
    // Cero exacto en terrarium: 32768 = 128 · 256 + 0, y B = 0.
    png.data[p] = 128
    png.data[p + 1] = 0
    png.data[p + 2] = 0
    touched = true
  }
  return touched
}

/**
 * Y la tierra que se ha salido al mar, también a cero.
 *
 * ES EL GEMELO DE `flattenSeafloor`, y hace falta por lo mismo: las teselas de
 * los zooms bajos no son las de arriba encogidas, son otro dato. Aquello
 * quitaba el talud submarino que solo existía hasta z10; esto quita lo
 * contrario, una PLATAFORMA DE TIERRA FANTASMA que en esos mismos niveles se
 * mete kilómetro y pico dentro del agua.
 *
 * MEDIDO el 15 de agosto de 2026 sobre 7.572 puntos de mar —los de una rejilla
 * de 0,0025° que caen fuera del límite insular y a menos de 4 km de él—,
 * contando en cuántos el DEM da cota de tierra (más de 1,5 m):
 *
 *   |     | a >100 m | a >400 m | a >800 m | a >1.600 m | cota máx |
 *   | z9  |      902 |      538 |      202 |         12 |    253 m |
 *   | z10 |      880 |      516 |      188 |         11 |    298 m |
 *   | z11 |       36 |        0 |        0 |          0 |     80 m |
 *   | z12 |        2 |        0 |        0 |          0 |     35 m |
 *
 * Doce puntos con roca inventada a más de kilómetro y medio de la costa, y
 * quinientos a más de cuatrocientos metros, con cotas de hasta 253 m. Los dos
 * niveles finos no la tienen: es un problema de los dos gruesos y de nadie más.
 *
 * En el mapa plano no se ve —el mar se pinta encima—, pero en la vista 3D esa
 * plataforma se levanta del agua y MapLibre la pinta con lo que el drapeado
 * tenga sobre el mar, que es tinta oscura y sombreado de ladera a plena sombra:
 * LA FRANJA NEGRA que bordea la costa norte al alejarse es eso, y desaparece al
 * acercarse porque a z12 la plataforma no existe. Después de este recorte no
 * queda un solo punto con tierra más allá de los 400 m en ningún nivel, y lo
 * que queda dentro —67 puntos a z10, entre 100 y 200 m— cabe en un píxel de esa
 * tesela, que mide 134 m.
 *
 * QUIÉN MANDA. El límite insular del Cabildo, igual que en `lib/ocean/
 * land-mask.ts`: es la costa que dibuja el mapa, la que decide dónde empieza el
 * agua y la que ya se rasteriza para el océano. Aquí se rasteriza otra vez
 * —esto es Node y aquello es un `<canvas>`— y todo lo que caiga fuera de ella,
 * más `OFFSHORE_TOLERANCE_M` de margen, se pone a cero.
 *
 * EL MARGEN existe porque el DEM y el polígono no tienen por qué coincidir al
 * píxel: a z12 son 3 píxeles de 33,5 m. Sin margen se podría comer un borde de
 * acantilado de verdad; con más, no se quitaría la plataforma. No cambia
 * ninguna cota de tierra por la misma razón que `flattenSeafloor`: lo que se
 * toca está fuera de la isla.
 */
const OFFSHORE_TOLERANCE_M = 100

type Ring = [number, number][]

/** Los anillos del límite insular, en grados. Uno por polígono y por hueco. */
async function islandRings(): Promise<Ring[]> {
  const file = path.join(PUBLIC, 'layers', 'limite-insular.geojson')
  if (!existsSync(file)) return []
  const geo = JSON.parse(await readFile(file, 'utf8')) as GeoJSON.FeatureCollection
  const rings: Ring[] = []
  for (const f of geo.features) {
    const g = f.geometry
    if (g.type === 'Polygon') rings.push(...(g.coordinates as Ring[]))
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) rings.push(...(p as Ring[]))
  }
  return rings
}

/**
 * La isla pintada sobre la rejilla de teselas de un zoom: 1 tierra, 0 mar.
 *
 * Relleno por barrido con la regla par-impar —la misma que usa la máscara del
 * océano, y por el mismo motivo: los huecos del límite insular vienen con el
 * mismo sentido que el contorno—, y después una dilatación de `radius` píxeles,
 * que es el margen traducido a la escala de este zoom.
 */
function landMask(
  rings: Ring[],
  z: number,
  r: { x0: number; y0: number; cols: number; rows: number },
): Uint8Array {
  const w = r.cols * 256
  const h = r.rows * 256
  const ox = r.x0 * 256
  const oy = r.y0 * 256
  const crossings: number[][] = Array.from({ length: h }, () => [])

  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const ax = lonToPixelX(ring[i][0], z) - ox
      const ay = latToPixelY(ring[i][1], z) - oy
      const bx = lonToPixelX(ring[i + 1][0], z) - ox
      const by = latToPixelY(ring[i + 1][1], z) - oy
      if (ay === by) continue
      const lo = Math.max(0, Math.ceil(Math.min(ay, by) - 0.5))
      const hi = Math.min(h - 1, Math.floor(Math.max(ay, by) - 0.5))
      for (let j = lo; j <= hi; j++) {
        const y = j + 0.5
        // El intervalo se cierra por arriba y se abre por abajo, que es lo que
        // hace que un vértice justo en la línea cuente una sola vez.
        if (ay <= y === by <= y) continue
        crossings[j].push(ax + ((y - ay) * (bx - ax)) / (by - ay))
      }
    }
  }

  const mask = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    const xs = crossings[j]
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5))
      const to = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5))
      for (let i = from; i <= to; i++) mask[j * w + i] = 1
    }
  }

  const radius = Math.round(OFFSHORE_TOLERANCE_M / metersPerPixel(28.65, z))
  if (radius <= 0) return mask
  const tmp = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let v = 0
      for (let d = -radius; d <= radius && !v; d++) {
        const x = i + d
        if (x >= 0 && x < w) v = mask[j * w + x]
      }
      tmp[j * w + i] = v
    }
  }
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      let v = 0
      for (let d = -radius; d <= radius && !v; d++) {
        const y = j + d
        if (y >= 0 && y < h) v = tmp[y * w + i]
      }
      mask[j * w + i] = v
    }
  }
  return mask
}

/** Pone a cero lo que esté fuera de la isla. Idempotente, como el otro. */
function flattenOffshore(png: PNG, mask: Uint8Array, maskW: number, ox: number, oy: number): boolean {
  let touched = false
  for (let j = 0; j < png.height; j++) {
    for (let i = 0; i < png.width; i++) {
      if (mask[(oy + j) * maskW + (ox + i)]) continue
      const p = (j * png.width + i) * 4
      if (png.data[p] === 128 && png.data[p + 1] === 0 && png.data[p + 2] === 0) continue
      png.data[p] = 128
      png.data[p + 1] = 0
      png.data[p + 2] = 0
      touched = true
    }
  }
  return touched
}

interface DemManifest {
  /** Zoom del que se leen las altitudes: siempre el más fino. */
  zoom: number
  /** Zoom más bajo disponible, para la fuente `raster-dem` del relieve. */
  minZoom: number
  tileSize: number
  x0: number
  y0: number
  cols: number
  rows: number
  metersPerPixel: number
  attribution: string
  encoding: 'terrarium'
  generated: string
}

/**
 * Rango de teselas del bbox insular, con margen.
 *
 * El margen no es por si acaso: MapLibre pide las teselas que cubren la
 * VENTANA, no la isla. En una pantalla ancha con la isla entera a la vista eso
 * incluye teselas de mar abierto que, sin margen, devuelven 404 y dejan el
 * relieve a medio pintar con un reguero de «source image could not be decoded»
 * en la consola.
 */
function tileRange(z: number, margin = 1) {
  const x0 = Math.floor(lonToPixelX(ISLAND_BBOX.west, z) / 256) - margin
  const x1 = Math.floor(lonToPixelX(ISLAND_BBOX.east, z) / 256) + margin
  const y0 = Math.floor(latToPixelY(ISLAND_BBOX.north, z) / 256) - margin
  const y1 = Math.floor(latToPixelY(ISLAND_BBOX.south, z) / 256) + margin
  const max = 2 ** z - 1
  const cx0 = Math.max(0, x0)
  const cy0 = Math.max(0, y0)
  const cx1 = Math.min(max, x1)
  const cy1 = Math.min(max, y1)
  return { x0: cx0, x1: cx1, y0: cy0, y1: cy1, cols: cx1 - cx0 + 1, rows: cy1 - cy0 + 1 }
}

async function prepareDem(): Promise<void> {
  let downloaded = 0
  let cached = 0
  let flattened = 0
  let dried = 0

  const rings = await islandRings()
  if (!rings.length) {
    warn('DEM: sin límite insular todavía; la plataforma fantasma se quitará en la próxima pasada')
  }

  for (let z = DEM_MIN_ZOOM; z <= DEM_ZOOM; z++) {
    const r = tileRange(z)
    log(`DEM z${z}: ${r.cols}×${r.rows} = ${r.cols * r.rows} teselas`)
    const mask = rings.length ? landMask(rings, z, r) : null
    const maskW = r.cols * 256
    const dry = (png: PNG, tx: number, ty: number) =>
      mask ? flattenOffshore(png, mask, maskW, (tx - r.x0) * 256, (ty - r.y0) * 256) : false
    for (let ty = r.y0; ty <= r.y1; ty++) {
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const dir = path.join(PUBLIC, 'dem', String(z), String(tx))
        const file = path.join(dir, `${ty}.png`)
        if (existsSync(file) && (await stat(file)).size > 0) {
          cached++
          // Las que ya estaban se revisan igual: una tesela descargada antes de
          // que existiera este recorte sigue teniendo el talud dentro, y sin
          // esta pasada haría falta borrar `public/dem/` a mano para arreglarla.
          // Es idempotente: a la segunda vuelta no queda nada que aplanar.
          const png = PNG.sync.read(await readFile(file))
          const hundido = flattenSeafloor(png)
          const seco = dry(png, tx, ty)
          if (hundido || seco) await writeFile(file, PNG.sync.write(png))
          if (hundido) flattened++
          if (seco) dried++
          continue
        }
        await mkdir(dir, { recursive: true })
        let ok = false
        for (let a = 0; a < 4 && !ok; a++) {
          try {
            const res = await fetch(DEM_URL(z, tx, ty), { headers: UA })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()))
            if (flattenSeafloor(png)) flattened++
            if (dry(png, tx, ty)) dried++
            await writeFile(file, PNG.sync.write(png))
            ok = true
            downloaded++
          } catch (e) {
            if (a === 3) throw new Error(`tesela ${z}/${tx}/${ty}: ${String(e)}`)
            await new Promise((s) => setTimeout(s, 800 * (a + 1)))
          }
        }
      }
    }
  }
  if (flattened) log(`DEM: fondo marino aplanado en ${flattened} teselas`)
  if (dried) log(`DEM: plataforma fantasma quitada en ${dried} teselas`)

  const r = tileRange(DEM_ZOOM)
  const manifest: DemManifest = {
    zoom: DEM_ZOOM,
    minZoom: DEM_MIN_ZOOM,
    tileSize: 256,
    x0: r.x0,
    y0: r.y0,
    cols: r.cols,
    rows: r.rows,
    metersPerPixel: +metersPerPixel(28.65, DEM_ZOOM).toFixed(2),
    encoding: 'terrarium',
    attribution:
      'Modelo de elevación: Mapzen Terrain Tiles (terrarium) vía AWS Open Data. ' +
      'Fuentes: NASA SRTM, NASADEM, USGS 3DEP, ArcticDEM, EU-DEM y otros. Dominio público / CC-BY.',
    generated: new Date().toISOString(),
  }
  await writeFile(
    path.join(PUBLIC, 'dem', 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  )
  log(`DEM listo: ${downloaded} descargadas, ${cached} en caché, ${manifest.metersPerPixel} m/px`)
}

// ---------------------------------------------------------------------------
// 2. Capas estáticas — CKAN
// ---------------------------------------------------------------------------

interface LayerSpec {
  /** Fichero de salida en public/layers/ */
  out: string
  dataset: string
  /** Elige el recurso correcto: varios datasets publican varios GeoJSON. */
  pick?: (r: CkanResource) => boolean
  /** `la_palma_municipios_240701` es el único en EPSG:32628. */
  reprojectUtm28n?: boolean
  label: string
}

const LAYERS: LayerSpec[] = [
  {
    out: 'senderos.geojson',
    dataset: 'red-de-senderos-de-titularidad-insular-de-la-palma',
    label: 'Red de senderos',
  },
  {
    out: 'senderos-poi.geojson',
    dataset: 'puntos-de-interes-de-la-red-de-senderos-de-la-palma',
    label: 'POI de senderos',
  },
  {
    out: 'zonas-recreativas.geojson',
    dataset: 'zonas-recreativas-de-la-palma',
    label: 'Zonas recreativas',
  },
  {
    out: 'municipios.geojson',
    dataset: 'la_palma_municipios_240701',
    reprojectUtm28n: true,
    label: 'Municipios (reproyectado desde EPSG:32628)',
  },
  {
    out: 'limite-insular.geojson',
    dataset: 'la_palma_limite-insular_240701',
    label: 'Límite insular',
  },
  {
    out: 'sensores-co2.geojson',
    dataset: 'sensores-co2-exteriores-alerta-co2-la-palma',
    label: 'Inventario de sensores CO₂',
  },
  {
    out: 'interes-turistico.geojson',
    dataset: 'lugares-de-interes-turistico-de-titularidad-insular',
    label: 'Lugares de interés turístico',
  },
  {
    out: 'interes-cultural.geojson',
    dataset: 'lugares-de-interes-cultural-de-la-palma',
    label: 'Lugares de interés cultural',
  },
  {
    out: 'interes-historico.geojson',
    dataset: 'lugares-de-interes-historico-de-la-palma',
    label: 'Lugares de interés histórico',
  },
  {
    out: 'paradas-guagua.geojson',
    dataset: 'transporte-publico-de-la-palma-paradas-y-lineas-de-guagua',
    // Dos GeoJSON con el mismo `format`: elegir por `format` a secas coge las
    // paradas por casualidad. Se filtra por el nombre del recurso.
    pick: (r) => /parada/i.test(r.name),
    label: 'Paradas de guagua (TILP)',
  },
  {
    out: 'lineas-guagua.geojson',
    dataset: 'transporte-publico-de-la-palma-paradas-y-lineas-de-guagua',
    pick: (r) => /l[ií]nea/i.test(r.name),
    label: 'Líneas de guagua (TILP)',
  },
  // Las carreteras ya no salen de aquí. CKAN publica
  // `vias-interurbanas-de-titularidad-insular-de-la-palma`, que son 53 tramos:
  // solo los insulares. El Feature Service del portal trae los mismos 53 más
  // ocho —la carretera del Parque Nacional, la del aeropuerto y seis
  // municipales— así que se descarga en `prepare-arcgis.ts`.
  {
    out: 'recarga-electrica.geojson',
    dataset: 'puntos-de-recarga-de-vehiculos-electricos-de-la-palma',
    label: 'Puntos de recarga eléctrica',
  },
]

type GeoJson = {
  type: string
  crs?: { properties?: { name?: string } }
  features: { geometry: { type: string; coordinates: unknown } | null; properties: unknown }[]
}

function reprojectCoords(c: unknown): unknown {
  if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
    return utm28nToWgs84(c[0], c[1])
  }
  return Array.isArray(c) ? c.map(reprojectCoords) : c
}

/**
 * Reparaciones de texto en el dato publicado.
 *
 * `lugares-de-interes-cultural-de-la-palma` trae la misma palabra escrita de
 * dos maneras: «Señora» cinco veces y «Seaora» otras cinco. La ñ se perdió al
 * generar el fichero en origen — no es un problema de codificación por nuestra
 * parte: los bytes que sirve el portal son UTF-8 válido y dicen literalmente
 * `Seaora`. Comprobado el 12 ago 2026.
 *
 * La tabla es EXPLÍCITA a propósito. Una regla general del tipo «a → ñ» sería
 * un desastre en castellano, y una heurística sobre «aa» rompería topónimos
 * legítimos. Sólo se corrige lo que se ha visto y verificado, y se registra
 * cuántas veces se ha aplicado para que un cambio silencioso en origen no pase
 * desapercibido.
 */
const TEXT_REPAIRS: [RegExp, string][] = [
  // «Nuestra Señora» es una fórmula fija: cualquier cosa que no sea una ñ
  // entre «Se» y «ora» dentro de esa frase es daño, no una variante. Se han
  // visto Seaora, Seeora, Seoora, Selora y «Se ora» en el mismo fichero.
  [/\bNuestra\s+Se.?ora\b/g, 'Nuestra Señora'],
  [/\bSe(?:a|e|o|l|\s)ora\s+de\b/g, 'Señora de'],
]

function repairText(value: unknown, tally: { count: number }): unknown {
  if (typeof value === 'string') {
    let out = value
    for (const [re, to] of TEXT_REPAIRS) {
      const before = out
      out = out.replace(re, to)
      if (out !== before) tally.count++
    }
    return out
  }
  if (Array.isArray(value)) return value.map((v) => repairText(v, tally))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, repairText(v, tally)]),
    )
  }
  return value
}

async function prepareLayers(): Promise<void> {
  await mkdir(path.join(PUBLIC, 'layers'), { recursive: true })
  const index: Record<string, LayerIndexEntry> = {}

  for (const spec of LAYERS) {
    try {
      const pkg = await getJson<{ result: { resources: CkanResource[] } }>(
        `${CKAN}/package_show?id=${encodeURIComponent(spec.dataset)}`,
      )
      const resources = pkg.result.resources
      const candidates = resources.filter(
        (r) => (r.format ?? '').toLowerCase() === 'geojson',
      )
      const chosen = spec.pick ? candidates.find(spec.pick) : candidates[0]
      if (!chosen) {
        warn(`${spec.dataset}: sin recurso GeoJSON (${resources.map((r) => r.format).join(', ')})`)
        continue
      }

      const geo = await getJson<GeoJson>(chosen.url)
      const declaredCrs = geo.crs?.properties?.name

      if (spec.reprojectUtm28n) {
        // Solo si de verdad viene en UTM: si algún día el portal lo arregla,
        // reproyectar otra vez lo mandaría al golfo de Guinea.
        const looksUtm =
          !!declaredCrs && !/4326|CRS84/i.test(declaredCrs)
        const sample = geo.features.find((f) => f.geometry)?.geometry
        const firstCoord = (function first(c: unknown): number[] | null {
          if (Array.isArray(c) && typeof c[0] === 'number') return c as number[]
          return Array.isArray(c) ? first(c[0]) : null
        })(sample?.coordinates)
        const magnitudeUtm = !!firstCoord && Math.abs(firstCoord[0]) > 1000

        if (looksUtm || magnitudeUtm) {
          for (const f of geo.features) {
            if (f.geometry) f.geometry.coordinates = reprojectCoords(f.geometry.coordinates)
          }
          delete geo.crs
          log(`${spec.out}: reproyectado desde ${declaredCrs ?? 'EPSG:32628 (por magnitud)'}`)
        } else {
          log(`${spec.out}: ya venía en WGS84, no se reproyecta`)
        }
      }

      for (const f of geo.features) {
        if (f.geometry) f.geometry.coordinates = roundCoords(f.geometry.coordinates)
      }

      const tally = { count: 0 }
      for (const f of geo.features) {
        f.properties = repairText(f.properties, tally)
      }
      if (tally.count) log(`${spec.out}: ${tally.count} texto(s) reparado(s) en origen`)
      // El resto del daño de esta capa NO se toca. En el mismo fichero conviven
      // «Corazsn», «Coraznn», «FCtima» y nombres cortados a media palabra
      // («Iglesia de San Andr», «…de la Encarnaci»): el patrón cambia en cada
      // aparición, así que parece daño de OCR en origen y no una conversión de
      // codificación reversible. Adivinar produciría nombres inventados, que es
      // peor que un nombre roto y visiblemente roto.

      await writeFile(
        path.join(PUBLIC, 'layers', spec.out),
        JSON.stringify(geo),
      )
      index[spec.out.replace('.geojson', '')] = {
        file: `/layers/${spec.out}`,
        features: geo.features.length,
        label: spec.label,
      }
      log(`${spec.out}: ${geo.features.length} features`)
    } catch (e) {
      warn(`${spec.dataset}: ${String(e)}`)
    }
  }

  // Las capas del visor ArcGIS entran en el MISMO índice: para la aplicación
  // son ficheros de `/layers/` igual que los demás, y de qué catálogo salió
  // cada uno es asunto de este script, no suyo.
  Object.assign(index, await prepareArcgis())

  // Lo agrario va aparte porque no se baja igual: la capa de cultivos son
  // 217.137 polígonos y de ahí sólo se congela un resumen; el detalle de una
  // parcela se pide en vivo. Ver la cabecera de `prepare-agro.ts`.
  Object.assign(index, await prepareAgro())

  // El viario de OSM NO entra aquí: se pide por su cuenta (`--only=viario`)
  // porque son 20 MB de Overpass y no hay razón para volver a bajarlos cada vez
  // que se refresca una capa del Cabildo. Por eso el índice se funde en vez de
  // reescribirse: registrar estas catorce no puede borrar la decimoquinta.
  await mergeLayerIndex(index)
}

// ---------------------------------------------------------------------------
// 3. Gazetteer — Overpass, EN BUILD TIME
// ---------------------------------------------------------------------------

const MUNICIPIOS = [
  'Barlovento',
  'Breña Alta',
  'Breña Baja',
  'Fuencaliente de La Palma',
  'Garafía',
  'Los Llanos de Aridane',
  'El Paso',
  'Puntagorda',
  'Puntallana',
  'San Andrés y Sauces',
  'Santa Cruz de La Palma',
  'Tazacorte',
  'Tijarafe',
  'Villa de Mazo',
]

interface OverpassNode {
  id: number
  lon: number
  lat: number
  tags?: Record<string, string>
}

interface GazetteerEntry {
  name: string
  lon: number
  lat: number
  kind: string
  municipality: string | null
}

async function prepareGazetteer(): Promise<void> {
  const entries: GazetteerEntry[] = []
  const seen = new Set<string>()

  for (const mun of MUNICIPIOS) {
    // Una petición por municipio, secuencial y con pausa: la usage policy de
    // Overpass prohíbe el uso sistemático desde una app, no una ejecución de
    // build puntual y educada.
    const q =
      `[out:json][timeout:60];` +
      `area["name"="${mun}"]["boundary"="administrative"]->.a;` +
      `node["place"](area.a);out;`
    try {
      const nodes = await overpass<OverpassNode>(q)
      for (const n of nodes) {
        const name = n.tags?.name
        if (!name) continue
        const key = `${name}|${n.lon.toFixed(4)}|${n.lat.toFixed(4)}`
        if (seen.has(key)) continue
        seen.add(key)
        entries.push({
          name,
          lon: +n.lon.toFixed(6),
          lat: +n.lat.toFixed(6),
          kind: n.tags?.place ?? 'place',
          municipality: mun,
        })
      }
      log(`gazetteer ${mun}: ${nodes.length} nodos`)
    } catch (e) {
      warn(`gazetteer ${mun}: ${String(e)}`)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  await writeFile(
    path.join(PUBLIC, 'gazetteer.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        attribution: '© OpenStreetMap contributors — ODbL 1.0',
        note:
          'Extraído en build time vía Overpass API. La app no consulta Overpass ni Nominatim en runtime.',
        count: entries.length,
        entries,
      },
      null,
      2,
    ),
  )
  log(`gazetteer: ${entries.length} topónimos`)
}

// ---------------------------------------------------------------------------
// 4. Snapshot de validación
// ---------------------------------------------------------------------------
// Congela una lectura real de la red meteorológica, con las altitudes ya
// resueltas contra el DEM, para que los tests de leave-one-out corran offline
// y sean deterministas. Un test que dependa de la red no es un criterio de
// aceptación: es una moneda al aire.

async function readDemManifest(): Promise<DemManifest> {
  return JSON.parse(
    await readFile(path.join(PUBLIC, 'dem', 'manifest.json'), 'utf8'),
  ) as DemManifest
}

/** Lector de DEM en Node: descomprime los PNG y muestrea bilineal. */
async function makeNodeDemSampler(): Promise<(lon: number, lat: number) => number | null> {
  const m = await readDemManifest()
  const tiles = new Map<string, PNG>()
  for (let ty = m.y0; ty < m.y0 + m.rows; ty++) {
    for (let tx = m.x0; tx < m.x0 + m.cols; tx++) {
      const file = path.join(PUBLIC, 'dem', String(m.zoom), String(tx), `${ty}.png`)
      if (!existsSync(file)) continue
      tiles.set(`${tx}/${ty}`, PNG.sync.read(await readFile(file)))
    }
  }

  const px = (gx: number, gy: number): number | null => {
    const tx = Math.floor(gx / 256)
    const ty = Math.floor(gy / 256)
    const png = tiles.get(`${tx}/${ty}`)
    if (!png) return null
    const ix = gx - tx * 256
    const iy = gy - ty * 256
    const o = (iy * png.width + ix) * 4
    return png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768
  }

  return (lon, lat) => {
    const fx = lonToPixelX(lon, m.zoom) - 0.5
    const fy = latToPixelY(lat, m.zoom) - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const dx = fx - x0
    const dy = fy - y0
    const a = px(x0, y0)
    const b = px(x0 + 1, y0)
    const c = px(x0, y0 + 1)
    const d = px(x0 + 1, y0 + 1)
    if (a === null || b === null || c === null || d === null) return null
    return (
      a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy
    )
  }
}

async function prepareSnapshot(): Promise<void> {
  const sample = await makeNodeDemSampler()
  const rows = await fetchCda('environment', 'weatherobserved_lastdata')
  const captured = Date.now()

  const enriched = rows.map((r) => {
    let elevation: number | null = null
    try {
      const loc = JSON.parse(String(r.location ?? 'null')) as { coordinates?: number[] } | null
      if (loc?.coordinates) elevation = sample(loc.coordinates[0], loc.coordinates[1])
    } catch {
      /* sin coordenadas usables */
    }
    return { ...r, _demElevation: elevation === null ? null : +elevation.toFixed(1) }
  })

  const dir = path.join(ROOT, 'src', 'lib', '__fixtures__')
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, 'weather-snapshot.json'),
    JSON.stringify(
      {
        capturedAt: new Date(captured).toISOString(),
        capturedAtMs: captured,
        endpoint: 'environment.cda / weatherobserved_lastdata',
        source: 'Cabildo Insular de La Palma — La Palma Smart Island (CC-BY 4.0)',
        note:
          '_demElevation añadido en build desde las teselas terrarium; la API no publica altitud.',
        rows: enriched,
      },
      null,
      2,
    ),
  )
  log(`snapshot: ${enriched.length} filas congeladas para los tests`)
}

// ---------------------------------------------------------------------------

async function main() {
  const only = process.argv
    .find((a) => a.startsWith('--only='))
    ?.slice('--only='.length)
    .split(',')
  const run = (name: string) => !only || only.includes(name)

  await mkdir(PUBLIC, { recursive: true })
  if (run('dem')) await prepareDem()
  // La batimetría es la otra mitad del relieve: la que `prepareDem` aplana a
  // cero al guardar las teselas. Ver la cabecera de `prepare-ocean.ts`.
  if (run('ocean')) await prepareOcean()
  if (run('layers')) await prepareLayers()
  if (run('viario')) await mergeLayerIndex(await prepareOsmRoads())
  // La cobertura de TDT necesita `limite-insular.geojson` para recortar el mar,
  // así que va DESPUÉS de las capas. En una ejecución suelta usa el que ya está
  // en `public/layers/`, que es el mismo fichero.
  if (run('tdt')) await mergeLayerIndex(await prepareTdt())
  if (run('gtfs')) await prepareGuagua()
  if (run('gazetteer')) await prepareGazetteer()
  if (run('snapshot')) await prepareSnapshot()
  log('listo')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
