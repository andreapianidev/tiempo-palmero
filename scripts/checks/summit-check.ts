/**
 * ¿Cuánto vale la estación del Roque dentro del motor?
 *
 * Pregunta una sola cosa: en el punto donde hay una medida REAL a 2387 m, qué
 * dicen las tres cosas que la aplicación puede poner ahí arriba —la recta de la
 * red del Cabildo extrapolada, el ancla del perfil vertical, y la propia
 * estación— y cuánto se separan entre sí. Ese margen es lo que se gana o se
 * pierde metiendo el Roque en el motor.
 *
 * Usa el MISMO `buildModel`, el MISMO `estimate` y el MISMO `sampleProfile` que
 * la app: si esto y la aplicación discrepasen, sería este fichero el que miente.
 *
 *   npx tsx scripts/checks/summit-check.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { blitTerrarium, emptyDem, elevationAt, type DemManifest } from '../../src/lib/dem'
import { decode, isCdaPayload } from '../../src/lib/cabildo'
import { buildStations } from '../../src/lib/quality'
import { buildModel, estimate } from '../../src/lib/interpolate'
import { fetchProfiles, sampleProfile } from '../../src/lib/profile'
import { humidityAt } from '../../src/lib/profile'
import { decodeRoque, ROQUE_ELEVATION_M, ROQUE_LAT, ROQUE_LON } from '../../src/lib/roque'

const ROOT = join(import.meta.dirname, '../..')
const CDA =
  'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery' +
  '?path=/public/sc_lapalma/verticals/sql/environment.cda' +
  '&_TRUST_USER_=opendata_sc_lapalma&dataAccessId=weatherobserved_lastdata&outputType=json'
const TNG = 'https://tngweb.tng.iac.es/api/meteo/weather'

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

const f = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d)

async function main() {
  const dem = loadDem()
  const elevationLookup = (lon: number, lat: number) => elevationAt(dem, lon, lat)

  const raw = await (await fetch(CDA)).json()
  if (!isCdaPayload(raw)) throw new Error('CDA ilegible')
  const { stations } = buildStations(decode(raw), elevationLookup, { now: Date.now() })

  const tng = decodeRoque({ data: await (await fetch(TNG)).json() }, Date.now())
  if (!tng) throw new Error('TNG ilegible')

  // El perfil es opcional a propósito: Open-Meteo contesta 429 con facilidad y
  // la comparación que importa —red contra estación real— no lo necesita.
  const [profile] = await fetchProfiles([{ lon: ROQUE_LON, lat: ROQUE_LAT }]).catch(
    (e: unknown) => {
      console.log(`(sin perfil vertical: ${e instanceof Error ? e.message : String(e)})\n`)
      return []
    },
  )

  const ceiling = Math.max(...stations.map((s) => s.elevation))
  console.log(`Estaciones: ${stations.length}   techo de la red: ${f(ceiling, 0)} m`)
  console.log(
    `Sobre 1500 m publican: ${stations.filter((s) => s.elevation > 1500).length} estaciones del Cabildo\n`,
  )

  for (const variable of ['temperature', 'relativehumidity'] as const) {
    const key = variable === 'temperature' ? 'temperature' : 'humidity'
    const field = tng.fields[key]
    const model = buildModel(stations, variable)

    // Lo que la app pinta HOY en el punto del Roque, sin anclas y con ellas.
    const bare = estimate(model, ROQUE_LON, ROQUE_LAT, ROQUE_ELEVATION_M)
    const fromProfile =
      profile === undefined
        ? null
        : variable === 'temperature'
          ? sampleProfile(profile, ROQUE_ELEVATION_M, 'temperature')
          : humidityAt(profile, ROQUE_ELEVATION_M)

    console.log(`--- ${variable} ---`)
    console.log(`  medido (TNG, ${ROQUE_ELEVATION_M} m): ${f(field?.value)}  ` +
      `${field?.outdated ? '[OBSOLETO]' : '[fresco]'}  ` +
      `${field ? new Date(field.observedAt).toISOString() : ''}`)
    console.log(`  recta del Cabildo extrapolada:      ${f(bare?.value ?? null)}  ` +
      `(R²=${f(model.r2)}, gradiente ${f(model.b * 100, 3)}/100 m)`)
    console.log(`  ancla del perfil vertical:          ${f(fromProfile)}`)
    if (field && bare) console.log(`  error de la recta:  ${f(bare.value - field.value)}`)
    if (field && fromProfile !== null)
      console.log(`  error del perfil:   ${f(fromProfile - field.value)}`)
    console.log()
  }

  if (profile) {
    console.log('--- inversión diagnosticada por el perfil ---')
    console.log(
      profile.inversion
        ? `  base ${f(profile.inversion.base, 0)} m → cima ${f(profile.inversion.top, 0)} m  ` +
            `ΔT ${f(profile.inversion.deltaT)} K  ΔHR ${f(profile.inversion.deltaRh, 0)} pp  ` +
            `±${f(profile.inversion.resolutionM, 0)} m`
        : '  ninguna',
    )
  }

  // La capa que hoy NADIE mide: entre la estación más alta del Cabildo y la
  // cumbre. Es exactamente el tramo que el motor rellena con modelo.
  const t = tng.fields.temperature
  const h = tng.fields.humidity
  const byHeight = [...stations].sort((a, b) => b.elevation - a.elevation)
  const highest = byHeight.find((s) => s.temperature !== null)
  if (highest && t && highest.temperature !== null) {
    const span = ROQUE_ELEVATION_M - highest.elevation
    console.log(`\n--- capa MEDIDA entre el techo de la red y la cumbre (${f(span, 0)} m) ---`)
    console.log(
      `  ${highest.name} (${f(highest.elevation, 0)} m): ` +
        `${f(highest.temperature)} °C, ${f(highest.relativehumidity, 0)} %`,
    )
    console.log(`  Roque (${ROQUE_ELEVATION_M} m): ${f(t.value)} °C, ${f(h?.value ?? null, 0)} %`)
    console.log(
      `  gradiente REAL: ${f(((t.value - highest.temperature) / span) * 100, 3)} K/100 m`,
    )
    if (h && highest.relativehumidity !== null) {
      console.log(`  ΔHR REAL: ${f(h.value - highest.relativehumidity, 0)} pp`)
    }
    console.log('\n  las cinco más altas de la red:')
    for (const s of byHeight.slice(0, 5)) {
      console.log(
        `    ${f(s.elevation, 0).padStart(5)} m  ${f(s.temperature).padStart(6)} °C  ` +
          `${f(s.relativehumidity, 0).padStart(4)} %   ${s.name}`,
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
