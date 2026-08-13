/**
 * ¿A quién habría echado el control de calidad, hora a hora, en 48 h?
 *
 * `qc-audit.ts` mira el instante presente y por eso puede no ver nada: el
 * rechazo va y viene con el ajuste, que se rehace cada cinco minutos. Este
 * script rehace la decisión en CADA hora del archivo, con la regla vieja y con
 * la nueva, y cuenta la diferencia. Es la única forma de afirmar si el arreglo
 * cambia algo o si solo lo parece.
 *
 *   npx tsx scripts/checks/qc-replay.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { blitTerrarium, emptyDem, elevationAt, type DemManifest } from '../../src/lib/dem'
import { BOUNDS } from '../../src/lib/quality'
import { inIslandBbox } from '../../src/lib/geo'
import {
  bySiteOffset,
  fitWithRejection,
  ols,
  robustSigma,
  MAX_REJECTION_PASSES,
  MIN_R2_FOR_REJECTION,
  OUTLIER_SIGMA,
  type Sample,
} from '../../src/lib/interpolate'
import { diagnoseNetwork, siteOffsets, type Track } from '../../src/lib/sensor-health'

const ROOT = join(import.meta.dirname, '../..')
const HOUR = 3_600_000

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

/** El rechazo tal y como estaba antes de este cambio: sin umbral y sin testigos. */
function rejectionBefore(samples: readonly Sample[]) {
  let kept = samples.slice()
  const out: { name: string; entityId: string; sigmas: number }[] = []
  let fit = ols(kept)
  for (let pass = 0; pass < MAX_REJECTION_PASSES; pass++) {
    if (kept.length <= 4) break
    const res = kept.map((s) => s.value - (fit.a + fit.b * s.elevation))
    const scale = robustSigma(res)
    if (scale <= 1e-9) break
    const next = kept.filter((s, i) => {
      const z = Math.abs(res[i]) / scale
      if (z > OUTLIER_SIGMA) {
        out.push({ name: s.name, entityId: s.entityId, sigmas: z })
        return false
      }
      return true
    })
    if (next.length === kept.length || next.length < 4) break
    kept = next
    fit = ols(kept)
  }
  return out
}

const now = Date.now()
const from = now - 48 * HOUR
const dem = loadDem()

const days = new Set<string>()
for (let t = from; t <= now; t += 86_400_000) days.add(new Date(t).toISOString().slice(0, 10))
days.add(new Date(now).toISOString().slice(0, 10))

interface Obs {
  at: number
  entityId: string
  name: string
  lon: number
  lat: number
  elevation: number
  t: number | null
  rh: number | null
}
const obs: Obs[] = []

for (const day of [...days].sort()) {
  const nxt = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const url =
    'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery' +
    '?path=/public/sc_lapalma/verticals/sql/environment.cda' +
    '&_TRUST_USER_=opendata_sc_lapalma&dataAccessId=weatherobserved&outputType=json' +
    `&paramstart=${day}&paramfinish=${nxt}`
  const pl = (await (await fetch(url)).json()) as {
    metadata?: { colName: string }[]
    resultset?: unknown[][]
  }
  if (!pl.metadata || !pl.resultset) continue
  const ix = (n: string) => pl.metadata!.findIndex((m) => m.colName === n)
  const [iT, iRh, iTs, iE, iN, iL] = [
    ix('temperature'),
    ix('relativehumidity'),
    ix('timeinstant'),
    ix('entityid'),
    ix('name'),
    ix('location'),
  ]
  for (const row of pl.resultset) {
    const ts = row[iTs] as string | null
    if (!ts) continue
    let lon: number, lat: number
    try {
      ;[lon, lat] = JSON.parse(String(row[iL])).coordinates
    } catch {
      continue
    }
    if (!inIslandBbox(lon, lat)) continue
    const elevation = elevationAt(dem, lon, lat)
    if (elevation === null) continue
    const at = new Date(ts.replace(' ', 'T') + 'Z').getTime()
    if (at < from) continue
    const bounded = (v: unknown, b: [number, number]) => {
      const x = Number(v)
      return Number.isFinite(x) && x >= b[0] && x <= b[1] ? x : null
    }
    obs.push({
      at,
      entityId: String(row[iE]),
      name: String(row[iN]).replace(/_/g, ' '),
      lon,
      lat,
      elevation,
      t: bounded(row[iT], BOUNDS.temperature as [number, number]),
      rh: bounded(row[iRh], BOUNDS.relativehumidity as [number, number]),
    })
  }
}

console.log(`archivo: ${obs.length} lecturas de ${new Set(obs.map((o) => o.entityId)).size} estaciones\n`)

// Series por estación, para el diagnóstico y los desvíos habituales.
const byStation = new Map<string, Track & { samples: [number, number][] }>()
for (const o of obs) {
  if (o.t === null) continue
  let tr = byStation.get(o.entityId)
  if (!tr) {
    byStation.set(
      o.entityId,
      (tr = { entityId: o.entityId, name: o.name, elevation: o.elevation, samples: [] }),
    )
  }
  tr.samples.push([o.at, o.t])
}
const tracks: Track[] = [...byStation.values()].map((t) => ({
  ...t,
  samples: t.samples.sort((a, b) => a[0] - b[0]),
}))
const faulty = new Set(
  [...diagnoseNetwork(tracks).values()].filter((d) => d.faulty).map((d) => d.entityId),
)
const offsets = siteOffsets(tracks)
console.log(
  `diagnóstico: ${faulty.size} estaciones averiadas de ${tracks.length} · ` +
    `${offsets.size} con desvío habitual medido\n`,
)

for (const variable of ['temperature', 'relativehumidity'] as const) {
  const hours = new Map<number, Map<string, Obs>>()
  for (const o of obs) {
    if ((variable === 'temperature' ? o.t : o.rh) === null) continue
    if (faulty.has(o.entityId)) continue // el motor no las ve
    const h = Math.floor(o.at / HOUR)
    let b = hours.get(h)
    if (!b) hours.set(h, (b = new Map()))
    b.set(o.entityId, o) // la última de la hora
  }

  let horas = 0
  let antesTotal = 0
  let ahoraTotal = 0
  let horasConRechazoAntes = 0
  let horasBajoUmbral = 0
  const salvadas = new Map<string, number>()

  for (const [, bucket] of [...hours].sort((a, b) => a[0] - b[0])) {
    const samples: Sample[] = [...bucket.values()].map((o) => ({
      entityId: o.entityId,
      name: o.name,
      lon: o.lon,
      lat: o.lat,
      elevation: o.elevation,
      value: (variable === 'temperature' ? o.t : o.rh) as number,
      observedAt: o.at,
      source: 'cabildo',
    }))
    if (samples.length < 8) continue
    horas++
    if (ols(samples).r2 < MIN_R2_FOR_REJECTION) horasBajoUmbral++

    const antes = rejectionBefore(samples)
    const ahora = fitWithRejection(
      samples,
      OUTLIER_SIGMA,
      MAX_REJECTION_PASSES,
      bySiteOffset(offsets, variable),
    ).rejected
    antesTotal += antes.length
    ahoraTotal += ahora.length
    if (antes.length) horasConRechazoAntes++
    const sigueFuera = new Set(ahora.map((r) => r.entityId))
    for (const a of antes) {
      if (!sigueFuera.has(a.entityId)) {
        salvadas.set(a.name, (salvadas.get(a.name) ?? 0) + 1)
      }
    }
  }

  console.log(`── ${variable} · ${horas} horas reconstruidas ──`)
  console.log(
    `  el ajuste no llegaba al umbral en ${horasBajoUmbral} de ${horas} horas ` +
      `(${((100 * horasBajoUmbral) / horas).toFixed(0)} %)`,
  )
  console.log(`  exclusiones ANTES: ${antesTotal}, repartidas en ${horasConRechazoAntes} horas`)
  console.log(`  exclusiones AHORA: ${ahoraTotal}`)
  if (salvadas.size) {
    console.log('  estaciones que dejan de ser acusadas, y cuántas horas se libran:')
    for (const [name, n] of [...salvadas].sort((a, b) => b[1] - a[1])) {
      console.log(`   · ${name.slice(0, 34).padEnd(35)} ${n} h`)
    }
  }
  console.log()
}
