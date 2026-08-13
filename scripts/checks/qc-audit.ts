/**
 * Auditoría del control de calidad, contra la red EN VIVO.
 *
 * Responde una sola pregunta: ¿a quién está tirando el rechazo de outliers
 * ahora mismo, y tenía razón? Carga el DEM de `public/` igual que el
 * navegador, monta las estaciones con el mismo `parseStations`, y llama al
 * MISMO `buildModel` que pinta la malla. Nada está reimplementado aquí: si
 * esto y la app discrepasen, sería este fichero el que miente.
 *
 *   npx tsx scripts/checks/qc-audit.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { blitTerrarium, emptyDem, elevationAt, type DemManifest } from '../../src/lib/dem'
import { decode, isCdaPayload } from '../../src/lib/cabildo'
import { buildStations } from '../../src/lib/quality'
import {
  buildModel,
  estimate,
  fitWithRejection,
  ols,
  toSamples,
  MIN_R2_FOR_REJECTION,
  OUTLIER_SIGMA,
  MAX_REJECTION_PASSES,
  bySiteOffset,
} from '../../src/lib/interpolate'
import { diagnoseNetwork, siteOffsets, WINDOW_H, type Track } from '../../src/lib/sensor-health'

const ROOT = join(import.meta.dirname, '../..')
const CDA =
  'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery' +
  '?path=/public/sc_lapalma/verticals/sql/environment.cda' +
  '&_TRUST_USER_=opendata_sc_lapalma&dataAccessId=weatherobserved_lastdata&outputType=json'

function loadDem() {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'public/dem/manifest.json'), 'utf8'),
  ) as DemManifest
  const dem = emptyDem(manifest)
  for (let r = 0; r < manifest.rows; r++) {
    for (let c = 0; c < manifest.cols; c++) {
      const tx = manifest.x0 + c
      const ty = manifest.y0 + r
      const png = PNG.sync.read(
        readFileSync(join(ROOT, `public/dem/${manifest.zoom}/${tx}/${ty}.png`)),
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

const res = await fetch(CDA)
const json: unknown = await res.json()
if (!isCdaPayload(json)) throw new Error('CDA devolvió algo que no es un payload')

const dem = loadDem()
const { stations, census } = buildStations(decode(json), (lon, lat) =>
  elevationAt(dem, lon, lat),
)
const sound = stations.filter((s) => s.temperature !== null)

console.log(
  `red: ${census.total} dadas de alta · ${census.usable} utilizables · ` +
    `${census.droppedStale} rancias · ${census.droppedImplausible} implausibles · ` +
    `${census.droppedOffIsland} fuera de la isla · ${census.droppedNoMetric} sin métrica`,
)
console.log(`con temperatura: ${sound.length}\n`)

// El archivo de 48 h, para saber qué hace SIEMPRE cada estación.
const now = Date.now()
const from = now - WINDOW_H * 3_600_000
const days: string[] = []
for (let t = from; t <= now + 86_400_000; t += 86_400_000) {
  days.push(new Date(t).toISOString().slice(0, 10))
}
const tracks = new Map<string, { entityId: string; name: string; elevation: number; samples: [number, number][] }>()
for (const day of [...new Set(days)]) {
  const nxt = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const u =
    'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery' +
    '?path=/public/sc_lapalma/verticals/sql/environment.cda' +
    '&_TRUST_USER_=opendata_sc_lapalma&dataAccessId=weatherobserved&outputType=json' +
    `&paramstart=${day}&paramfinish=${nxt}`
  const pl = (await (await fetch(u)).json()) as { metadata: { colName: string }[]; resultset: unknown[][] }
  if (!pl.metadata) continue
  const ix = (n: string) => pl.metadata.findIndex((m) => m.colName === n)
  const [iT, iTs, iE, iN, iL] = [ix('temperature'), ix('timeinstant'), ix('entityid'), ix('name'), ix('location')]
  for (const row of pl.resultset) {
    const v = Number(row[iT])
    const ts = row[iTs] as string | null
    if (!Number.isFinite(v) || !ts) continue
    let lon: number, lat: number
    try { ;[lon, lat] = JSON.parse(String(row[iL])).coordinates } catch { continue }
    const elevation = elevationAt(dem, lon, lat)
    if (elevation === null) continue
    const id = String(row[iE])
    let tr = tracks.get(id)
    if (!tr) tracks.set(id, (tr = { entityId: id, name: String(row[iN]), elevation, samples: [] }))
    const at = new Date(ts.replace(' ', 'T') + 'Z').getTime()
    if (at >= from) tr.samples.push([at, v])
  }
}
const trackList: Track[] = [...tracks.values()].map((t) => ({
  ...t,
  samples: t.samples.sort((a, b) => a[0] - b[0]),
}))
const offsets = siteOffsets(trackList)
// EXACTAMENTE lo que come el motor en la app: `soundStations`, o sea las que
// sobreviven al diagnóstico de la serie. Sin este filtro la auditoría mira
// otra red que la que se pinta.
const diagnoses = diagnoseNetwork(trackList)
const faulty = new Set([...diagnoses.values()].filter((d) => d.faulty).map((d) => d.entityId))
const engineInput = sound.filter((s) => !faulty.has(s.entityId))
console.log(
  `archivo: ${trackList.length} estaciones con serie · ${offsets.size} con desvío medido · ` +
    `${faulty.size} averiadas → el motor recibe ${engineInput.length}\n`,
)

// El experimento: rechazo con el guardarraíl y los indultos puestos, contra el
// rechazo tal y como estaba antes de este cambio.
for (const variable of ['temperature', 'relativehumidity'] as const) {
  const samples = toSamples(engineInput, variable)
  const antes = (() => {
    // Reproduce el comportamiento viejo: sin umbral de R² y sin testigos.
    let kept = samples.slice()
    const rejected: typeof samples & { sigmas: number }[] = [] as never
    const out: { name: string; sigmas: number }[] = []
    let fit = ols(kept)
    for (let pass = 0; pass < MAX_REJECTION_PASSES; pass++) {
      if (kept.length <= 4) break
      const res = kept.map((s) => s.value - (fit.a + fit.b * s.elevation))
      const med = [...res].sort((a, b) => a - b)[res.length >> 1]
      const scale = 1.4826 * [...res.map((r) => Math.abs(r - med))].sort((a, b) => a - b)[res.length >> 1]
      if (!(scale > 1e-9)) break
      const next = kept.filter((s, i) => {
        const z = Math.abs(res[i]) / scale
        if (z > OUTLIER_SIGMA) { out.push({ name: s.name, sigmas: z }); return false }
        return true
      })
      if (next.length === kept.length || next.length < 4) break
      kept = next
      fit = ols(kept)
    }
    void rejected
    return out
  })()
  const ahora = fitWithRejection(samples, OUTLIER_SIGMA, MAX_REJECTION_PASSES, bySiteOffset(offsets, variable))
  const r2 = ols(samples).r2
  console.log(`── ${variable} · R²=${r2.toFixed(3)} (umbral ${MIN_R2_FOR_REJECTION}) ──`)
  console.log(`  antes: ${antes.length} rechazadas${antes.length ? ' → ' + antes.map((x) => `${x.name} (${x.sigmas.toFixed(1)}σ)`).join(', ') : ''}`)
  console.log(`  ahora: ${ahora.rejected.length} rechazadas${ahora.rejected.length ? ' → ' + ahora.rejected.map((x) => `${x.name} (${x.sigmas.toFixed(1)}σ)`).join(', ') : ''}`)
  console.log()
}

for (const variable of ['temperature', 'relativehumidity'] as const) {
  const model = buildModel(sound, variable)
  const crudo = ols(toSamples(sound, variable))
  console.log(`── ${variable} ──`)
  console.log(
    `  ajuste: ${(model.b * 1000).toFixed(2)} u/km · R²=${model.r2.toFixed(3)} · ` +
      `σ=${model.sigma.toFixed(2)} · ${model.used.length} dentro, ${model.rejected.length} fuera ` +
      `· ${model.passes} pasadas`,
  )
  console.log(
    `  sin rechazar: ${(crudo.b * 1000).toFixed(2)} u/km · R²=${crudo.r2.toFixed(3)} · σ=${crudo.sigma.toFixed(2)}`,
  )

  if (!model.rejected.length) {
    console.log('  no rechaza a nadie\n')
    continue
  }

  console.log('  RECHAZADAS:')
  for (const r of model.rejected.sort((a, b) => b.sigmas - a.sigmas)) {
    // Qué habría dicho el modelo en su punto, sin ella: la cifra que decide si
    // la estación se equivocaba o si era el ajuste el que no la alcanzaba.
    const sinElla = buildModel(
      sound.filter((s) => s.entityId !== r.entityId),
      variable,
    )
    const est = estimate(sinElla, r.lon, r.lat, r.elevation)
    const st = sound.find((s) => s.entityId === r.entityId)!
    console.log(
      `   · ${r.name.slice(0, 28).padEnd(29)} ${r.elevation.toFixed(0).padStart(5)} m  ` +
        `mide ${r.value.toFixed(1).padStart(6)}  el modelo diría ${est ? est.value.toFixed(1).padStart(6) : '  —'}  ` +
        `${r.sigmas.toFixed(1)}σ  (T=${st.temperature ?? '—'} RH=${st.relativehumidity ?? '—'} ` +
        `viento=${st.windspeed ?? '—'} hace ${(st.ageHours * 60).toFixed(0)}min)`,
    )
  }
  console.log()
}

// ---------------------------------------------------------------------------
// ¿La isla está partida en dos masas de aire? Esa es la hipótesis que hay que
// descartar antes de acusar a ningún sensor: un ajuste altitudinal único no
// puede describir dos regímenes a la vez, y entonces el rechazo se lleva a las
// estaciones que están en lo cierto.
// ---------------------------------------------------------------------------

// ¿De quién es el R²? La red que ve la app AHORA, partida por familias. Es la
// comprobación que decide si «la altitud ha dejado de mandar en La Palma» o si
// lo que pasa es que se están mezclando redes que no se pueden mezclar.
const familia = (n: string) =>
  n.startsWith('CABLPA') ? 'CABLPA' : n.startsWith('MTD') ? 'MTD' : n.startsWith('LaPalma_WSAQPM') ? 'WSAQPM' : 'otras'
console.log('── R² del ajuste de temperatura, por familia (sobre _lastdata) ──')
for (const f of ['CABLPA', 'MTD', 'WSAQPM', 'otras', 'TODAS']) {
  const sub = f === 'TODAS' ? sound : sound.filter((s) => familia(s.name) === f)
  if (sub.length < 4) { console.log(`  ${f.padEnd(7)} solo ${sub.length} estaciones`); continue }
  const fit = ols(toSamples(sub, 'temperature'))
  const alturas = sub.map((s) => s.elevation)
  console.log(
    `  ${f.padEnd(7)} ${String(sub.length).padStart(2)} estaciones · R²=${fit.r2.toFixed(3)} · ` +
      `gradiente ${(fit.b * 1000).toFixed(2)} °C/km · σ=${fit.sigma.toFixed(2)} · ` +
      `cotas ${Math.min(...alturas).toFixed(0)}–${Math.max(...alturas).toFixed(0)} m`,
  )
}
console.log()

const conT = sound.filter((s) => s.temperature !== null)
const modelo = buildModel(sound, 'temperature')
const resid = conT.map((s) => ({
  s,
  r: s.temperature! - (modelo.a + modelo.b * s.elevation),
}))
const oeste = resid.filter((x) => x.s.lon < -17.86)
const este = resid.filter((x) => x.s.lon >= -17.86)
const media = (xs: { r: number }[]) => xs.reduce((a, x) => a + x.r, 0) / (xs.length || 1)
console.log('── residuo medio por vertiente (respecto a la recta altitudinal) ──')
console.log(`  oeste (lon < −17,86): ${media(oeste).toFixed(2)} K sobre ${oeste.length} estaciones`)
console.log(`  este  (lon ≥ −17,86): ${media(este).toFixed(2)} K sobre ${este.length} estaciones`)
console.log(`  separación entre vertientes: ${(media(oeste) - media(este)).toFixed(2)} K`)

const rhCon = sound.filter((s) => s.relativehumidity !== null)
const rhO = rhCon.filter((s) => s.lon < -17.86).map((s) => s.relativehumidity!)
const rhE = rhCon.filter((s) => s.lon >= -17.86).map((s) => s.relativehumidity!)
const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)
console.log(`  humedad media: oeste ${m(rhO).toFixed(0)} % · este ${m(rhE).toFixed(0)} %`)
