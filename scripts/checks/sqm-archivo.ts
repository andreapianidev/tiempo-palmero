/**
 * El archivo de los fotómetros, medido entero — y el fixture que sale de él.
 *
 * POR QUÉ EXISTE. `sqm/network.ts` lleva en su cabecera una tabla con la que se
 * justifica el criterio de descarte: cuántas lecturas hay a cada lado del sol
 * a −6°, cuál es la más brillante de las buenas y cuál el artefacto más oscuro.
 * Esa tabla estaba medida sobre dos días y no había forma de volver a medirla:
 * el archivo no estaba en el repositorio y el script tampoco. Un umbral que no
 * se puede volver a medir es un umbral elegido con pasos extra.
 *
 * QUÉ HACE, en este orden:
 *
 *  1. Descarga el archivo de `skyobservation` día a día, con reintentos, y lo
 *     cachea en `.tmp/sky-archive/`. El origen se cae solo cada pocas
 *     peticiones: devuelve 200 con un HTML «Unavailable» dentro, o se queda
 *     colgado. Lo ya descargado no se vuelve a pedir.
 *  2. Imprime el censo completo: filas por banda de altura solar, los tres
 *     tipos de artefacto, y las dos orillas del hueco.
 *  3. Escribe `src/lib/__fixtures__/sqm-archivo.json`, que NO es una muestra al
 *     azar: son los casos que deciden. De cada estación se guardan las lecturas
 *     extremas de cada lado del corte, todos los artefactos hasta un tope, y un
 *     muestreo regular del resto. Una muestra aleatoria habría podido perder
 *     justo el artefacto más oscuro, que es la mitad de la prueba.
 *  4. Mide HASTA DÓNDE HABLA UN FOTÓMETRO —parejas de lecturas simultáneas de
 *     noche cerrada y sin luna, contra la distancia entre las dos estaciones— y
 *     escribe el resumen en `sqm-alcance.json`. Es lo que defiende
 *     `MAX_STATION_DISTANCE_KM`, y lo que no se había medido nunca.
 *
 * NO SE COMMITEA EL ARCHIVO ENTERO. Son 46 MB para una lunación, y lo que las
 * pruebas necesitan no es el volumen sino la separación. El volumen se vuelve a
 * bajar con este script cuando haga falta.
 *
 * Uso: `npx tsx scripts/checks/sqm-archivo.ts [días]` (por omisión, 30).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { decode, type CdaPayload, type CdaRow } from '../../src/lib/cabildo'
import { sunPosition } from '../../src/lib/sun'
import { moonSight } from '../../src/lib/moon'
import { distanceKm } from '../../src/lib/sqm/pick'

const CACHE = '.tmp/sky-archive'
const FIXTURE = 'src/lib/__fixtures__/sqm-archivo.json'
const REACH = 'src/lib/__fixtures__/sqm-alcance.json'
const PENTAHO = 'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery'

/** Fin de la ventana: hoy. El script se llama con los días hacia atrás. */
const END = process.env.SQM_END ?? new Date().toISOString().slice(0, 10)
const DAYS = Number(process.argv[2] ?? 30)

const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

async function fetchDay(day: string): Promise<CdaRow[]> {
  const file = path.join(CACHE, `${day}.json`)
  if (existsSync(file)) {
    const raw = readFileSync(file, 'utf8')
    if (raw.startsWith('{')) return decode(JSON.parse(raw) as CdaPayload)
  }
  const next = iso(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
  const url = new URL(PENTAHO)
  url.search = new URLSearchParams({
    path: '/public/sc_lapalma/verticals/sql/skyobservation.cda',
    _TRUST_USER_: 'opendata_sc_lapalma',
    dataAccessId: 'skyobservation',
    outputType: 'json',
    paramstart: day,
    paramfinish: next,
  }).toString()

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      const text = await res.text()
      if (!text.startsWith('{')) throw new Error('el origen devolvió HTML')
      const payload = JSON.parse(text) as CdaPayload
      if (!Array.isArray(payload.resultset)) throw new Error('sin resultset')
      mkdirSync(CACHE, { recursive: true })
      writeFileSync(file, text)
      return decode(payload)
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      process.stderr.write(`  ${day} intento ${attempt + 1}: ${why}\n`)
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
    }
  }
  throw new Error(`${day}: no se pudo descargar tras cinco intentos`)
}

// ---------------------------------------------------------------------------

interface Reading {
  station: string
  site: string
  lon: number
  lat: number
  at: string
  sqm: number | null
  sigma: number | null
  skyTemp: number | null
  clouds: string | null
  sunElevationDeg: number
}

function toReading(row: CdaRow): Reading | null {
  const loc = row.location
  let lon = NaN
  let lat = NaN
  try {
    const g = JSON.parse(String(loc)) as { coordinates?: number[] }
    if (g.coordinates && g.coordinates.length >= 2) {
      lon = Number(g.coordinates[0])
      lat = Number(g.coordinates[1])
    }
  } catch {
    return null
  }
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  const at = String(row.timeinstant ?? '')
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const epoch = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
  const raw = row.skymagnitude
  const sqm = raw === null || raw === undefined || raw === '' ? null : Number(raw)
  return {
    station: String(row.entityid ?? ''),
    site: String(row.name ?? ''),
    lon,
    lat,
    at,
    sqm: Number.isFinite(sqm as number) ? (sqm as number) : null,
    sigma: row.sigmamagnitude === null ? null : Number(row.sigmamagnitude),
    skyTemp: row.skytemperature === null ? null : Number(row.skytemperature),
    clouds: row.clouds === null ? null : String(row.clouds),
    sunElevationDeg: sunPosition(epoch, lon, lat).elevationDeg,
  }
}

const main = async () => {
  const end = Date.parse(`${END}T00:00:00Z`)
  const days: string[] = []
  for (let i = DAYS; i >= 1; i--) days.push(iso(end - i * 86_400_000))

  process.stderr.write(`Archivo de fotómetros, ${days[0]} → ${days[days.length - 1]}\n`)
  const all: Reading[] = []
  for (const day of days) {
    const rows = await fetchDay(day)
    let kept = 0
    for (const row of rows) {
      const r = toReading(row)
      if (r) {
        all.push(r)
        kept++
      }
    }
    process.stderr.write(`  ${day}  ${rows.length} filas, ${kept} legibles\n`)
  }

  // ------------------------------------------------------------------ censo
  const stations = new Set(all.map((r) => r.station))
  const band = (r: Reading) =>
    r.sunElevationDeg > -6 ? 'sol arriba' : r.sunElevationDeg > -12 ? 'crepúsculo' : 'noche'

  const census = new Map<
    string,
    { n: number; min: number; zeros: number; floor: number; sentinel: number; nulls: number }
  >()
  for (const r of all) {
    const b = band(r)
    const c =
      census.get(b) ?? { n: 0, min: Infinity, zeros: 0, floor: 0, sentinel: 0, nulls: 0 }
    c.n++
    if (r.sqm === null) c.nulls++
    else {
      if (r.sqm === -1000) c.sentinel++
      else if (r.sqm === 0) c.zeros++
      else if (r.sqm >= 9 && r.sqm < 10) c.floor++
      if (r.sqm > -1000) c.min = Math.min(c.min, r.sqm)
    }
    census.set(b, c)
  }

  console.log(`\n# Archivo de ${days[0]} a ${days[days.length - 1]}`)
  console.log(`Lecturas legibles: ${all.length}   estaciones: ${stations.size}\n`)
  console.log('| Sol | Lecturas | Mínimo | Ceros | Suelo 9-10 | Centinelas | Sin valor |')
  console.log('|---|---:|---:|---:|---:|---:|---:|')
  for (const b of ['sol arriba', 'crepúsculo', 'noche']) {
    const c = census.get(b)
    if (!c) continue
    console.log(
      `| ${b} | ${c.n} | ${c.min === Infinity ? '—' : c.min.toFixed(2)} | ${c.zeros} | ${c.floor} | ${c.sentinel} | ${c.nulls} |`,
    )
  }

  const bad = all.filter(
    (r) => r.sqm !== null && (r.sqm === -1000 || r.sqm === 0 || (r.sqm >= 9 && r.sqm < 10)),
  )
  const badUp = bad.filter((r) => r.sunElevationDeg > -6)
  const good = all.filter(
    (r) => r.sqm !== null && r.sqm > 10 && r.sunElevationDeg <= -6,
  )
  const brightestGood = good.reduce((m, r) => Math.min(m, r.sqm as number), Infinity)
  const darkestArtefact = bad
    .filter((r) => (r.sqm as number) > 0)
    .reduce((m, r) => Math.max(m, r.sqm as number), -Infinity)

  console.log(`\nArtefactos: ${bad.length}, de los cuales con el sol por encima de −6°: ${badUp.length}`)
  console.log(`  → el criterio se lleva ${((100 * badUp.length) / Math.max(1, bad.length)).toFixed(2)} % de los artefactos`)
  console.log(`Lecturas buenas con el sol bajo −6°: ${good.length}`)
  console.log(`  → la más brillante: ${brightestGood.toFixed(2)}`)
  console.log(`  → el artefacto más oscuro: ${darkestArtefact.toFixed(2)}`)
  console.log(`  → hueco entre las dos orillas: ${(brightestGood - darkestArtefact).toFixed(2)} mag`)

  // Cuántas lecturas buenas caerían con el umbral de valor de 11.
  const goodBelow11 = good.filter((r) => (r.sqm as number) < 11).length
  console.log(`Buenas por debajo de 11,0 (las que el segundo cinturón tiraría): ${goodBelow11}`)

  // --------------------------------------------------------------- fixture
  // De cada estación: las cinco lecturas más brillantes y las cinco más
  // oscuras de cada banda de sol, hasta diez artefactos de cada tipo, y un
  // muestreo regular. Se guardan los extremos a propósito: una muestra
  // aleatoria puede perder el artefacto más oscuro, que es media prueba.
  const picked = new Map<string, Reading>()
  const key = (r: Reading) => `${r.station}|${r.at}`
  const take = (rows: Reading[]) => rows.forEach((r) => picked.set(key(r), r))

  for (const id of stations) {
    const mine = all.filter((r) => r.station === id)
    for (const b of ['sol arriba', 'crepúsculo', 'noche']) {
      const rows = mine
        .filter((r) => band(r) === b && r.sqm !== null)
        .sort((a, z) => (a.sqm as number) - (z.sqm as number))
      take(rows.slice(0, 5))
      take(rows.slice(-5))
      // Muestreo regular por hora del día, para que el fixture tenga forma de
      // día y no solo de extremos.
      for (let i = 0; i < rows.length; i += Math.max(1, Math.floor(rows.length / 8))) {
        picked.set(key(rows[i]), rows[i])
      }
    }
    for (const kind of [
      (r: Reading) => r.sqm === -1000,
      (r: Reading) => r.sqm === 0,
      (r: Reading) => r.sqm !== null && r.sqm >= 9 && r.sqm < 10,
      (r: Reading) => r.sqm === null,
    ]) {
      take(mine.filter(kind).slice(0, 10))
    }
  }

  const fixture = [...picked.values()].sort((a, b) =>
    a.station === b.station ? a.at.localeCompare(b.at) : a.station.localeCompare(b.station),
  )
  writeFileSync(FIXTURE, JSON.stringify(fixture))
  console.log(`\nFixture: ${fixture.length} lecturas en ${FIXTURE}`)

  // Y las mismas cifras sobre el fixture, que es lo que la prueba podrá afirmar.
  const fGood = fixture.filter((r) => r.sqm !== null && r.sqm > 10 && r.sunElevationDeg <= -6)
  const fBad = fixture.filter(
    (r) => r.sqm !== null && (r.sqm === -1000 || r.sqm === 0 || (r.sqm >= 9 && r.sqm < 10)),
  )
  console.log(
    `  en el fixture: ${fGood.length} buenas de noche (mínimo ${Math.min(...fGood.map((r) => r.sqm as number)).toFixed(2)}), ` +
      `${fBad.length} artefactos (máximo ${Math.max(...fBad.filter((r) => (r.sqm as number) > 0).map((r) => r.sqm as number)).toFixed(2)})`,
  )
  console.log(
    `  artefactos del fixture con el sol bajo −6°: ${fBad.filter((r) => r.sunElevationDeg <= -6).length}`,
  )

  // ---------------------------------------- hasta dónde habla un fotómetro
  // La pregunta que decide `MAX_STATION_DISTANCE_KM` no es qué fracción del
  // recuadro cubre un radio —el recuadro es medio océano— sino a partir de qué
  // distancia un fotómetro deja de predecir a otro. Eso se mide: parejas de
  // lecturas SIMULTÁNEAS, de noche cerrada y sin luna, contra la distancia.
  const clean = all
    .filter((r) => r.sqm !== null && (r.sqm as number) >= 11 && r.sunElevationDeg < -18)
    .map((r) => {
      const m = r.at.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)!
      const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      return { ...r, t }
    })
    .filter((r) => moonSight(r.t, { lon: r.lon, lat: r.lat, elevationM: 0 }).apparentElevationDeg <= -2)

  const slots = new Map<number, Map<string, (typeof clean)[number]>>()
  for (const r of clean) {
    const k = Math.round(r.t / 600_000)
    const m = slots.get(k) ?? new Map()
    if (!m.has(r.station)) m.set(r.station, r)
    slots.set(k, m)
  }
  const pairs: { d: number; diff: number }[] = []
  for (const m of slots.values()) {
    const list = [...m.values()]
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        pairs.push({
          d: distanceKm(a.lon, a.lat, b.lon, b.lat),
          diff: Math.abs((a.sqm as number) - (b.sqm as number)),
        })
      }
    }
  }
  console.log(`\n# Hasta dónde habla un fotómetro`)
  console.log(`Lecturas de noche cerrada y sin luna: ${clean.length}. Parejas simultáneas: ${pairs.length}.\n`)
  console.log('| Distancia | Parejas | |Δ| mediana | p90 | máximo |')
  console.log('|---|---:|---:|---:|---:|')
  const bins: { from: number; to: number; pairs: number; median: number; p90: number; max: number }[] = []
  for (const [lo, hi] of [[0, 1], [1, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 15], [15, 20], [20, 40]]) {
    const p = pairs.filter((x) => x.d >= lo && x.d < hi).map((x) => x.diff).sort((a, b) => a - b)
    if (!p.length) continue
    const q = (v: number) => p[Math.floor(v * (p.length - 1))]
    bins.push({
      from: lo,
      to: hi,
      pairs: p.length,
      median: +q(0.5).toFixed(3),
      p90: +q(0.9).toFixed(3),
      max: +q(1).toFixed(3),
    })
    console.log(`| ${lo}–${hi} km | ${p.length} | ${q(0.5).toFixed(2)} | ${q(0.9).toFixed(2)} | ${q(1).toFixed(2)} |`)
  }
  // El alcance se guarda como resumen y no como parejas: son 14 016 y lo que
  // defiende el umbral es la forma de la curva, no cada pareja.
  writeFileSync(
    REACH,
    JSON.stringify(
      {
        ventana: [days[0], days[days.length - 1]],
        estaciones: stations.size,
        lecturas: clean.length,
        parejas: pairs.length,
        bins,
      },
      null,
      2,
    ),
  )
  console.log(`\nAlcance: ${REACH}`)

  // ------------------------------------------------- la luna, para el sesgo
  // El mismo archivo sirve para lo otro que faltaba: medir `MOON_MODEL_BIAS`
  // sobre una lunación entera en vez de sobre dos noches.
  const lunar = all
    .filter((r) => r.sqm !== null && r.sqm > 10 && r.sunElevationDeg < -18)
    .map((r) => {
      const m = r.at.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)!
      const epoch = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      const moon = moonSight(epoch, { lon: r.lon, lat: r.lat, elevationM: 0 })
      return { ...r, moon }
    })
  const moonlit = lunar.filter((r) => r.moon.apparentElevationDeg > 10)
  console.log(
    `\nNoche cerrada (sol < −18°): ${lunar.length} lecturas, de ellas con la luna por encima de 10°: ${moonlit.length}`,
  )
  const phases = moonlit.map((r) => r.moon.illumination).sort((a, b) => a - b)
  if (phases.length) {
    console.log(
      `  fases cubiertas: de ${(phases[0] * 100).toFixed(0)} % a ${(phases[phases.length - 1] * 100).toFixed(0)} %`,
    )
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
