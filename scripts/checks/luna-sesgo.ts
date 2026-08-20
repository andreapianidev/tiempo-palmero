/**
 * El sesgo del modelo lunar, medido sobre una lunación entera.
 *
 * LO QUE `MOON_MODEL_BIAS` PEDÍA. Esa constante lleva escrito desde que se creó
 * que Krisciunas y Schaefer da el cielo 0,64 mag más oscuro del que la red mide,
 * que un factor de 3,5 sobre el flujo lunar arregla el cuarto creciente y rompe
 * la llena, y que «lo que falta para poder corregirlo bien es una lunación
 * entera de archivo, no dos noches». Esto es esa lunación.
 *
 * LA PREGUNTA, EXACTAMENTE. Un sesgo constante en magnitudes se corrige con una
 * resta y no rompe nada. Un sesgo que CRECE CON LA FASE significa que la curva
 * de fase del modelo está mal, y ahí una resta empeora la mitad de las noches.
 * Con dos noches de una sola fase las dos hipótesis son indistinguibles; con
 * treinta días y las fases del 9 % al 100 %, no.
 *
 * MÉTODO, el mismo que la prueba de `skyglow.test.ts` para que las cifras sean
 * comparables:
 *
 *  - Solo noche cerrada, sol por debajo de −18°, para que el crepúsculo no
 *    entre en la cuenta.
 *  - El cielo oscuro de cada estación es el percentil 90 de SUS lecturas con la
 *    luna puesta. Se mide por estación porque el resplandor de abajo es de cada
 *    sitio; usar uno común metería la contaminación lumínica dentro del sesgo
 *    lunar.
 *  - La extinción sale de la cota real de cada estación, leída del DEM.
 *  - Se compara el modelo contra la lectura y se parte por fase.
 *
 * Uso: `npx tsx scripts/checks/luna-sesgo.ts`. Necesita el archivo ya
 * descargado en `.tmp/sky-archive/` — lo baja `sqm-archivo.ts`.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { decode, type CdaPayload } from '../../src/lib/cabildo'
import { sunPosition } from '../../src/lib/sun'
import { moonSight } from '../../src/lib/moon'
import { modelledSkyGlow } from '../../src/lib/stars/skyglow'
import { extinctionCoefficient } from '../../src/lib/stars/visibility'
import { loadDem } from '../dem-node'
import { elevationAt } from '../../src/lib/dem'

interface Sample {
  station: string
  site: string
  lon: number
  lat: number
  elevationM: number
  sqm: number
  sunElevationDeg: number
  moonElevationDeg: number
  moonIllumination: number
  moonZenithSeparationDeg: number
}

const dem = loadDem()

function read(): Sample[] {
  const out: Sample[] = []
  for (const f of readdirSync('.tmp/sky-archive').filter((n) => n.endsWith('.json')).sort()) {
    const payload = JSON.parse(readFileSync(`.tmp/sky-archive/${f}`, 'utf8')) as CdaPayload
    for (const row of decode(payload)) {
      let lon = NaN
      let lat = NaN
      try {
        const g = JSON.parse(String(row.location)) as { coordinates: number[] }
        lon = g.coordinates[0]
        lat = g.coordinates[1]
      } catch {
        continue
      }
      const m = String(row.timeinstant).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
      if (!m) continue
      const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      const sqm = row.skymagnitude === null ? NaN : Number(row.skymagnitude)
      if (!Number.isFinite(sqm) || sqm < 11) continue
      const sun = sunPosition(t, lon, lat).elevationDeg
      if (sun > -18) continue
      const moon = moonSight(t, { lon, lat, elevationM: 0 })
      out.push({
        station: String(row.entityid),
        site: String(row.name),
        lon,
        lat,
        elevationM: elevationAt(dem, lon, lat) ?? 0,
        sqm,
        sunElevationDeg: sun,
        moonElevationDeg: moon.apparentElevationDeg,
        moonIllumination: moon.illumination,
        moonZenithSeparationDeg: 90 - moon.apparentElevationDeg,
      })
    }
  }
  return out
}

const samples = read()
const stations = [...new Set(samples.map((s) => s.station))]

/**
 * Cielo oscuro propio de cada estación, de sus lecturas con la luna puesta.
 *
 * EL CUANTIL IMPORTA Y HAY QUE ELEGIRLO A CONCIENCIA. `skyglow.test.ts` usa el
 * percentil 90 porque «cielo oscuro del sitio» quiere decir la mejor noche, no
 * la típica. Para MEDIR EL SESGO LUNAR eso mete un desplazamiento de base
 * dentro de la cuenta: con el p90, el modelo sale 0,27 mag más oscuro que la
 * lectura incluso con la luna puesta, y esos 0,27 son la distancia del p90 a la
 * mediana, no un fallo del término lunar. Con la mediana el control queda en
 * cero y lo que queda es la luna.
 *
 * Se puede pedir el otro con `SQM_QUANTILE=0.9` para comparar con la prueba.
 */
const QUANTILE = Number(process.env.SQM_QUANTILE ?? 0.5)
const darkSky = new Map<string, number>()
for (const id of stations) {
  const own = samples
    .filter((s) => s.station === id && s.moonElevationDeg < 0)
    .map((s) => s.sqm)
    .sort((a, b) => a - b)
  if (own.length >= 20) darkSky.set(id, own[Math.floor(own.length * QUANTILE)])
}

/** El modelo, con un factor opcional sobre el flujo de la luna. */
function model(s: Sample, moonScale = 1): number {
  const base = darkSky.get(s.station)!
  if (moonScale === 1) {
    return modelledSkyGlow({
      sunElevationDeg: s.sunElevationDeg,
      moon:
        s.moonElevationDeg > 0
          ? { illumination: s.moonIllumination, elevationDeg: s.moonElevationDeg }
          : null,
      moonSeparationDeg: s.moonZenithSeparationDeg,
      skyElevationDeg: 90,
      darkSky: base,
      extinctionK: extinctionCoefficient(s.elevationM),
    })
  }
  // Con factor: se recompone a mano para poder escalar solo el término lunar.
  const nl = (mag: number) => 34.08 * Math.exp(20.7233 - 0.92104 * mag)
  const mag = (v: number) => (Math.log(v / 34.08) - 20.7233) / -0.92104
  const withMoon = modelledSkyGlow({
    sunElevationDeg: s.sunElevationDeg,
    moon:
      s.moonElevationDeg > 0
        ? { illumination: s.moonIllumination, elevationDeg: s.moonElevationDeg }
        : null,
    moonSeparationDeg: s.moonZenithSeparationDeg,
    skyElevationDeg: 90,
    darkSky: base,
    extinctionK: extinctionCoefficient(s.elevationM),
  })
  const without = modelledSkyGlow({
    sunElevationDeg: s.sunElevationDeg,
    moon: null,
    moonSeparationDeg: 90,
    skyElevationDeg: 90,
    darkSky: base,
    extinctionK: extinctionCoefficient(s.elevationM),
  })
  const moonNl = Math.max(0, nl(withMoon) - nl(without))
  return mag(nl(without) + moonScale * moonNl)
}

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(p * (s.length - 1))]
}

const usable = samples.filter((s) => darkSky.has(s.station))
console.log(`Lecturas de noche cerrada: ${usable.length} de ${stations.length} estaciones`)
console.log(
  `Con la luna por encima de 10°: ${usable.filter((s) => s.moonElevationDeg > 10).length}`,
)
console.log('\nCielo oscuro medido por estación (p90 sin luna):')
for (const id of stations) {
  const v = darkSky.get(id)
  if (v === undefined) continue
  const site = usable.find((s) => s.station === id)?.site ?? ''
  console.log(`  ${id.padEnd(10)} ${v.toFixed(2)}  ${site.slice(0, 44)}`)
}

// --------------------------------------------------------------- por fase
console.log('\n# El sesgo por fase (modelo − medido, mag; positivo = el modelo lo pone más oscuro)')
console.log('| Fase | Lecturas | Sesgo mediana | p10 | p90 | Error abs. medio |')
console.log('|---|---:|---:|---:|---:|---:|')
const bands: [number, number, string][] = [
  [0.0, 0.15, '0-15 %'],
  [0.15, 0.3, '15-30 %'],
  [0.3, 0.5, '30-50 %'],
  [0.5, 0.7, '50-70 %'],
  [0.7, 0.9, '70-90 %'],
  [0.9, 1.01, '90-100 %'],
]
for (const [lo, hi, label] of bands) {
  const set = usable.filter(
    (s) => s.moonElevationDeg > 10 && s.moonIllumination >= lo && s.moonIllumination < hi,
  )
  if (set.length < 20) continue
  const signed = set.map((s) => model(s) - s.sqm)
  const abs = signed.map(Math.abs)
  console.log(
    `| ${label} | ${set.length} | ${q(signed, 0.5).toFixed(2)} | ${q(signed, 0.1).toFixed(2)} | ${q(signed, 0.9).toFixed(2)} | ${(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2)} |`,
  )
}

const moonlit = usable.filter((s) => s.moonElevationDeg > 10)
const signedAll = moonlit.map((s) => model(s) - s.sqm)
console.log(
  `\nSesgo global con la luna a más de 10°: mediana ${q(signedAll, 0.5).toFixed(3)} mag sobre ${moonlit.length} lecturas`,
)
const noMoon = usable.filter((s) => s.moonElevationDeg < 0)
const signedNo = noMoon.map((s) => model(s) - s.sqm)
console.log(
  `Sesgo con la luna puesta (control): mediana ${q(signedNo, 0.5).toFixed(3)} sobre ${noMoon.length}`,
)

// ------------------------------------------------ ¿un factor único sirve?
console.log('\n# ¿Un factor único sobre el flujo lunar arregla todas las fases?')
console.log('| Factor | Sesgo global | 15-30 % | 50-70 % | 90-100 % | Error abs. medio |')
console.log('|---|---:|---:|---:|---:|---:|')
for (const scale of [1, 1.5, 2, 2.5, 3, 3.5, 4]) {
  const cell = (lo: number, hi: number) => {
    const set = moonlit.filter((s) => s.moonIllumination >= lo && s.moonIllumination < hi)
    return set.length >= 20 ? q(set.map((s) => model(s, scale) - s.sqm), 0.5).toFixed(2) : '—'
  }
  const all = moonlit.map((s) => model(s, scale) - s.sqm)
  const abs = all.map(Math.abs)
  console.log(
    `| ×${scale} | ${q(all, 0.5).toFixed(2)} | ${cell(0.15, 0.3)} | ${cell(0.5, 0.7)} | ${cell(0.9, 1.01)} | ${(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2)} |`,
  )
}

// -------------------------------- ¿y una resta constante en magnitudes?
console.log('\n# ¿Y una resta constante en magnitudes?')
const bias = q(signedAll, 0.5)
console.log(`Restando ${bias.toFixed(3)} mag a la rama con luna:`)
console.log('| Fase | Sesgo residual | Error abs. medio |')
console.log('|---|---:|---:|')
for (const [lo, hi, label] of bands) {
  const set = moonlit.filter((s) => s.moonIllumination >= lo && s.moonIllumination < hi)
  if (set.length < 20) continue
  const r = set.map((s) => model(s) - bias - s.sqm)
  const abs = r.map(Math.abs)
  console.log(
    `| ${label} | ${q(r, 0.5).toFixed(2)} | ${(abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(2)} |`,
  )
}


// ---------------------------------------------------------------- fixture
/**
 * El fixture que hace comprobable todo lo de arriba: 150 lecturas por banda de
 * fase, repartidas por estación y por noche, con la geometría lunar y el cielo
 * oscuro de su estación ya dentro.
 *
 * Se guarda el cielo base porque calcularlo dentro de la prueba con solo estas
 * lecturas daría otro número: la mediana de 900 filas elegidas no es la mediana
 * de 63 713. Meterlo en el fixture es lo que hace que la prueba mida el término
 * lunar y no el muestreo.
 */
const FIXTURE = 'src/lib/__fixtures__/sqm-luna.json'
const perBand = 150
const chosen: unknown[] = []
for (const [lo, hi] of bands) {
  const set = usable.filter(
    (s) => s.moonElevationDeg > 10 && s.moonIllumination >= lo && s.moonIllumination < hi,
  )
  const step = Math.max(1, Math.floor(set.length / perBand))
  for (let i = 0; i < set.length && chosen.length < perBand * bands.length; i += step) {
    const s = set[i]
    chosen.push({
      station: s.station,
      site: s.site,
      elevationM: Math.round(s.elevationM),
      darkSky: +darkSky.get(s.station)!.toFixed(3),
      sqm: s.sqm,
      sunElevationDeg: +s.sunElevationDeg.toFixed(3),
      moonElevationDeg: +s.moonElevationDeg.toFixed(3),
      moonIllumination: +s.moonIllumination.toFixed(4),
      moonZenithSeparationDeg: +s.moonZenithSeparationDeg.toFixed(3),
    })
  }
}
// Y doscientas sin luna, que son el control: si el modelo se desplaza entero,
// esto lo caza y la parte lunar no. El paso se calcula sobre el total para que
// el muestreo recorra la lunación entera y no las primeras noches.
const dark0 = usable.filter((s) => s.moonElevationDeg < 0)
const darkStep = Math.max(1, Math.floor(dark0.length / 200))
for (let i = 0; i < dark0.length; i += darkStep) {
  const s = dark0[i]
  chosen.push({
    station: s.station,
    site: s.site,
    elevationM: Math.round(s.elevationM),
    darkSky: +darkSky.get(s.station)!.toFixed(3),
    sqm: s.sqm,
    sunElevationDeg: +s.sunElevationDeg.toFixed(3),
    moonElevationDeg: +s.moonElevationDeg.toFixed(3),
    moonIllumination: +s.moonIllumination.toFixed(4),
    moonZenithSeparationDeg: +s.moonZenithSeparationDeg.toFixed(3),
  })
}
writeFileSync(FIXTURE, JSON.stringify(chosen))
console.log(`\nFixture lunar: ${chosen.length} lecturas en ${FIXTURE}`)
