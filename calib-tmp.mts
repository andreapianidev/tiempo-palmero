/**
 * Calibración de la banda de incertidumbre, contra datos EN VIVO.
 *
 * Dos fuentes de error, ambas medidas:
 *  1. debajo del techo -> error del propio interpolador, por leave-one-out
 *  2. encima del techo -> error de Open-Meteo contra las estaciones
 */
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { buildStations, type Station } from './src/lib/quality'
import { parseLocation, type CdaRow } from './src/lib/cabildo'
import { haversineKm } from './src/lib/geo'
import { toSamples, fitWithRejection, type Sample } from './src/lib/interpolate'
import { fetchAnchors } from './src/lib/openmeteo'
import { elevationAt, type Dem } from './src/lib/dem'

// --- DEM ---
const ROOT = './public/dem'
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8'))
const { zoom, tileSize, x0, y0, cols, rows } = manifest
const W = cols * tileSize, H = rows * tileSize
const heights = new Float32Array(W * H)
for (let ty = 0; ty < rows; ty++)
  for (let tx = 0; tx < cols; tx++) {
    let png: any
    try { png = PNG.sync.read(readFileSync(`${ROOT}/${zoom}/${x0 + tx}/${y0 + ty}.png`)) } catch { continue }
    for (let j = 0; j < tileSize; j++)
      for (let i = 0; i < tileSize; i++) {
        const o = (j * tileSize + i) * 4
        heights[(ty * tileSize + j) * W + (tx * tileSize + i)] =
          png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768
      }
  }
const dem: Dem = { manifest, heights, width: W, height: H, originX: x0 * tileSize, originY: y0 * tileSize }

// --- estaciones EN VIVO ---
const raw = JSON.parse(readFileSync('/tmp/live.json', 'utf8'))
const colNames: string[] = raw.metadata.map((m: any) => m.colName)
const liveRows: CdaRow[] = raw.resultset.map((r: any[]) => {
  const o: any = {}
  colNames.forEach((c, i) => { if (o[c] === undefined) o[c] = r[i] })
  o.dailyprecipitation = r[31]
  return o
})
const { stations } = buildStations(liveRows, (lo, la) => elevationAt(dem, lo, la))
console.log(`estaciones vivas: ${stations.length}`)

// --- forma de la banda, idéntica en calibración y en uso ---
const IDW_CUTOFF_KM = 15
function shape(nearestKm: number, elevation: number, range: [number, number]): number {
  const distFactor = 1 + Math.min(nearestKm / IDW_CUTOFF_KM, 1) * 0.5
  const outside = elevation > range[1] ? elevation - range[1] : elevation < range[0] ? range[0] - elevation : 0
  return distFactor * (1 + outside / 500)
}
function detrendPredict(kept: Sample[], b: number, lon: number, lat: number, z: number) {
  let sw = 0, sv = 0
  const within: { w: number; d: number; v: number }[] = []
  const all: { w: number; d: number; v: number }[] = []
  for (const s of kept) {
    const d = haversineKm([lon, lat], [s.lon, s.lat])
    const dz = (s.elevation - z) / 100
    const eff = Math.max(Math.hypot(d, dz), 0.01)
    const it = { w: 1 / eff ** 2, d, v: s.value - b * s.elevation }
    all.push(it); if (d <= IDW_CUTOFF_KM) within.push(it)
  }
  const list = within.length ? within : all.sort((a, c) => a.d - c.d).slice(0, 3)
  for (const it of list) { sw += it.w; sv += it.w * it.v }
  return { value: sv / sw + b * z, nearestKm: Math.min(...list.map((i) => i.d)) }
}
const quantile = (xs: number[], q: number) => {
  const s = xs.slice().sort((a, b) => a - b)
  if (!s.length) return NaN
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))
  return s[i]
}

console.log('\n=== 1. CALIBRACIÓN POR LEAVE-ONE-OUT ===')
const calib: Record<string, number> = {}
for (const v of ['temperature', 'relativehumidity'] as const) {
  const all = toSamples(stations, v)
  const base = fitWithRejection(all)
  const targets = base.kept
  const ratios: number[] = []
  const rows: { e: number; s: number; sigma: number }[] = []
  for (const t of targets) {
    const rest = all.filter((s) => s.entityId !== t.entityId)
    if (rest.length < 8) continue
    const { fit, kept } = fitWithRejection(rest)
    const el = kept.map((s) => s.elevation)
    const range: [number, number] = [Math.min(...el), Math.max(...el)]
    const p = detrendPredict(kept, fit.b, t.lon, t.lat, t.elevation)
    const sh = shape(p.nearestKm, t.elevation, range)
    ratios.push(Math.abs(p.value - t.value) / sh)
    rows.push({ e: Math.abs(p.value - t.value), s: sh, sigma: fit.sigma })
  }
  const k = quantile(ratios, 0.68)
  calib[v] = k
  const sigmaAhora = base.fit.sigma
  const cobAntes = rows.filter((r) => r.e <= Math.max(sigmaAhora, 0.15) * r.s).length / rows.length
  const cobDespues = rows.filter((r) => r.e <= k * r.s).length / rows.length
  console.log(`  ${v}:`)
  console.log(`     base ACTUAL  = σ del ajuste  = ${sigmaAhora.toFixed(2)}  -> cobertura ${(100 * cobAntes).toFixed(0)} %`)
  console.log(`     base NUEVA   = cuantil 0,68  = ${k.toFixed(2)}  -> cobertura ${(100 * cobDespues).toFixed(0)} %`)
}

console.log('\n=== 2. ERROR DE OPEN-METEO CONTRA LAS ESTACIONES ===')
const pts = stations.map((s) => ({ lon: s.lon, lat: s.lat, elevation: s.elevation }))
const modelAt = await fetchAnchors(pts)
console.log(`  consultados ${pts.length} puntos, respondidos ${modelAt.length}`)
for (const v of ['temperature', 'relativehumidity'] as const) {
  const diffs: number[] = []
  modelAt.forEach((m, i) => {
    const s = stations[i]
    const obs = s[v]
    const mod = v === 'temperature' ? m.temperature : m.relativehumidity
    if (obs === null || mod === null) return
    diffs.push(mod - obs)
  })
  const abs = diffs.map(Math.abs)
  const bias = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const rmse = Math.sqrt(diffs.reduce((a, b) => a + b * b, 0) / diffs.length)
  console.log(`  ${v}: n=${diffs.length}  sesgo=${bias.toFixed(2)}  RMSE=${rmse.toFixed(2)}  ` +
    `|err| mediano=${quantile(abs, 0.5).toFixed(2)}  cuantil0,68=${quantile(abs, 0.68).toFixed(2)}  máx=${Math.max(...abs).toFixed(1)}`)
}

console.log('\n=== 2b. ¿EL ERROR DEL MODELO DEPENDE DE LA ALTITUD? ===')
for (const v of ['temperature', 'relativehumidity'] as const) {
  console.log(`  ${v}:`)
  for (const [lbl, lo, hi] of [['0-500 m', 0, 500], ['500-1000 m', 500, 1000], ['>1000 m', 1000, 9999]] as [string,number,number][]) {
    const d: number[] = []
    modelAt.forEach((m, i) => {
      const s = stations[i]
      if (s.elevation < lo || s.elevation >= hi) return
      const obs = s[v]; const mod = v === 'temperature' ? m.temperature : m.relativehumidity
      if (obs !== null && mod !== null) d.push(mod - obs)
    })
    if (!d.length) { console.log(`     ${lbl}: sin datos`); continue }
    const bias = d.reduce((a,b)=>a+b,0)/d.length
    const rmse = Math.sqrt(d.reduce((a,b)=>a+b*b,0)/d.length)
    console.log(`     ${lbl.padEnd(11)} n=${String(d.length).padStart(2)}  sesgo=${bias.toFixed(1).padStart(6)}  RMSE=${rmse.toFixed(1).padStart(5)}  |q0,68|=${quantile(d.map(Math.abs),0.68).toFixed(1)}`)
  }
}

console.log('\n=== 3. LO QUE DIRÍA LA BANDA EN CADA RÉGIMEN ===')
for (const v of ['temperature', 'relativehumidity'] as const) {
  const all = toSamples(stations, v)
  const { fit, kept } = fitWithRejection(all)
  const el = kept.map((s) => s.elevation)
  const range: [number, number] = [Math.min(...el), Math.max(...el)]
  const diffs: number[] = []
  modelAt.forEach((m, i) => {
    const obs = stations[i][v]; const mod = v === 'temperature' ? m.temperature : m.relativehumidity
    if (obs !== null && mod !== null) diffs.push(Math.abs(mod - obs))
  })
  const modelBand = quantile(diffs, 0.68)
  const u = (z: number, near: number, anchorShare: number) =>
    (1 - anchorShare) * calib[v] * shape(near, z, range) + anchorShare * modelBand
  console.log(`  ${v} (techo ${Math.round(range[1])} m, banda de modelo ±${modelBand.toFixed(1)}):`)
  console.log(`     junto a una estación (0,5 km, 400 m)  ±${u(400, 0.5, 0).toFixed(2)}`)
  console.log(`     lejos, en rango      (8 km,  900 m)   ±${u(900, 8, 0).toFixed(2)}`)
  console.log(`     cumbre, 90 % modelo  (5 km, 2400 m)   ±${u(2400, 5, 0.9).toFixed(2)}`)
}
