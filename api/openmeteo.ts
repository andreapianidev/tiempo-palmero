/**
 * Proxy de Open-Meteo.
 *
 * POR QUÉ, SI OPEN-METEO SÍ MANDA CORS. Justamente por eso: como la llamada
 * directa desde el navegador funciona, la app la hacía directa, y eso significa
 * que **cada pestaña abierta pedía por su cuenta**. El Cabildo lleva desde el
 * principio un proxy que concentra el tráfico de todos los visitantes en una
 * petición cacheada (`api/cda.ts`); Open-Meteo no lo tenía, y era la única
 * fuente de la aplicación sin ningún tipo de cache delante.
 *
 * QUÉ PASÓ. El 13 de agosto de 2026, en mitad de una sesión de desarrollo,
 * `api.open-meteo.com` empezó a contestar **429 Too Many Requests** a las tres
 * peticiones que hace la app —superficie, sondeo y viento—. No fue el Cabildo:
 * las tres URL de la consola eran de Open-Meteo. El plan gratuito limita por
 * IP y por minuto, y el recargado en cadena de `npm run dev` —cada guardado
 * remonta la aplicación y vuelve a disparar las tres— se lo come.
 *
 * Y no era solo cosa del desarrollo. En producción cada visitante gastaba
 * cuota desde su propia IP, así que nadie veía el problema… hasta que dos
 * personas comparten salida a internet, que en un hotel o en una oficina es lo
 * normal. Con el proxy delante, mil visitantes son una petición por ventana.
 *
 * LAS TRES LLAMADAS NO PESAN IGUAL, y por eso la frescura va por `kind` y no
 * por una constante única: Open-Meteo cobra por coordenadas y por variables, y
 * el sondeo pide 25 variables en 4 columnas mientras el viento pide 2 en 54
 * puntos.
 */

export const config = { runtime: 'edge' }

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast'

/**
 * Qué pide cada parte de la aplicación y cuánto aguanta en cache.
 *
 * Los modelos globales que alimentan esto (ICON, GFS) publican pasada horaria;
 * cachear cinco minutos no pierde ni un dato y divide el tráfico por el número
 * de visitantes. El sondeo va a diez porque su pasada es la misma y su coste
 * por llamada es el más alto de los tres.
 */
const TTL_SECONDS: Record<string, number> = {
  /** Anclas de superficie: sesgo del modelo en el punto de cada estación. */
  surface: 300,
  /** Sondeo vertical: la inversión del alisio y el mar de nubes. */
  profile: 600,
  /** Rejilla de viento de fondo, donde no llega ninguna estación. */
  wind: 300,
  /** Evapotranspiración de referencia, que se refresca una vez al día. */
  eto: 3600,
}

/**
 * Parámetros que se dejan pasar. Lista blanca, no lista negra: un proxy que
 * reenvía lo que le echen es un proxy abierto, y eso es un servicio de otra
 * persona pagado con la cuota de esta.
 */
const ALLOWED = new Set([
  'latitude',
  'longitude',
  'elevation',
  'current',
  'hourly',
  'daily',
  'models',
  'timezone',
  'wind_speed_unit',
  'past_days',
  'forecast_days',
  'cell_selection',
])

/**
 * Tope de coordenadas por petición.
 *
 * La llamada más gorda que hace la app es la rejilla de viento, con 54 puntos.
 * 128 deja sitio para que crezca al doble sin tocar esto y sigue estando lejos
 * de lo que convertiría el proxy en un grifo para descargar medio Atlántico.
 */
const MAX_POINTS = 128

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
  const kind = url.searchParams.get('kind') ?? ''
  const ttl = TTL_SECONDS[kind]
  if (ttl === undefined) return json({ error: 'kind no permitido' }, 400)

  const upstream = new URLSearchParams()
  for (const [k, v] of url.searchParams) {
    if (k === 'kind') continue
    if (!ALLOWED.has(k)) return json({ error: `parámetro no permitido: ${k}` }, 400)
    upstream.set(k, v)
  }

  // Latitud y longitud tienen que venir en la misma cantidad: una lista más
  // corta que la otra no da error en el origen, da una respuesta emparejada al
  // revés — que es peor que un fallo, porque parece un dato.
  const lats = (upstream.get('latitude') ?? '').split(',').filter(Boolean)
  const lons = (upstream.get('longitude') ?? '').split(',').filter(Boolean)
  if (!lats.length || lats.length !== lons.length) {
    return json({ error: 'latitude y longitude deben traer el mismo número de puntos' }, 400)
  }
  if (lats.length > MAX_POINTS) {
    return json({ error: `demasiados puntos: ${lats.length} > ${MAX_POINTS}` }, 400)
  }

  // Se reintenta el 429 con espera creciente. Es un límite por ventana, no un
  // veto: esperar es literalmente lo que pide la respuesta, y hacerlo aquí —una
  // vez, en el edge— evita que lo hagan a la vez todos los navegadores.
  let lastError = 'sin respuesta'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${UPSTREAM}?${upstream}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) return json(await res.json(), 200, ttl)
      lastError = `origen HTTP ${res.status}`
      if (res.status !== 429 && res.status < 500) break
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
    }
  }

  return json(
    { error: 'Open-Meteo no disponible', detail: lastError, upstreamDown: true },
    503,
  )
}
