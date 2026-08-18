/**
 * LOS CUATRO REGÍMENES DE LA ISLA, MEDIDOS
 *
 * La portada dibuja la isla en tres dimensiones y, mientras gira, cambia de
 * régimen atmosférico: calima, alisio, temporal del suroeste y noche despejada.
 * Cada régimen pinta el relieve con SU campo de temperatura, y ese campo son
 * dos números —la temperatura en la costa y el gradiente altitudinal—. Este
 * script es de dónde salen.
 *
 * Uso:
 *   npx tsx scripts/checks/regimenes.ts              # busca los días y mide
 *   npx tsx scripts/checks/regimenes.ts 2026-08-13   # mide los días que se le den
 *
 * CÓMO SE ELIGEN LOS DÍAS. No a ojo. La búsqueda usa dos archivos públicos y
 * gratuitos de Open-Meteo —el reanálisis diario y el de calidad del aire, que
 * publica polvo en suspensión— para ordenar el último año por la firma de cada
 * régimen, y solo los finalistas se le piden a la API del Cabildo. Es a
 * propósito: `bi.lapalma.es` es un servicio público pequeño que devuelve 2 MB
 * por día pedido, y barrer un año contra él serían 700 MB para quedarse con
 * cuatro fechas.
 *
 * QUÉ SE MIDE, Y CON QUÉ. Por el motor de la aplicación entero, no por un OLS
 * aparte: `diagnoseNetwork()` sobre las series del día para apartar los sensores
 * averiados, `bucketize()` para juntar en un instante una red que no está
 * sincronizada, y `buildModel()` para ajustar. El gradiente y la temperatura de
 * costa que salen son los que la aplicación pondría en su panel de estado.
 *
 * POR QUÉ NO VALE `ols()` A SECAS —y es la razón de que este script exista en
 * esta forma—. Medido así, el 5 de agosto de 2026 a las 09:00Z daba **R² = 0,04
 * y σ = 7,9 °C** sobre 34 estaciones: un gradiente sin ningún significado. La
 * tabla estación por estación (`--detalle`) dice por qué: Ecofinca Nogales
 * publicaba **70,0 °C** a 183 m, y dos MTD marcaban 16,7 °C a 676 m y 20,9 °C a
 * 109 m entre vecinas a más de 26. Un solo sensor a 70 °C mueve la recta de toda
 * la isla. La aplicación los aparta antes de ajustar; este script tenía que
 * hacer lo mismo para medir lo mismo.
 */

import { loadDem } from '../dem-node.js'
import { elevationAt } from '../../src/lib/dem.js'
import { buildModel } from '../../src/lib/interpolate.js'
import { bucketize } from '../../src/lib/history-field.js'
import { diagnoseNetwork, type Track } from '../../src/lib/sensor-health.js'
import type { DayPayload } from '../../src/lib/history.js'
import type { Station } from '../../src/lib/quality.js'

const PENTAHO = 'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery'
const TRUST_USER = 'opendata_sc_lapalma'
const ARCHIVO = 'https://archive-api.open-meteo.com/v1/archive'
const AIRE = 'https://air-quality-api.open-meteo.com/v1/air-quality'

/** Los Llanos de Aridane, en el centro del valle. El punto de referencia. */
const LON = -17.914
const LAT = 28.609

/* ═══════════════════════════════════════════════════════════════════════════
   1. BÚSQUEDA DE DÍAS CANDIDATOS
   ═══════════════════════════════════════════════════════════════════════════ */

interface DiaArchivo {
  dia: string
  lluviaMm: number
  vientoDir: number
  vientoMax: number
  tMax: number
  tMin: number
}

/**
 * Cuánta nube baja hubo, del reanálisis. Es el filtro previo para encontrar el
 * alisio con mar de nubes, y hacen falta DOS pasos porque ninguno solo llega:
 *
 * - Ordenar por fuerza del viento no vale. Daba el 5 de agosto de 2026 —NE a
 *   34 m/s— y medido contra la red salió una ola de calor con HR 64/39/34 %,
 *   seca a todas las cotas. Viento del nordeste no es mar de nubes.
 * - Los niveles de presión del reanálisis habrían dado la inversión directa,
 *   pero `archive-api.open-meteo.com` NO los sirve: pedir `temperature_850hPa`
 *   devuelve 200 OK con las unidades a `"undefined"` y la serie entera a null.
 *   Comprobado el 18 ago 2026.
 *
 * Así que la nube baja del reanálisis ordena los candidatos, y la firma de
 * verdad se mide contra la red del Cabildo, que es la que tiene estaciones de
 * 12 a 1.561 m y por tanto la única que puede ver la tapa por dentro.
 */
interface DiaNube {
  dia: string
  nubeBaja: number
  hr2m: number
}

async function pedirJson<T>(url: string): Promise<T> {
  for (let intento = 0; intento < 3; intento++) {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(45_000),
    })
    if (res.ok) return (await res.json()) as T
    if (res.status === 429) await new Promise((r) => setTimeout(r, 4000 * (intento + 1)))
    else throw new Error(`HTTP ${res.status} en ${url.slice(0, 80)}`)
  }
  throw new Error(`sin respuesta tras 3 intentos: ${url.slice(0, 80)}`)
}

async function archivoDiario(desde: string, hasta: string): Promise<DiaArchivo[]> {
  const q = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    start_date: desde,
    end_date: hasta,
    daily:
      'precipitation_sum,wind_direction_10m_dominant,wind_speed_10m_max,temperature_2m_max,temperature_2m_min',
    timezone: 'UTC',
  })
  const body = await pedirJson<{
    daily: {
      time: string[]
      precipitation_sum: (number | null)[]
      wind_direction_10m_dominant: (number | null)[]
      wind_speed_10m_max: (number | null)[]
      temperature_2m_max: (number | null)[]
      temperature_2m_min: (number | null)[]
    }
  }>(`${ARCHIVO}?${q}`)
  const d = body.daily
  return d.time.map((dia, i) => ({
    dia,
    lluviaMm: d.precipitation_sum[i] ?? 0,
    vientoDir: d.wind_direction_10m_dominant[i] ?? -1,
    vientoMax: d.wind_speed_10m_max[i] ?? 0,
    tMax: d.temperature_2m_max[i] ?? NaN,
    tMin: d.temperature_2m_min[i] ?? NaN,
  }))
}

/** Nube baja y humedad en superficie, promediadas en las horas centrales. */
async function archivoNubeBaja(desde: string, hasta: string): Promise<DiaNube[]> {
  const q = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    start_date: desde,
    end_date: hasta,
    hourly: 'cloud_cover_low,relative_humidity_2m',
    timezone: 'UTC',
  })
  const body = await pedirJson<{
    hourly: {
      time: string[]
      cloud_cover_low: (number | null)[]
      relative_humidity_2m: (number | null)[]
    }
  }>(`${ARCHIVO}?${q}`)

  const h = body.hourly
  const acc = new Map<string, { nb: number[]; hr: number[] }>()
  h.time.forEach((t, i) => {
    const hora = +t.slice(11, 13)
    if (hora < 9 || hora > 18) return
    const nb = h.cloud_cover_low[i]
    const hr = h.relative_humidity_2m[i]
    if (nb === null || hr === null) return
    const dia = t.slice(0, 10)
    let a = acc.get(dia)
    if (!a) acc.set(dia, (a = { nb: [], hr: [] }))
    a.nb.push(nb)
    a.hr.push(hr)
  })
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return [...acc.entries()]
    .filter(([, a]) => a.nb.length >= 6)
    .map(([dia, a]) => ({ dia, nubeBaja: media(a.nb), hr2m: media(a.hr) }))
}

/** Polvo en suspensión, máximo diario, µg/m³. Es la firma objetiva de la calima. */
async function polvoDiario(desde: string, hasta: string): Promise<Map<string, number>> {
  const q = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    start_date: desde,
    end_date: hasta,
    hourly: 'dust',
    timezone: 'UTC',
  })
  const body = await pedirJson<{ hourly: { time: string[]; dust: (number | null)[] } }>(
    `${AIRE}?${q}`,
  )
  const max = new Map<string, number>()
  body.hourly.time.forEach((t, i) => {
    const dia = t.slice(0, 10)
    const v = body.hourly.dust[i]
    if (v === null) return
    max.set(dia, Math.max(max.get(dia) ?? 0, v))
  })
  return max
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. MEDIDA CONTRA LA RED DEL CABILDO, POR EL MOTOR DE LA APLICACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */

function parseInstante(v: unknown): number {
  if (typeof v !== 'string') return NaN
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

function parsePunto(v: unknown): [number, number] | null {
  if (typeof v !== 'string') return null
  try {
    const g = JSON.parse(v) as { coordinates?: unknown }
    const c = g.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    const [lon, lat] = c as number[]
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
  } catch {
    return null
  }
}

/** Las mismas columnas, en el mismo orden, que sirve `api/history.ts`. */
const COLUMNAS = ['temperature', 'relativehumidity', 'dewpoint', 'windspeed', 'winddirection']

/**
 * Un día del archivo del Cabildo en el formato que come `bucketize()`. Se
 * reconstruye aquí el mismo `DayPayload` que sirve la función edge para que el
 * script y el navegador midan sobre la misma forma de dato.
 */
async function diaCabildo(dia: string): Promise<DayPayload> {
  const siguiente = new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)
  const q = new URLSearchParams({
    path: '/public/sc_lapalma/verticals/sql/environment.cda',
    _TRUST_USER_: TRUST_USER,
    dataAccessId: 'weatherobserved',
    outputType: 'json',
    paramstart: dia,
    paramfinish: siguiente,
  })
  const body = await pedirJson<{ metadata: { colName: string }[]; resultset: unknown[][] }>(
    `${PENTAHO}?${q}`,
  )

  const col = new Map(body.metadata.map((m, i) => [m.colName.toLowerCase(), i]))
  const idx = (n: string) => col.get(n) ?? -1
  const iId = idx('entityid')
  const iNombre = idx('name')
  const iLugar = idx('location')
  const iCuando = idx('timeinstant')
  const iCol = COLUMNAS.map((c) => idx(c))
  const inicio = Date.parse(`${dia}T00:00:00Z`)

  const porEstacion = new Map<string, DayPayload['stations'][number]>()
  for (const fila of body.resultset) {
    const punto = parsePunto(fila[iLugar])
    const cuando = parseInstante(fila[iCuando])
    if (!punto || !Number.isFinite(cuando)) continue
    const entityId = String(fila[iId] ?? '')
    let st = porEstacion.get(entityId)
    if (!st) {
      st = { entityId, name: String(fila[iNombre] ?? ''), lon: punto[0], lat: punto[1], samples: [] }
      porEstacion.set(entityId, st)
    }
    const valores = iCol.map((i) => {
      if (i < 0) return null
      const v = fila[i]
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    })
    st.samples.push([Math.round((cuando - inicio) / 60_000), ...valores])
  }
  for (const st of porEstacion.values()) {
    st.samples.sort((a, b) => (a[0] as number) - (b[0] as number))
  }
  return { day: dia, step: 0, columns: COLUMNAS, stations: [...porEstacion.values()] }
}

/** Las series de temperatura, que es lo que `diagnoseNetwork()` examina. */
function pistas(
  payload: DayPayload,
  cotaDe: (lon: number, lat: number) => number | null,
): Track[] {
  const inicio = Date.parse(`${payload.day}T00:00:00Z`)
  const iT = payload.columns.indexOf('temperature')
  const out: Track[] = []
  for (const st of payload.stations) {
    const cota = cotaDe(st.lon, st.lat)
    if (cota === null) continue
    const samples: [number, number][] = []
    for (const s of st.samples) {
      const m = s[0]
      const t = s[iT + 1]
      if (typeof m === 'number' && typeof t === 'number') samples.push([inicio + m * 60_000, t])
    }
    out.push({ entityId: st.entityId, name: st.name, elevation: cota, samples })
  }
  return out
}

interface DosCapas {
  /** R² de UNA recta sobre las mismas muestras, para poder comparar. */
  r2UnaRecta: number
  /** Cota del corte, m. Es la inversión cuando la hay. */
  corteM: number
  /** Gradiente por debajo del corte, °C/km. */
  gradAbajoCkm: number
  /** Gradiente por encima, °C/km. */
  gradArribaCkm: number
  /** Temperatura del ajuste a nivel del mar. */
  tCostaC: number
  /** Salto de temperatura AL CRUZAR el corte, °C. Positivo = más caliente arriba. */
  saltoC: number
  r2: number
  nAbajo: number
  nArriba: number
}

/**
 * AJUSTE DE DOS CAPAS. La razón de que esto exista está en los números: bajo un
 * temporal una sola recta explica la isla entera (R² = 0,97), pero bajo el
 * alisio no explica NADA (R² = 0,03) — y no porque los datos sean malos, sino
 * porque la isla son dos masas de aire apiladas con la inversión en medio. Una
 * recta única las promedia y borra justo la frontera que hace que el mar de
 * nubes exista.
 *
 * El corte no se elige: se busca. Se prueban cotas de 400 a 1.600 m y se queda
 * la que menos residuo deja, exigiendo un mínimo de 5 estaciones a cada lado
 * para que ninguna de las dos rectas se apoye en un puñado de puntos.
 *
 * SE MIDE SOBRE LAS MISMAS ESTACIONES QUE EL AJUSTE DE UNA RECTA, las que
 * sobreviven al rechazo de `buildModel`. La primera versión de esto usaba todas
 * y sus R² no eran comparables con el de una recta: el 6 nov 2025 a las 09:00Z
 * daba 0,80 en dos capas contra 0,89 en una, que es imposible —dos rectas no
 * pueden explicar menos que una— y lo único que decía era que estaba mirando dos
 * conjuntos de estaciones distintos.
 */
function dosCapas(pts: readonly { z: number; t: number }[]): DosCapas | null {
  if (pts.length < 12) return null

  const recta = (xs: readonly { z: number; t: number }[]) => {
    const n = xs.length
    const mz = xs.reduce((a, p) => a + p.z, 0) / n
    const mt = xs.reduce((a, p) => a + p.t, 0) / n
    let szz = 0
    let szt = 0
    for (const p of xs) {
      szz += (p.z - mz) ** 2
      szt += (p.z - mz) * (p.t - mt)
    }
    const b = szz > 1e-9 ? szt / szz : 0
    return { a: mt - b * mz, b }
  }

  const mediaT = pts.reduce((a, p) => a + p.t, 0) / pts.length
  const sst = pts.reduce((a, p) => a + (p.t - mediaT) ** 2, 0)

  const unaRecta = recta(pts)
  let ssrUna = 0
  for (const p of pts) ssrUna += (p.t - (unaRecta.a + unaRecta.b * p.z)) ** 2
  const r2UnaRecta = sst > 1e-9 ? Math.max(0, 1 - ssrUna / sst) : 0

  let mejor: DosCapas | null = null
  let mejorSsr = Infinity
  for (let corte = 400; corte <= 1600; corte += 50) {
    const abajo = pts.filter((p) => p.z < corte)
    const arriba = pts.filter((p) => p.z >= corte)
    if (abajo.length < 5 || arriba.length < 5) continue
    const ra = recta(abajo)
    const rb = recta(arriba)
    let ssr = 0
    for (const p of abajo) ssr += (p.t - (ra.a + ra.b * p.z)) ** 2
    for (const p of arriba) ssr += (p.t - (rb.a + rb.b * p.z)) ** 2
    if (ssr >= mejorSsr) continue
    mejorSsr = ssr
    mejor = {
      r2UnaRecta,
      corteM: corte,
      gradAbajoCkm: -ra.b * 1000,
      gradArribaCkm: -rb.b * 1000,
      tCostaC: ra.a,
      saltoC: rb.a + rb.b * corte - (ra.a + ra.b * corte),
      r2: sst > 1e-9 ? Math.max(0, 1 - ssr / sst) : 0,
      nAbajo: abajo.length,
      nArriba: arriba.length,
    }
  }
  return mejor
}

interface Perfil {
  dia: string
  horaUtc: number
  /** Estaciones que sostienen el ajuste después del rechazo. */
  n: number
  /** Candidatas antes de rechazar. */
  candidatas: number
  /** Ordenada en el origen del ajuste: la temperatura del aire a nivel del mar. */
  tCostaC: number
  /** Gradiente medido, °C/km. Positivo = se enfría al subir. */
  gradienteCkm: number
  r2: number
  sigmaC: number
  hrBaja: number | null
  hrMedia: number | null
  hrAlta: number | null
  vientoDir: number | null
  vientoMedio: number | null
  cotaTecho: number
  capas: DosCapas | null
}

function mediaONull(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/**
 * El viento medio de la red, promediado COMO VECTOR. La media aritmética de 350°
 * y 10° da 180°, que es justo el viento contrario al real.
 */
function vientoDeLaRed(
  payload: DayPayload,
  horaUtc: number,
): { dir: number | null; vel: number | null } {
  const iV = payload.columns.indexOf('windspeed')
  const iD = payload.columns.indexOf('winddirection')
  const centro = horaUtc * 60
  let x = 0
  let y = 0
  let n = 0
  let velSuma = 0
  for (const st of payload.stations) {
    let mejor: (number | null)[] | null = null
    for (const s of st.samples) {
      const m = s[0]
      if (typeof m !== 'number' || Math.abs(m - centro) > 20) continue
      if (!mejor || Math.abs(m - centro) < Math.abs((mejor[0] as number) - centro)) mejor = s
    }
    if (!mejor) continue
    const vel = mejor[iV + 1]
    const dir = mejor[iD + 1]
    if (typeof vel !== 'number' || typeof dir !== 'number' || vel <= 0.5) continue
    const rad = (dir * Math.PI) / 180
    x += Math.cos(rad)
    y += Math.sin(rad)
    velSuma += vel
    n++
  }
  if (!n) return { dir: null, vel: null }
  // Un vector resultante casi nulo significa direcciones repartidas por todo el
  // compás: ahí no hay una dirección media que signifique nada.
  const resultante = Math.hypot(x, y) / n
  return {
    dir: resultante >= 0.15 ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : null,
    vel: velSuma / n,
  }
}

function humedadPorTramos(
  estaciones: readonly Station[],
): { baja: number | null; media: number | null; alta: number | null } {
  const baja: number[] = []
  const media: number[] = []
  const alta: number[] = []
  for (const s of estaciones) {
    if (s.relativehumidity === null) continue
    if (s.elevation < 300) baja.push(s.relativehumidity)
    else if (s.elevation < 1000) media.push(s.relativehumidity)
    else alta.push(s.relativehumidity)
  }
  return { baja: mediaONull(baja), media: mediaONull(media), alta: mediaONull(alta) }
}

function perfil(
  payload: DayPayload,
  buckets: Map<number, Station[]>,
  horaUtc: number,
): Perfil | null {
  const objetivo = Date.parse(`${payload.day}T00:00:00Z`) + horaUtc * 3_600_000
  let cubo: Station[] | null = null
  let mejor = Infinity
  for (const [at, estaciones] of buckets) {
    const d = Math.abs(at - objetivo)
    if (d < mejor) {
      mejor = d
      cubo = estaciones
    }
  }
  if (!cubo || mejor > 20 * 60_000) return null

  const conTemp = cubo.filter((s) => s.temperature !== null)
  if (conTemp.length < 8) return null
  const modelo = buildModel(conTemp, 'temperature')
  const hr = humedadPorTramos(cubo)
  const viento = vientoDeLaRed(payload, horaUtc)

  return {
    dia: payload.day,
    horaUtc,
    n: modelo.used.length,
    candidatas: modelo.candidates,
    tCostaC: modelo.a,
    gradienteCkm: -modelo.b * 1000,
    r2: modelo.r2,
    sigmaC: modelo.sigma,
    hrBaja: hr.baja,
    hrMedia: hr.media,
    hrAlta: hr.alta,
    vientoDir: viento.dir,
    vientoMedio: viento.vel,
    cotaTecho: modelo.elevationRange[1],
    // Las mismas muestras que sostienen el ajuste, no todas las del cubo.
    capas: dosCapas(modelo.used.map((m) => ({ z: m.elevation, t: m.value }))),
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. INFORME
   ═══════════════════════════════════════════════════════════════════════════ */

const f1 = (v: number | null) =>
  v === null || !Number.isFinite(v) ? '  —  ' : v.toFixed(1).padStart(5)
const rumbo = (g: number | null) => {
  if (g === null) return ' — '
  const p = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
  return p[Math.round(g / 22.5) % 16].padEnd(3)
}

/** La tabla estación por estación. Es lo que hay que ver cuando el R² sale a 0. */
function imprimirDetalle(cubo: readonly Station[]) {
  console.log('    ── detalle del instante, ordenado por cota ──')
  for (const s of [...cubo].sort((a, b) => a.elevation - b.elevation)) {
    console.log(
      `      ${s.elevation.toFixed(0).padStart(6)} m  ${f1(s.temperature)} °C  ` +
        `HR ${f1(s.relativehumidity)} %  ${s.name.slice(0, 34).padEnd(34)} ${s.entityId}`,
    )
  }
}

function imprimir(p: Perfil) {
  console.log(
    `  ${p.dia} ${String(p.horaUtc).padStart(2, '0')}:00Z  ` +
      `n=${String(p.n).padStart(2)}/${String(p.candidatas).padStart(2)}  ` +
      `costa ${f1(p.tCostaC)} °C  ` +
      `grad ${f1(p.gradienteCkm)} °C/km  ` +
      `R²=${p.r2.toFixed(2)}  σ=${p.sigmaC.toFixed(2)}  ` +
      `techo ${p.cotaTecho.toFixed(0).padStart(4)} m  ` +
      `HR ${f1(p.hrBaja)}/${f1(p.hrMedia)}/${f1(p.hrAlta)} %  ` +
      `viento ${rumbo(p.vientoDir)} ${f1(p.vientoMedio)} m/s`,
  )
  if (p.capas) {
    const c = p.capas
    console.log(
      `      dos capas: corte ${c.corteM} m  ` +
        `abajo ${f1(c.gradAbajoCkm)} °C/km (n=${c.nAbajo})  ` +
        `arriba ${f1(c.gradArribaCkm)} °C/km (n=${c.nArriba})  ` +
        `salto ${f1(c.saltoC)} °C  costa ${f1(c.tCostaC)} °C  ` +
        `R²=${c.r2.toFixed(2)} (una recta ${c.r2UnaRecta.toFixed(2)})`,
    )
  }
}

async function main() {
  const dem = loadDem()
  const cotaDe = (lon: number, lat: number) => elevationAt(dem, lon, lat)

  const detalle = process.argv.includes('--detalle')
  const pedidos = process.argv.slice(2).filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  let dias = pedidos

  if (!dias.length) {
    const hoy = new Date()
    const hasta = new Date(hoy.getTime() - 2 * 86_400_000).toISOString().slice(0, 10)
    const desde = new Date(hoy.getTime() - 400 * 86_400_000).toISOString().slice(0, 10)
    console.log(`\nBUSCANDO CANDIDATOS · ${desde} → ${hasta}\n`)

    const diario = await archivoDiario(desde, hasta)
    // El archivo de calidad del aire no llega tan atrás: 92 días es su tope.
    const desdePolvo = new Date(hoy.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
    const polvo = await polvoDiario(desdePolvo, hasta)

    const esSuroeste = (d: number) => d >= 180 && d <= 270

    const calima = [...polvo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    console.log('  CALIMA · polvo en suspensión máximo del día, µg/m³')
    for (const [dia, v] of calima) {
      const dd = diario.find((x) => x.dia === dia)
      console.log(
        `    ${dia}  polvo ${v.toFixed(0).padStart(4)}  ` +
          `tMax ${f1(dd?.tMax ?? null)} °C  viento ${rumbo(dd?.vientoDir ?? null)}`,
      )
    }

    const temporales = diario
      .filter((d) => d.lluviaMm >= 8 && esSuroeste(d.vientoDir))
      .sort((a, b) => b.lluviaMm - a.lluviaMm)
      .slice(0, 5)
    console.log('\n  TEMPORAL DEL SUROESTE · lluvia ≥ 8 mm y viento dominante del SO')
    for (const d of temporales) {
      console.log(
        `    ${d.dia}  lluvia ${d.lluviaMm.toFixed(1).padStart(5)} mm  ` +
          `viento ${rumbo(d.vientoDir)} ${f1(d.vientoMax)} m/s  tMax ${f1(d.tMax)} °C`,
      )
    }

    const nubes = await archivoNubeBaja(desde, hasta)
    const porDia = new Map(diario.map((d) => [d.dia, d]))

    // La distribución antes que el umbral: sin verla, cualquier corte es una
    // corazonada, y la primera tanda de filtros no dejó pasar ni un día.
    const cuantil = (xs: number[], q: number) => {
      const o = xs.slice().sort((a, b) => a - b)
      return o[Math.min(o.length - 1, Math.floor(q * o.length))]
    }
    const nbs = nubes.map((v) => v.nubeBaja)
    console.log(`\n  DISTRIBUCIÓN · ${nubes.length} días (p10 / mediana / p90)`)
    console.log(
      `    nube baja  ${f1(cuantil(nbs, 0.1))} /${f1(cuantil(nbs, 0.5))} /${f1(cuantil(nbs, 0.9))} %`,
    )

    const candidatosAlisio = nubes
      .filter((v) => {
        const d = porDia.get(v.dia)
        if (!d) return false
        // Nube baja por encima de la mediana, sin lluvia y flujo del primer
        // cuadrante: los tres rasgos del alisio que el reanálisis sí ve.
        return (
          v.nubeBaja >= cuantil(nbs, 0.75) &&
          d.lluviaMm < 0.2 &&
          d.vientoDir >= 0 &&
          d.vientoDir <= 100 &&
          (polvo.get(v.dia) ?? 0) < 25
        )
      })
      .sort((a, b) => b.nubeBaja - a.nubeBaja)
    console.log('\n  ALISIO · candidatos por nube baja, sin lluvia, del primer cuadrante y sin polvo')
    for (const v of candidatosAlisio.slice(0, 6)) {
      const d = porDia.get(v.dia)!
      console.log(
        `    ${v.dia}  nube baja ${f1(v.nubeBaja)} %  HR2m ${f1(v.hr2m)} %  ` +
          `viento ${rumbo(d.vientoDir)} ${f1(d.vientoMax)} m/s  tMax ${f1(d.tMax)} °C  ` +
          `polvo ${(polvo.get(v.dia) ?? 0).toFixed(0)}`,
      )
    }

    const nochesClaras = nubes
      .filter((v) => {
        const d = porDia.get(v.dia)
        if (!d) return false
        // Sin nube baja, sin lluvia y con poco viento: la noche en que el aire
        // frío se encharca en los barrancos y la inversión es la del suelo.
        return v.nubeBaja <= cuantil(nbs, 0.1) && d.lluviaMm < 0.2 && d.vientoMax <= 12
      })
      .sort((a, b) => a.nubeBaja - b.nubeBaja)
    console.log('\n  NOCHE DESPEJADA · sin nube baja, sin lluvia y con viento flojo')
    for (const v of nochesClaras.slice(0, 6)) {
      const d = porDia.get(v.dia)!
      console.log(
        `    ${v.dia}  nube baja ${f1(v.nubeBaja)} %  viento ${rumbo(d.vientoDir)} ${f1(d.vientoMax)} m/s  ` +
          `tMin ${f1(d.tMin)} °C  polvo ${(polvo.get(v.dia) ?? 0).toFixed(0)}`,
      )
    }

    dias = [
      ...new Set(
        [
          calima[0]?.[0],
          temporales[0]?.dia,
          ...candidatosAlisio.slice(0, 3).map((v) => v.dia),
          ...nochesClaras.slice(0, 2).map((v) => v.dia),
        ].filter(
          (d): d is string => typeof d === 'string',
        ),
      ),
    ]
    console.log(`\n  Finalistas a medir contra la red del Cabildo: ${dias.join(', ')}`)
  }

  console.log('\nPERFILES MEDIDOS · motor de la aplicación, cotas del DEM de public/dem/\n')
  for (const dia of dias) {
    let payload: DayPayload
    try {
      payload = await diaCabildo(dia)
    } catch (e) {
      console.log(`  ${dia}  no se pudo pedir: ${(e as Error).message}`)
      continue
    }

    // Las averiadas se apartan igual que en producción, y se dice cuáles: un
    // sensor excluido en silencio es un dato que desaparece sin explicación.
    const diagnostico = diagnoseNetwork(pistas(payload, cotaDe))
    const averiadas = new Set(
      [...diagnostico.values()].filter((d) => d.faulty).map((d) => d.entityId),
    )
    const nombre = new Map(payload.stations.map((s) => [s.entityId, s.name]))
    console.log(
      `  ── ${dia} · ${payload.stations.length} estaciones, ${averiadas.size} apartadas por avería ──`,
    )
    for (const id of averiadas) {
      const faltas = diagnostico.get(id)!.faults.map((f) => `${f.kind} ${f.measured.toFixed(1)}`)
      console.log(`      apartada: ${(nombre.get(id) ?? id).slice(0, 34).padEnd(34)} ${faltas.join(', ')}`)
    }

    const buckets = bucketize([payload], cotaDe, 30, averiadas)
    // Cuatro horas: madrugada, mañana, la punta de calor y el anochecer.
    for (const hora of [5, 9, 14, 19]) {
      const p = perfil(payload, buckets, hora)
      if (p) imprimir(p)
      else console.log(`  ${dia} ${String(hora).padStart(2, '0')}:00Z  sin red suficiente`)
    }
    if (detalle) {
      const objetivo = Date.parse(`${dia}T00:00:00Z`) + 9 * 3_600_000
      const cubo = buckets.get(objetivo)
      if (cubo) imprimirDetalle(cubo)
    }
    console.log('')
  }
}

await main()
