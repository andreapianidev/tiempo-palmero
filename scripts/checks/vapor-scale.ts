/**
 * Mide el rango real del déficit de presión de vapor sobre la isla.
 *
 * Es lo que fija `VPD_FULL_KPA`, el techo de la escala con la que se dibuja la
 * capa de vapor. Un techo demasiado bajo satura media isla y el mapa deja de
 * distinguir; uno demasiado alto deja toda la bruma en un susurro. La cifra
 * sale de recorrer el DEM entero y estimar el VPD celda a celda con el mismo
 * motor que usa el mapa, no de elegir un número redondo.
 *
 *   npx tsx scripts/checks/vapor-scale.ts
 */

import snapshot from '../../src/lib/__fixtures__/weather-snapshot.json' with { type: 'json' }
import { buildStations } from '../../src/lib/quality.js'
import { parseLocation, type CdaRow } from '../../src/lib/cabildo.js'
import { buildModel, estimateBundle } from '../../src/lib/interpolate.js'
import { elevationAt, SEA_LEVEL_M } from '../../src/lib/dem.js'
import { pixelXToLon, pixelYToLat } from '../../src/lib/geo.js'
import { loadDem } from '../dem-node.js'

const ROWS = snapshot.rows as unknown as CdaRow[]
const NOW = snapshot.capturedAtMs

function elevationFromFixture(lon: number, lat: number): number | null {
  for (const r of ROWS) {
    const loc = parseLocation(r.location)
    if (loc && Math.abs(loc[0] - lon) < 1e-9 && Math.abs(loc[1] - lat) < 1e-9) {
      return (r as unknown as { _demElevation: number | null })._demElevation
    }
  }
  return null
}

const dem = loadDem()
const { stations } = buildStations(ROWS, elevationFromFixture, { now: NOW })
const models = {
  temperature: buildModel(stations, 'temperature'),
  relativehumidity: buildModel(stations, 'relativehumidity'),
}

const values: number[] = []
const byBand = new Map<string, number[]>()
// Un paso de 8 píxeles (~268 m) recorre la isla entera sin tardar un minuto.
const step = 8
for (let j = 0; j < dem.height; j += step) {
  for (let i = 0; i < dem.width; i += step) {
    const lon = pixelXToLon(dem.originX + i, dem.manifest.zoom)
    const lat = pixelYToLat(dem.originY + j, dem.manifest.zoom)
    const elevation = elevationAt(dem, lon, lat)
    if (elevation === null || elevation <= SEA_LEVEL_M) continue
    const vpd = estimateBundle(models, lon, lat, elevation).vpd?.value
    if (vpd === undefined || vpd === null || !Number.isFinite(vpd)) continue
    values.push(vpd)
    const band =
      elevation < 300 ? '   0–300 m' : elevation < 900 ? ' 300–900 m' : elevation < 1500 ? '900–1500 m' : '  >1500 m'
    if (!byBand.has(band)) byBand.set(band, [])
    byBand.get(band)!.push(vpd)
  }
}

values.sort((a, b) => a - b)
const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]

console.log(`instante del fixture: ${snapshot.capturedAt}`)
console.log(`${values.length} celdas de tierra emergida, ${stations.length} estaciones vivas\n`)
console.log('VPD sobre la isla, kPa:')
console.log(
  `  mín ${values[0].toFixed(2)}   p05 ${q(values, 0.05).toFixed(2)}   ` +
    `p50 ${q(values, 0.5).toFixed(2)}   p95 ${q(values, 0.95).toFixed(2)}   ` +
    `máx ${values[values.length - 1].toFixed(2)}`,
)

console.log('\nPor bandas de altitud:')
for (const band of [...byBand.keys()].sort()) {
  const v = byBand.get(band)!.sort((a, b) => a - b)
  console.log(
    `  ${band}  n=${String(v.length).padStart(5)}  ` +
      `mín ${v[0].toFixed(2)}  p50 ${q(v, 0.5).toFixed(2)}  máx ${v[v.length - 1].toFixed(2)}`,
  )
}

console.log('\nQué fracción de la isla satura con cada techo de escala:')
for (const top of [1.0, 1.5, 2.0, 2.5, 3.0]) {
  const saturated = values.filter((v) => v >= top).length
  const dim = values.filter((v) => v / top < 0.15).length
  console.log(
    `  ${top.toFixed(1)} kPa → satura ${((100 * saturated) / values.length).toFixed(1)} %, ` +
      `casi invisible ${((100 * dim) / values.length).toFixed(1)} %`,
  )
}

// ---------------------------------------------------------------------------
// El día entero, con datos MEDIDOS
// ---------------------------------------------------------------------------
//
// Lo de arriba es un solo instante —las 09:00 UTC del 12 de agosto— y el VPD
// tiene un ciclo diario enorme: elegir la escala con una foto de la mañana
// dejaría la tarde saturada de par en par. Esto recorre las 24 h del archivo de
// ese mismo día, estación a estación y muestra a muestra, con temperatura y
// humedad MEDIDAS: sin interpolar nada, que para fijar un techo de escala es lo
// que importa.

const day = (await import('../../src/lib/__fixtures__/history-day.json', {
  with: { type: 'json' },
})) as unknown as {
  default: {
    day: string
    columns: string[]
    stations: { name: string; samples: number[][] }[]
  }
}
const archive = day.default
const iT = archive.columns.indexOf('temperature') + 1
const iRh = archive.columns.indexOf('relativehumidity') + 1

const { vapourPressureDeficit } = await import('../../src/lib/psychro.js')

const measured: number[] = []
const byHour = new Map<number, number[]>()
for (const st of archive.stations) {
  for (const s of st.samples) {
    const t = s[iT]
    const rh = s[iRh]
    if (typeof t !== 'number' || typeof rh !== 'number') continue
    const vpd = vapourPressureDeficit(t, rh)
    if (!Number.isFinite(vpd)) continue
    measured.push(vpd)
    const hour = Math.floor(s[0] / 60)
    if (!byHour.has(hour)) byHour.set(hour, [])
    byHour.get(hour)!.push(vpd)
  }
}
measured.sort((a, b) => a - b)

console.log(`\n\nVPD MEDIDO, día completo ${archive.day}, ${archive.stations.length} estaciones`)
console.log(`${measured.length} lecturas con T y humedad:`)
console.log(
  `  mín ${measured[0].toFixed(2)}   p50 ${q(measured, 0.5).toFixed(2)}   ` +
    `p95 ${q(measured, 0.95).toFixed(2)}   p99 ${q(measured, 0.99).toFixed(2)}   ` +
    `máx ${measured[measured.length - 1].toFixed(2)}  kPa`,
)

console.log('\nMáximo de la red hora a hora (UTC), kPa:')
let line = ''
for (let h = 0; h < 24; h++) {
  const v = byHour.get(h)
  line += `${String(h).padStart(2, '0')}h ${v ? Math.max(...v).toFixed(2) : ' — '}   `
  if (h % 6 === 5) {
    console.log(`  ${line}`)
    line = ''
  }
}

console.log('\nCon cada techo de escala, sobre lo medido en 24 h:')
for (const top of [1.0, 1.5, 2.0, 2.5, 3.0]) {
  const saturated = measured.filter((v) => v >= top).length
  const dim = measured.filter((v) => v / top < 0.15).length
  console.log(
    `  ${top.toFixed(1)} kPa → satura ${((100 * saturated) / measured.length).toFixed(1)} %, ` +
      `casi invisible ${((100 * dim) / measured.length).toFixed(1)} %`,
  )
}
