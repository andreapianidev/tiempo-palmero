/**
 * Comprobación de extremo a extremo de las funciones nuevas, contra las APIs
 * vivas y con el código real de la aplicación.
 *
 * POR QUÉ EXISTE. Las pruebas unitarias usan fixtures: verifican que el código
 * interpreta bien una respuesta CONOCIDA. Esto verifica lo otro, que es lo que
 * de verdad se rompe en producción — que la respuesta de hoy siga teniendo la
 * forma que el código espera. Un campo renombrado en origen, un modelo que deja
 * de servir un nivel de presión o un Feature Service que cambia de esquema no
 * los detecta ningún test con fixture.
 *
 *   npx tsx scripts/probe-island.ts
 *
 * No forma parte de `npm test` a propósito: depende de que tres servicios
 * ajenos estén en pie, y un test que falla porque el TNG está de mantenimiento
 * no dice nada del código.
 */

import { decodeProfile, PRESSURE_LEVELS } from '../src/lib/profile.js'
import { summarizeDeck, sunlightAbove, zoneAt } from '../src/lib/clouds.js'
import { decodeRoque, ROQUE_KEYS, dustLevel, seeingQuality } from '../src/lib/roque.js'
import { decodeParcel } from '../src/lib/agro/parcel.js'
import { waterBalance, litresPerPlant, DEFAULT_SPACING_M2 } from '../src/lib/agro/balance.js'

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`)
const bad = (s: string) => {
  console.log(`  \x1b[31m✗\x1b[0m ${s}`)
  failures++
}
let failures = 0

/** Tres columnas reales sobre la isla: costa, medianía y cumbre. */
const POINTS = [
  { lon: -17.9126, lat: 28.6094, name: 'Los Llanos' },
  { lon: -17.8563, lat: 28.6467, name: 'centro' },
  { lon: -17.8892, lat: 28.7542, name: 'Roque' },
]

// ---------------------------------------------------------------------------

async function probeClouds() {
  console.log('\n\x1b[1mMar de nubes\x1b[0m — sondeo de niveles de presión + nubosidad baja')

  const fields = [
    ...PRESSURE_LEVELS.flatMap((hPa) => [
      `temperature_${hPa}hPa`,
      `dew_point_${hPa}hPa`,
      `geopotential_height_${hPa}hPa`,
    ]),
    'cloud_cover_low',
  ]
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${POINTS.map((p) => p.lat).join(',')}` +
    `&longitude=${POINTS.map((p) => p.lon).join(',')}` +
    `&current=${fields.join(',')}&models=icon_seamless&timezone=UTC`

  const body = await (await fetch(url)).json()
  const blocks: any[] = Array.isArray(body) ? body : [body]

  const profiles = blocks
    .map((b, i) => decodeProfile(b.current, POINTS[i].lon, POINTS[i].lat))
    .filter((p): p is NonNullable<typeof p> => p !== null)

  profiles.length === POINTS.length
    ? ok(`${profiles.length}/${POINTS.length} columnas decodificadas`)
    : bad(`solo ${profiles.length}/${POINTS.length} columnas: el modelo ha cambiado de niveles`)

  const withCloud = profiles.filter((p) => p.cloudCoverLow !== null).length
  withCloud === profiles.length
    ? ok(`nubosidad baja presente en las ${withCloud}`)
    : bad(`${withCloud}/${profiles.length} traen cloud_cover_low — la guarda se queda ciega`)

  for (const p of profiles) {
    const heights = p.levels.map((l) => l.height)
    const sorted = [...heights].sort((a, b) => a - b)
    if (JSON.stringify(heights) !== JSON.stringify(sorted)) {
      bad(`niveles desordenados en ${p.lat}`)
    }
    // La altura geopotencial de 1000 hPa ronda los 100-200 m y la de 700, los
    // 3000-3300. Fuera de ahí el modelo estaría diciendo otra cosa.
    const top = p.levels[p.levels.length - 1]
    if (top.height < 2500 || top.height > 3800) {
      bad(`el nivel más alto está a ${Math.round(top.height)} m, fuera de lo plausible`)
    }
  }
  ok('todos los perfiles ordenados y con alturas plausibles')

  const deck = summarizeDeck(profiles)
  if (!deck) {
    ok('hoy no hay inversión del alisio (respuesta válida, no un fallo)')
  } else {
    ok(
      `inversión de ${Math.round(deck.base)} a ${Math.round(deck.top)} m ` +
        `(±${Math.round(deck.resolutionM)}), ΔT ${deck.deltaT.toFixed(1)} K, ` +
        `ΔRH ${deck.deltaRh.toFixed(0)} pt, nubes ${deck.coverage}%`,
    )
    console.log(
      `    → ${deck.present ? 'HAY manta' : 'inversión SECA: no se anuncia mar de nubes'}` +
        `, sol por encima de ${sunlightAbove(deck)} m`,
    )
    // La guarda que justifica la función entera.
    if (deck.present && (deck.coverage ?? 0) < 40) {
      bad('anuncia manta con menos del 40 % de nubosidad')
    } else {
      ok('la guarda de nubosidad se cumple')
    }
    // La cota de sol nunca puede seguir cayendo dentro de la banda.
    zoneAt(deck, sunlightAbove(deck)) === 'above'
      ? ok('la cota de sol queda fuera de la banda de incertidumbre')
      : bad('la cota de sol sigue dentro de la banda')
  }
}

// ---------------------------------------------------------------------------

async function probeRoque() {
  console.log('\n\x1b[1mRoque de los Muchachos\x1b[0m — estación del TNG, 2387 m')

  const res = await fetch('https://tngweb.tng.iac.es/api/meteo/weather')
  if (!res.ok) return bad(`el origen contesta HTTP ${res.status}`)

  const status = decodeRoque({ data: await res.json() }, Date.now())
  if (!status) return bad('no se ha podido decodificar ni un campo')

  const got = Object.keys(status.fields)
  ok(`${got.length}/${ROQUE_KEYS.length} campos decodificados: ${got.join(', ')}`)

  const missing = ROQUE_KEYS.filter((k) => !status.fields[k])
  if (missing.length) console.log(`    → sin publicar hoy: ${missing.join(', ')}`)

  const t = status.fields.temperature
  if (t) {
    // A 2387 m, en Canarias, fuera de [-10, 35] algo está roto.
    t.value > -10 && t.value < 35
      ? ok(`temperatura ${t.value} °C, plausible para la cota`)
      : bad(`temperatura ${t.value} °C, imposible a 2387 m`)
  }

  const p = status.fields.pressure
  if (p) {
    // La atmósfera estándar da ~755 hPa a 2387 m. Que llegue cerca de eso —y
    // NO cerca de 1013— es la prueba de que no viene reducida al nivel del mar.
    p.value > 700 && p.value < 810
      ? ok(`presión ${p.value} hPa: de estación, sin reducir (a 2387 m toca ~755)`)
      : bad(`presión ${p.value} hPa: o está reducida al nivel del mar o el sensor falla`)
  }

  const stale = Object.entries(status.fields).filter(([, f]) => f.outdated)
  stale.length
    ? ok(`${stale.length} campo(s) marcados obsoletos por el origen: ${stale.map(([k]) => k).join(', ')} — se enseñarán apagados`)
    : ok('ningún campo marcado obsoleto ahora mismo')

  const seeing = status.fields.seeing
  if (seeing && !seeing.outdated) {
    console.log(`    → seeing ${seeing.value.toFixed(2)}" (${seeingQuality(seeing.value)})`)
  }
  const dust = status.fields.dust
  if (dust) console.log(`    → polvo ${dust.value.toFixed(2)} µg/m³ (${dustLevel(dust.value)})`)

  status.observedAt !== null
    ? ok(`hora del conjunto: hace ${Math.round((Date.now() - status.observedAt) / 60000)} min`)
    : bad('ningún campo fresco')
}

// ---------------------------------------------------------------------------

async function probeEto() {
  console.log('\n\x1b[1mETo y balance hídrico\x1b[0m — Open-Meteo FAO-56')

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${POINTS.map((p) => p.lat).join(',')}` +
    `&longitude=${POINTS.map((p) => p.lon).join(',')}` +
    '&elevation=200,870,2387' +
    '&daily=et0_fao_evapotranspiration,precipitation_sum' +
    '&forecast_days=1&timezone=Atlantic%2FCanary'

  const body = await (await fetch(url)).json()
  const blocks: any[] = Array.isArray(body) ? body : [body]

  const etos: number[] = []
  blocks.forEach((b, i) => {
    const v = b.daily?.et0_fao_evapotranspiration?.[0]
    if (typeof v !== 'number') return bad(`${POINTS[i].name}: sin ETo`)
    // Una ETo diaria fuera de 0–12 mm en agosto no es de esta isla.
    v >= 0 && v <= 12
      ? ok(`${POINTS[i].name} (${b.elevation} m): ${v} mm`)
      : bad(`${POINTS[i].name}: ${v} mm, fuera de rango`)
    etos.push(v)
  })

  // El gradiente con la altitud es la razón de pedir 54 puntos y no uno.
  if (etos.length >= 2 && etos[0] > etos[etos.length - 1]) {
    ok(`la ETo baja con la altitud (${etos[0]} → ${etos[etos.length - 1]} mm)`)
  } else {
    bad('la ETo NO baja con la altitud: revisar el parámetro elevation')
  }

  const b = waterBalance('21', etos[0], 0)
  if (!b) return bad('el balance de la platanera devuelve null')
  ok(
    `platanera: ETc ${b.etcMm.toFixed(2)} mm = ` +
      `${litresPerPlant(b.deficitMm, DEFAULT_SPACING_M2.platanera!).toFixed(0)} L/planta`,
  )
  b.etcMm > b.etoMm
    ? ok('ETc > ETo, como exige un Kc de 1,1')
    : bad('ETc ≤ ETo con Kc 1,1: la aritmética está mal')
}

// ---------------------------------------------------------------------------

async function probeParcel() {
  console.log('\n\x1b[1mParcela en vivo\x1b[0m — Feature Service de Agricultura')

  // Tazacorte, donde 728,8 de sus 732,7 ha en cultivo son platanera.
  const targets = [
    { lon: -17.9284, lat: 28.6407, name: 'Tazacorte' },
    { lon: -17.9126, lat: 28.6094, name: 'Los Llanos' },
    { lon: -17.8892, lat: 28.7542, name: 'Roque' },
  ]

  for (const target of targets) {
    const params = new URLSearchParams({
      geometry: `${target.lon},${target.lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'CULTIVO,DESCRIP,INVERNADER,JABLE,Z,POLIGONO,PARCELA',
      returnGeometry: 'false',
      resultRecordCount: '1',
      f: 'json',
    })
    const url =
      'https://services.arcgis.com/hkQNLKNeDVYBjvFE/arcgis/rest/services' +
      `/Agricultura/FeatureServer/0/query?${params}`

    const t0 = Date.now()
    const body = await (await fetch(url)).json()
    const ms = Date.now() - t0
    const attrs = body.features?.[0]?.attributes

    if (!attrs) {
      ok(`${target.name}: sin parcela catalogada (${ms} ms) — respuesta válida`)
      continue
    }
    const parcel = decodeParcel(attrs)
    if (!parcel) {
      bad(`${target.name}: atributos ilegibles`)
      continue
    }
    ok(
      `${target.name}: «${parcel.description}»` +
        `${parcel.crop ? ` · Kc ${parcel.crop.kcMid ?? '—'}` : ' · sin catálogo'}` +
        `${parcel.greenhouse ? ' · invernadero' : ''}` +
        `${parcel.jable ? ' · jable' : ''} (${ms} ms)`,
    )
    // El esquema tiene que seguir trayendo DESCRIP: es lo que se enseña.
    if (!parcel.description) bad(`${target.name}: DESCRIP vacío, el esquema ha cambiado`)
  }
}

// ---------------------------------------------------------------------------

const probes: [string, () => Promise<void>][] = [
  ['nubes', probeClouds],
  ['roque', probeRoque],
  ['eto', probeEto],
  ['parcela', probeParcel],
]

for (const [name, fn] of probes) {
  try {
    await fn()
  } catch (e) {
    bad(`${name}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

console.log(
  failures === 0
    ? '\n\x1b[32mTodo correcto contra las APIs vivas.\x1b[0m'
    : `\n\x1b[31m${failures} comprobación(es) fallidas.\x1b[0m`,
)
process.exit(failures === 0 ? 0 : 1)
