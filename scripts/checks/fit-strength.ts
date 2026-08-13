/**
 * ¿Cuánto explica de verdad la altitud, hora a hora?
 *
 * El motor entero descansa en una frase del README: «la altitud domina
 * cualquier variable atmosférica». Este script la pone a prueba contra el
 * archivo, reconstruyendo el ajuste en CADA instante de la serie en vez de en
 * el único momento en que uno mire la pantalla.
 *
 * Importa porque el rechazo de outliers mide el residuo contra esa recta: si
 * hay ratos en que la recta no explica nada, en esos ratos «desviarse 3σ del
 * ajuste» no dice nada del sensor, y sin embargo la aplicación lo enseña como
 * un veredicto sobre él.
 *
 *   npx tsx scripts/checks/fit-strength.ts [YYYY-MM-DD]
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { blitTerrarium, emptyDem, elevationAt, type DemManifest } from '../../src/lib/dem'
import { BOUNDS } from '../../src/lib/quality'
import { ols, type Sample } from '../../src/lib/interpolate'
import { inIslandBbox } from '../../src/lib/geo'

const ROOT = join(import.meta.dirname, '../..')
const day = process.argv[2] ?? new Date().toISOString().slice(0, 10)
const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

function loadDem() {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'public/dem/manifest.json'), 'utf8'),
  ) as DemManifest
  const dem = emptyDem(manifest)
  for (let r = 0; r < manifest.rows; r++) {
    for (let c = 0; c < manifest.cols; c++) {
      const png = PNG.sync.read(
        readFileSync(
          join(ROOT, `public/dem/${manifest.zoom}/${manifest.x0 + c}/${manifest.y0 + r}.png`),
        ),
      )
      blitTerrarium(dem, new Uint8ClampedArray(png.data), {
        x: c * manifest.tileSize,
        y: r * manifest.tileSize,
        width: png.width,
        height: png.height,
      })
    }
  }
  return dem
}

const url =
  'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery' +
  '?path=/public/sc_lapalma/verticals/sql/environment.cda' +
  '&_TRUST_USER_=opendata_sc_lapalma&dataAccessId=weatherobserved&outputType=json' +
  `&paramstart=${day}&paramfinish=${next}`

const payload = (await (await fetch(url)).json()) as {
  metadata: { colName: string }[]
  resultset: unknown[][]
}
const col = (name: string) => payload.metadata.findIndex((m) => m.colName === name)
const I = {
  t: col('temperature'),
  rh: col('relativehumidity'),
  ts: col('timeinstant'),
  eid: col('entityid'),
  name: col('name'),
  loc: col('location'),
}

const dem = loadDem()

/** Agrupado por cuarto de hora: es la cadencia real de la red. */
const buckets = new Map<string, Sample[]>()
const bucketsRh = new Map<string, Sample[]>()

for (const row of payload.resultset) {
  const ts = row[I.ts] as string | null
  if (!ts) continue
  const locRaw = row[I.loc] as string | null
  if (!locRaw) continue
  let lon: number, lat: number
  try {
    ;[lon, lat] = JSON.parse(locRaw).coordinates
  } catch {
    continue
  }
  if (!inIslandBbox(lon, lat)) continue
  const elevation = elevationAt(dem, lon, lat)
  if (elevation === null) continue
  // Al cuarto de hora en punto.
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  const q = new Date(Math.floor(d.getTime() / 900_000) * 900_000).toISOString().slice(11, 16)

  const push = (map: Map<string, Sample[]>, value: unknown, bounds: [number, number]) => {
    const v = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(v) || v < bounds[0] || v > bounds[1]) return
    const arr = map.get(q) ?? []
    arr.push({
      entityId: String(row[I.eid]),
      name: String(row[I.name]),
      lon,
      lat,
      elevation,
      value: v,
      observedAt: d.getTime(),
      source: 'cabildo',
    })
    map.set(q, arr)
  }
  push(buckets, row[I.t], BOUNDS.temperature as [number, number])
  push(bucketsRh, row[I.rh], BOUNDS.relativehumidity as [number, number])
}

function report(label: string, map: Map<string, Sample[]>) {
  const r2s: { q: string; r2: number; b: number; n: number }[] = []
  for (const [q, all] of [...map].sort()) {
    // Una estación por entityId y cuarto de hora, la última.
    const one = new Map(all.map((s) => [s.entityId, s]))
    const samples = [...one.values()]
    if (samples.length < 8) continue
    const fit = ols(samples)
    r2s.push({ q, r2: fit.r2, b: fit.b * 1000, n: samples.length })
  }
  if (!r2s.length) {
    console.log(`${label}: sin bastantes muestras`)
    return
  }
  const sorted = [...r2s].sort((a, b) => a.r2 - b.r2)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  console.log(`\n── ${label} · ${r2s.length} cuartos de hora del ${day} ──`)
  console.log(
    `  R²  min ${sorted[0].r2.toFixed(3)} · p10 ${pct(0.1).r2.toFixed(3)} · ` +
      `mediana ${pct(0.5).r2.toFixed(3)} · p90 ${pct(0.9).r2.toFixed(3)} · ` +
      `max ${sorted[sorted.length - 1].r2.toFixed(3)}`,
  )
  for (const umbral of [0.1, 0.2, 0.3, 0.5]) {
    const n = r2s.filter((x) => x.r2 < umbral).length
    console.log(
      `  R² < ${umbral.toFixed(2)}: ${n} de ${r2s.length} (${((100 * n) / r2s.length).toFixed(0)} %)`,
    )
  }
  console.log('  los cinco peores:')
  for (const x of sorted.slice(0, 5)) {
    console.log(
      `   · ${x.q} UTC  R²=${x.r2.toFixed(3)}  gradiente ${x.b.toFixed(2)} u/km  ${x.n} estaciones`,
    )
  }
  console.log('  los tres mejores:')
  for (const x of sorted.slice(-3).reverse()) {
    console.log(
      `   · ${x.q} UTC  R²=${x.r2.toFixed(3)}  gradiente ${x.b.toFixed(2)} u/km  ${x.n} estaciones`,
    )
  }
}

report('temperatura · toda la red', buckets)
report('humedad relativa · toda la red', bucketsRh)

// ¿La recta se rompe por la red entera o por una familia concreta? Las tres
// conviven: CABLPA es la red histórica del Cabildo, MTD y WSAQPM entraron
// después. Si una sola familia se lleva el R² por delante, el problema no es
// que la altitud haya dejado de mandar en La Palma.
const familia = (n: string) =>
  n.startsWith('CABLPA') ? 'CABLPA' : n.startsWith('MTD') ? 'MTD' : n.startsWith('LaPalma_WSAQPM') ? 'WSAQPM' : 'otras'
for (const f of ['CABLPA', 'MTD', 'WSAQPM', 'otras']) {
  const sub = new Map([...buckets].map(([q, arr]) => [q, arr.filter((s) => familia(s.name) === f)]))
  report(`temperatura · solo ${f}`, sub)
}
const sinMtd = new Map([...buckets].map(([q, arr]) => [q, arr.filter((s) => familia(s.name) !== 'MTD')]))
report('temperatura · todo MENOS MTD', sinMtd)
