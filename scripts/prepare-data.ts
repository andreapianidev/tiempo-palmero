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
  warn,
  roundCoords,
  type CkanResource,
} from './shared.js'
import { prepareGuagua } from './prepare-guagua.js'
import { prepareArcgis } from './prepare-arcgis.js'
import { prepareAgro } from './prepare-agro.js'

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

  for (let z = DEM_MIN_ZOOM; z <= DEM_ZOOM; z++) {
    const r = tileRange(z)
    log(`DEM z${z}: ${r.cols}×${r.rows} = ${r.cols * r.rows} teselas`)
    for (let ty = r.y0; ty <= r.y1; ty++) {
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const dir = path.join(PUBLIC, 'dem', String(z), String(tx))
        const file = path.join(dir, `${ty}.png`)
        if (existsSync(file) && (await stat(file)).size > 0) {
          cached++
          continue
        }
        await mkdir(dir, { recursive: true })
        let ok = false
        for (let a = 0; a < 4 && !ok; a++) {
          try {
            const res = await fetch(DEM_URL(z, tx, ty), { headers: UA })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            await writeFile(file, Buffer.from(await res.arrayBuffer()))
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
  const index: Record<string, { file: string; features: number; label: string }> = {}

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

  await writeFile(
    path.join(PUBLIC, 'layers', 'index.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        source:
          'Cabildo Insular de La Palma — Servicio de Transformación Digital (La Palma Smart Island), ' +
          'catálogo CKAN y visor ArcGIS de opendatalapalma.es',
        license: 'CC-BY 4.0 / ODC-BY (límites administrativos)',
        layers: index,
      },
      null,
      2,
    ),
  )
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

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

interface OverpassNode {
  id: number
  lon: number
  lat: number
  tags?: Record<string, string>
}

async function overpass(query: string): Promise<OverpassNode[]> {
  let last: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = (await res.json()) as { elements: OverpassNode[] }
        return j.elements ?? []
      } catch (e) {
        last = e
        await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
      }
    }
  }
  throw last
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
      const nodes = await overpass(q)
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
  if (run('layers')) await prepareLayers()
  if (run('gtfs')) await prepareGuagua()
  if (run('gazetteer')) await prepareGazetteer()
  if (run('snapshot')) await prepareSnapshot()
  log('listo')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
