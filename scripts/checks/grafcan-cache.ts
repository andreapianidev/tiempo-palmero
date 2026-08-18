/**
 * Qué se gana guardando las teselas de GRAFCAN en el navegador, y qué cuesta
 * precargar la isla de lejos.
 *
 * Este script mide las tres cifras que fijan `tiles/budget.ts`:
 *
 *  1. **Que GRAFCAN no manda ninguna cabecera de caché.** Sin `cache-control`,
 *     sin `etag` y sin `last-modified` el navegador no tiene ni frescura
 *     declarada ni validador con el que preguntar «¿sigue valiendo?», así que
 *     la heurística del RFC 9111 §4.2.2 —el 10 % de la edad, que se calcula con
 *     `last-modified`— no tiene de dónde salir. Cada vez que una tesela vuelve
 *     a hacer falta se descarga entera otra vez.
 *  2. **Cuánto se espera por una tesela.** Es lo que la caché ahorra en la
 *     segunda visita, y es la cifra que justifica todo lo demás.
 *  3. **Cuánto pesa la vista de lejos de la isla entera**, que es lo único que
 *     el precargador pide por delante.
 *
 * Y la cuarta, que no se pide sino que se cuenta contra la línea de costa:
 * cuántas teselas hacen falta para cubrir La Palma a cada escala. De ahí sale
 * el techo de la caché.
 *
 *   npx tsx scripts/checks/grafcan-cache.ts
 *
 * Pide teselas a GRAFCAN en vivo. El bloque 2 son 30 peticiones y el bloque 3
 * son 78 —las mismas que precargaría un usuario que encienda los dos fondos—;
 * el bloque 4 no pide ninguna.
 */

import { readFileSync } from 'node:fs'
import { ISLAND_BBOX, pointInPolygon, toMultiPolygon } from '../../src/lib/geo'
import { tileAt, tileUrl, tilesInBbox, type TileXY } from '../../src/lib/tiles/grid'

const SERVICES = [
  { name: 'Ortofoto', service: 'Ortofoto', layer: 'ortofoto' },
  { name: 'MT20', service: 'MT20', layer: 'MT20' },
]

/** La misma plantilla que arma `basemaps.ts`, a la densidad que se quiera. */
function template(service: string, layer: string, px: number): string {
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: '',
    srs: 'EPSG:3857',
    format: 'image/jpeg',
    width: String(px),
    height: String(px),
  })
  return `https://idecan1.grafcan.es/ServicioWMS/${service}?${q}&bbox={bbox-epsg-3857}`
}

async function get(url: string): Promise<{ bytes: number; ms: number; headers: Headers }> {
  const t0 = performance.now()
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  return { bytes: buf.byteLength, ms: performance.now() - t0, headers: res.headers }
}

const kb = (b: number) => `${(b / 1024).toFixed(0)} kB`
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]
}

/** Tres sitios con carga de detalle muy distinta, los mismos de `density.ts`. */
const SPOTS = [
  { name: 'Los Llanos', lon: -17.917, lat: 28.61 },
  { name: 'Caldera', lon: -17.87, lat: 28.72 },
  { name: 'Costa oeste', lon: -17.96, lat: 28.62 },
]

async function headers(): Promise<void> {
  console.log('\n1. CABECERAS DE CACHÉ DE GRAFCAN\n')
  for (const s of SERVICES) {
    const url = tileUrl(template(s.service, s.layer, 512), tileAt(-17.917, 28.61, 14))
    const { headers: h } = await get(url)
    const want = ['cache-control', 'etag', 'last-modified', 'expires', 'age']
    const found = want.filter((k) => h.get(k) !== null)
    console.log(
      `  ${s.name.padEnd(10)} ${found.length ? found.map((k) => `${k}: ${h.get(k)}`).join(' · ') : 'ninguna de cache-control / etag / last-modified / expires / age'}`,
    )
  }
}

async function latency(): Promise<void> {
  console.log('\n2. ESPERA Y PESO POR TESELA (1024 px, la densidad de una pantalla de hoy)\n')
  const all: number[] = []
  const land: number[] = []
  for (const s of SERVICES) {
    const tpl = template(s.service, s.layer, 1024)
    for (const z of [13, 14, 15, 16, 17]) {
      const row: string[] = []
      for (const spot of SPOTS) {
        const r = await get(tileUrl(tpl, tileAt(spot.lon, spot.lat, z)))
        row.push(`${kb(r.bytes).padStart(7)}/${r.ms.toFixed(0).padStart(5)} ms`)
        all.push(r.ms)
        if (spot.name !== 'Costa oeste') land.push(r.bytes)
      }
      console.log(`  ${s.name.padEnd(9)} z${z}  ${row.join('   ')}`)
    }
  }
  const sorted = [...all].sort((a, b) => a - b)
  const lb = [...land].sort((a, b) => a - b)
  console.log(
    `\n  espera: mín ${sorted[0].toFixed(0)} ms · mediana ${pct(sorted, 50).toFixed(0)} ms · ` +
      `p90 ${pct(sorted, 90).toFixed(0)} ms · máx ${pct(sorted, 100).toFixed(0)} ms  (n=${sorted.length})`,
  )
  console.log(
    `  tesela de tierra: mín ${kb(lb[0])} · mediana ${kb(pct(lb, 50))} · máx ${kb(pct(lb, 100))}  (n=${lb.length})`,
  )
}

async function overview(): Promise<void> {
  console.log('\n3. LA VISTA DE LEJOS: LO ÚNICO QUE SE PRECARGA\n')
  for (const s of SERVICES) {
    const tpl = template(s.service, s.layer, 1024)
    let total = 0
    let count = 0
    const parts: string[] = []
    for (const z of [9, 10, 11, 12]) {
      const tiles = tilesInBbox(ISLAND_BBOX, z)
      let bytes = 0
      for (const t of tiles) bytes += (await get(tileUrl(tpl, t))).bytes
      parts.push(`z${z}: ${tiles.length} tes. ${kb(bytes)}`)
      total += bytes
      count += tiles.length
    }
    console.log(`  ${s.name.padEnd(9)} ${parts.join('  ·  ')}`)
    console.log(`  ${''.padEnd(9)} TOTAL ${count} teselas, ${mb(total)}`)
  }
}

function islandCost(): void {
  console.log('\n4. CUÁNTAS TESELAS CUBREN LA PALMA (contra la línea de costa, sin pedir nada)\n')
  const geo = JSON.parse(readFileSync('public/layers/limite-insular.geojson', 'utf8')) as {
    features: { geometry: { type: string; coordinates: unknown } }[]
  }
  const polys = geo.features.flatMap((f) => toMultiPolygon(f.geometry))
  const inLand = (t: TileXY): boolean => {
    // El centro de la tesela y sus cuatro esquinas: con solo el centro, las
    // teselas que muerden la costa por una punta no se cuentan y el techo sale
    // corto justo en el borde, que es donde más se mira.
    const n = 2 ** t.z
    const lon = (x: number) => (x / n) * 360 - 180
    const lat = (y: number) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
    for (const [dx, dy] of [
      [0.5, 0.5],
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const p = [lon(t.x + dx), lat(t.y + dy)]
      if (polys.some((poly) => pointInPolygon(p[0], p[1], poly))) return true
    }
    return false
  }
  // La mediana de una tesela de tierra que midió el bloque 2 el 18 de agosto de
  // 2026 (n=20), para pasar de cuenta a bytes sin pedir 26.000 imágenes.
  const MEDIAN_LAND_BYTES = 230 * 1024
  for (const z of [13, 14, 15, 16, 17]) {
    const tiles = tilesInBbox(ISLAND_BBOX, z).filter(inLand)
    console.log(
      `  z${z}: ${String(tiles.length).padStart(5)} teselas de tierra ≈ ${mb(tiles.length * MEDIAN_LAND_BYTES).padStart(8)} a la mediana medida`,
    )
  }
}

async function main(): Promise<void> {
  await headers()
  await latency()
  await overview()
  islandCost()
  console.log()
}

main()
