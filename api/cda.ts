/**
 * Proxy de la API del Cabildo.
 *
 * Existe por dos motivos, en este orden:
 *
 *  1. `bi.lapalma.es` no manda ninguna cabecera CORS (comprobado el 12 ago
 *     2026 con `Origin:` explícito), así que desde el navegador la llamada
 *     directa es imposible. No es una preferencia de arquitectura.
 *  2. Concentra todo el tráfico de la app en una petición cacheada por
 *     despliegue en vez de una por visitante. La API del Cabildo es un
 *     servicio público pequeño que ya se cae solo; no se le manda una
 *     estampida.
 *
 * Aquí NO se filtra ni se transforma nada: el control de calidad vive en el
 * cliente, donde está el DEM y donde se puede enseñar el censo del descarte.
 * Este fichero solo reenvía bytes y los cachea.
 */

export const config = { runtime: 'edge' }

const PENTAHO = 'https://bi.lapalma.es/pentaho/plugin/cda/api/doQuery'
const TRUST_USER = 'opendata_sc_lapalma'

const VERTICALS = new Set([
  'environment',
  'skyobservation',
  'fireforest',
  'agro',
  'energyefficiency',
  'count',
])

/** Solo los endpoints que la app usa. Un proxy abierto es de otra persona. */
const ALLOWED = new Set([
  'weatherobserved_lastdata',
  'weatherobserved_stations',
  'airqualityobserved_lastdata',
  'skyobservation_lastdata',
  'fireforest_lastdata',
  'count_today',
  'count_historic',
  'count_locations',
])

const PASSTHROUGH = ['paramstart', 'paramfinish', 'paramname', 'paramcountertype']

/**
 * Frescuras distintas por red. El meteo se refresca cada ~10 min en origen,
 * así que cachearlo 5 no pierde nada y divide la carga por el número de
 * visitantes. Las cámaras de incendios van mucho más cortas: son una alerta.
 */
const TTL_SECONDS: Record<string, number> = {
  weatherobserved_lastdata: 300,
  weatherobserved_stations: 86_400,
  airqualityobserved_lastdata: 300,
  skyobservation_lastdata: 600,
  fireforest_lastdata: 60,
  // Los aforos publican un intervalo de unos cinco minutos; cachear ese pulso
  // más que eso sería enseñar como «ahora» un intervalo ya cerrado.
  count_today: 300,
  // El acumulado del día en curso sube despacio y los días pasados no cambian
  // nunca. El inventario de aforos es una lista de sitios, no una medida.
  count_historic: 900,
  count_locations: 86_400,
}

function json(body: unknown, status: number, cacheSeconds = 0): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheSeconds
        ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`
        : 'no-store',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const vertical = url.searchParams.get('vertical') ?? 'environment'
  const dataAccessId = url.searchParams.get('dataAccessId') ?? ''

  if (!VERTICALS.has(vertical)) return json({ error: 'vertical no permitido' }, 400)
  if (!ALLOWED.has(dataAccessId)) return json({ error: 'dataAccessId no permitido' }, 400)

  const upstream = new URLSearchParams({
    path: `/public/sc_lapalma/verticals/sql/${vertical}.cda`,
    _TRUST_USER_: TRUST_USER,
    dataAccessId,
    outputType: 'json',
  })
  // `paramstart` sin `paramfinish` devuelve 0 filas con esquema válido, que
  // parece un archivo vacío y no lo es. Si llega uno solo, se rechaza aquí en
  // vez de servir una mentira con forma de respuesta correcta.
  const hasStart = url.searchParams.has('paramstart')
  const hasFinish = url.searchParams.has('paramfinish')
  if (hasStart !== hasFinish) {
    return json(
      { error: 'paramstart y paramfinish deben ir siempre juntos' },
      400,
    )
  }
  for (const k of PASSTHROUGH) {
    const v = url.searchParams.get(k)
    if (v !== null) upstream.set(k, v)
  }

  const ttl = TTL_SECONDS[dataAccessId] ?? 300

  // El origen devuelve a ratos 200 OK con un HTML «Unavailable» en el cuerpo.
  // Eso es «servicio caído, reintenta», no «no hay datos», y la diferencia
  // importa cuando lo que hay al otro lado es una alerta de incendio.
  let lastError = 'sin respuesta'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${PENTAHO}?${upstream}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        lastError = `origen HTTP ${res.status}`
        continue
      }
      const text = await res.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        lastError = 'el origen devolvió HTML en lugar de JSON'
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
        continue
      }
      const p = parsed as { metadata?: unknown; resultset?: unknown }
      if (!Array.isArray(p.metadata) || !Array.isArray(p.resultset)) {
        lastError = 'respuesta sin metadata/resultset'
        continue
      }
      return json(parsed, 200, ttl)
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }

  return json(
    { error: 'servicio del Cabildo no disponible', detail: lastError, upstreamDown: true },
    503,
  )
}
