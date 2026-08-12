/**
 * Histórico meteorológico, un día por petición.
 *
 * POR QUÉ NO PASA POR `/api/cda`. Ese proxy reenvía bytes tal cual, y aquí eso
 * no vale: `weatherobserved` devuelve **2,0 MB y ~5000 filas por día** (medido
 * el 12 ago 2026 sobre el 5 y el 9 de agosto: 1965 KB / 4914 filas y 2029 KB /
 * 5065 filas, ~3 s cada uno). Una semana serían 14 MB al navegador por cada
 * visita que abra una gráfica. Aquí se recorta a las columnas que la gráfica
 * dibuja y se reescribe en un formato compacto: **260 KB por día**, y 45 KB si
 * se piden medias horarias.
 *
 * POR QUÉ NO HAY BASE DE DATOS. No hace falta ninguna. El archivo ya vive en la
 * API del Cabildo, y un día pasado no cambia nunca: se cachea en el CDN 30 días
 * y el coste upstream se paga una vez por día y región, no una por visitante.
 * Guardarlo por nuestra cuenta solo añadiría una copia que se desincroniza.
 *
 * EL FILTRO POR ESTACIÓN NO EXISTE EN ORIGEN: `paramname=CABLPA-ELCHARCO`
 * devuelve exactamente las mismas 4939 filas que sin él (comprobado). Por eso
 * se sirve el día entero con todas las estaciones y el recorte lo hace el
 * cliente: pedir upstream una vez por estación multiplicaría por 38 la carga
 * sobre un servicio público pequeño que ya se cae solo.
 */

export const config = { runtime: 'edge' }

const PENTAHO = 'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery'
const TRUST_USER = 'opendata_sc_lapalma'

/**
 * Las columnas que la gráfica dibuja, en el orden en que salen en `samples`.
 *
 * La presión se queda fuera a propósito: la API mezcla presión absoluta y
 * reducida al nivel del mar, y distinguirlas exige la referencia de las
 * estaciones de costa de ESE instante (ver `seaLevelReference` en
 * `psychro.ts`). Servir aquí la cruda invitaría a dibujar una serie que mezcla
 * dos convenciones.
 */
const SERIES_COLUMNS = [
  'temperature',
  'relativehumidity',
  'dewpoint',
  'windspeed',
  'winddirection',
] as const

/** Un día que ya terminó es inmutable: se cachea agresivamente. */
const TTL_PAST_DAYS = 30 * 24 * 3600
const TTL_TODAY = 300
/** Hasta dónde hacia atrás se admite. Acota la superficie del endpoint. */
const MAX_DAYS_BACK = 120

interface Sample {
  /** Minutos desde las 00:00 UTC del día pedido, 0–1439. */
  m: number
  values: (number | null)[]
}

interface StationSeries {
  entityId: string
  name: string
  lon: number
  lat: number
  samples: (number | null)[][]
}

function json(body: unknown, status: number, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds
        ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${Math.round(cacheSeconds / 2)}`
        : 'no-store',
    },
  })
}

/** `2026-08-11` → epoch ms de las 00:00 UTC. `NaN` si no es una fecha válida. */
function parseDay(day: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NaN
  const t = Date.parse(`${day}T00:00:00Z`)
  // `Date.parse` acepta 2026-02-31 y lo desplaza a marzo. Se comprueba la
  // ida y vuelta para que una fecha inventada no se sirva como si existiera.
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day ? t : NaN
}

function dayAfter(day: string): string {
  return new Date(parseDay(day) + 86_400_000).toISOString().slice(0, 10)
}

/**
 * `2026-08-11 14:23:07.0` → epoch ms UTC. Es el mismo formato que usa
 * `parseTimeinstant` en el cliente; aquí se repite porque una función edge no
 * comparte bundle con `src/`.
 */
function parseTimeinstant(v: unknown): number {
  if (typeof v !== 'string') return NaN
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(v)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

function parseLocation(v: unknown): [number, number] | null {
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

/**
 * Media de un tramo. La dirección del viento se promedia como VECTOR, nunca
 * como número: la media aritmética de 350° y 10° da 180°, que es exactamente
 * el viento contrario al real.
 */
function averageSlot(rows: Sample[], colIndex: number, isDirection: boolean): number | null {
  if (isDirection) {
    let x = 0
    let y = 0
    let n = 0
    for (const r of rows) {
      const d = r.values[colIndex]
      if (d === null) continue
      const rad = (d * Math.PI) / 180
      x += Math.cos(rad)
      y += Math.sin(rad)
      n++
    }
    if (!n) return null
    // Un vector resultante casi nulo significa direcciones repartidas por todo
    // el compás: ahí no hay una dirección media que signifique algo.
    if (Math.hypot(x, y) / n < 0.15) return null
    const deg = (Math.atan2(y, x) * 180) / Math.PI
    return Math.round((deg + 360) % 360)
  }
  let sum = 0
  let n = 0
  for (const r of rows) {
    const v = r.values[colIndex]
    if (v === null) continue
    sum += v
    n++
  }
  return n ? Math.round((sum / n) * 10) / 10 : null
}

/** Agrupa las muestras de una estación en tramos de `stepMin` minutos. */
function downsample(samples: Sample[], stepMin: number): Sample[] {
  const slots = new Map<number, Sample[]>()
  for (const s of samples) {
    const slot = Math.floor(s.m / stepMin) * stepMin
    const list = slots.get(slot)
    if (list) list.push(s)
    else slots.set(slot, [s])
  }
  return [...slots.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([m, rows]) => ({
      m,
      values: SERIES_COLUMNS.map((c, i) => averageSlot(rows, i, c === 'winddirection')),
    }))
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const day = url.searchParams.get('day') ?? ''
  const stepRaw = url.searchParams.get('step')

  const dayStart = parseDay(day)
  if (!Number.isFinite(dayStart)) return json({ error: 'day debe ser YYYY-MM-DD' }, 400)

  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  if (day > todayKey) return json({ error: 'day está en el futuro' }, 400)
  if ((Date.parse(`${todayKey}T00:00:00Z`) - dayStart) / 86_400_000 > MAX_DAYS_BACK) {
    return json({ error: `day no puede ser anterior a ${MAX_DAYS_BACK} días` }, 400)
  }

  // Solo dos cadencias: la cruda (~10 min) para el día, y la horaria para la
  // semana. Un parámetro libre multiplicaría las variantes en el CDN sin que
  // ninguna gráfica lo pida.
  if (stepRaw !== null && stepRaw !== '60') {
    return json({ error: 'step solo admite 60' }, 400)
  }
  const stepMin = stepRaw === '60' ? 60 : 0

  const upstream = new URLSearchParams({
    path: '/public/sc_lapalma/verticals/sql/environment.cda',
    _TRUST_USER_: TRUST_USER,
    dataAccessId: 'weatherobserved',
    outputType: 'json',
    // Los dos SIEMPRE juntos: con solo `paramstart` el origen devuelve 0 filas
    // con esquema válido, que parece un archivo vacío y no lo es.
    paramstart: day,
    paramfinish: dayAfter(day),
  })

  let lastError = 'sin respuesta'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${PENTAHO}?${upstream}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(45_000),
      })
      if (!res.ok) {
        lastError = `origen HTTP ${res.status}`
        continue
      }
      const text = await res.text()
      let parsed: { metadata?: unknown; resultset?: unknown }
      try {
        parsed = JSON.parse(text)
      } catch {
        // El origen devuelve a ratos 200 OK con un HTML «Unavailable».
        lastError = 'el origen devolvió HTML en lugar de JSON'
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        continue
      }
      if (!Array.isArray(parsed.metadata) || !Array.isArray(parsed.resultset)) {
        lastError = 'respuesta sin metadata/resultset'
        continue
      }

      const body = compact(
        parsed.metadata as { colName: string; colIndex: number }[],
        parsed.resultset as unknown[][],
        day,
        dayStart,
        stepMin,
      )
      return json(body, 200, day === todayKey ? TTL_TODAY : TTL_PAST_DAYS)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }

  return json(
    { error: 'servicio del Cabildo no disponible', detail: lastError, upstreamDown: true },
    503,
  )
}

/**
 * De 2 MB de CDA a la forma que dibuja la gráfica.
 *
 * Se mapea por `colIndex`, no por nombre: `weatherobserved` ha llegado a
 * repetir `precipitationintensity` en dos índices distintos, y buscar por
 * nombre coge el equivocado.
 */
function compact(
  metadata: { colName: string; colIndex: number }[],
  resultset: unknown[][],
  day: string,
  dayStart: number,
  stepMin: number,
) {
  const at = (name: string): number => {
    const m = metadata.find((c) => c.colName === name)
    return m ? m.colIndex : -1
  }
  const iTime = at('timeinstant')
  const iId = at('entityid')
  const iName = at('name')
  const iLoc = at('location')
  const iCols = SERIES_COLUMNS.map((c) => at(c))

  const byStation = new Map<string, { series: StationSeries; samples: Sample[] }>()
  const dayEnd = dayStart + 86_400_000

  for (const row of resultset) {
    const t = parseTimeinstant(row[iTime])
    // El rango pedido incluye la medianoche del día siguiente; esa muestra
    // pertenece al día siguiente y aquí sobra.
    if (!Number.isFinite(t) || t < dayStart || t >= dayEnd) continue
    const id = String(row[iId] ?? '')
    if (!id) continue

    let entry = byStation.get(id)
    if (!entry) {
      const loc = parseLocation(row[iLoc])
      if (!loc) continue
      entry = {
        series: {
          entityId: id,
          name: String(row[iName] ?? 'Estación').replace(/_/g, ' '),
          lon: Math.round(loc[0] * 1e5) / 1e5,
          lat: Math.round(loc[1] * 1e5) / 1e5,
          samples: [],
        },
        samples: [],
      }
      byStation.set(id, entry)
    }
    entry.samples.push({
      m: Math.floor((t - dayStart) / 60_000),
      values: iCols.map((i) => {
        const v = i >= 0 ? row[i] : null
        return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null
      }),
    })
  }

  const stations: StationSeries[] = []
  for (const { series, samples } of byStation.values()) {
    samples.sort((a, b) => a.m - b.m)
    const final = stepMin ? downsample(samples, stepMin) : samples
    // Una estación sin una sola cifra en todo el día no es una serie: es una
    // fila de nulos que la gráfica tendría que descartar igualmente.
    if (!final.some((s) => s.values.some((v) => v !== null))) continue
    series.samples = final.map((s) => [s.m, ...s.values])
    stations.push(series)
  }

  return {
    day,
    /** Minutos entre muestras. 0 = la cadencia cruda de cada estación. */
    step: stepMin,
    /** Qué es cada posición de `samples` después del minuto. */
    columns: SERIES_COLUMNS,
    stations,
  }
}
