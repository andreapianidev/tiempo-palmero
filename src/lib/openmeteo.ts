/**
 * Anclas de modelo por encima del techo de la red.
 *
 * EL PROBLEMA. El Cabildo tiene registrada una estación en la cumbre
 * —`Taburiente`, 2316 m— pero su última lectura es del 10 de mayo de 2023:
 * lleva más de tres años muerta. `Tenerra` (1104 m) desde abril de 2024 y
 * `Cumbre Nueva` (1395 m) desde febrero de 2026. Lo que de verdad publica hoy
 * llega como mucho a 1561 m, y La Palma sube hasta 2426.
 *
 * Resultado medido el 12 ago 2026: por encima del techo el motor dejaba de
 * interpolar entre medidas y prolongaba una recta, y en el único punto donde
 * eso se puede contrastar —la estación de 1561 m, dejándola fuera del ajuste—
 * decía 100 % de humedad contra el 11 % que marcaba el sensor. El 31 % de la
 * isla estaba en esa situación.
 *
 * LA REGLA, que no se negocia:
 *
 *   1. **Las estaciones del Cabildo mandan siempre.** El gradiente, el rechazo
 *      de anomalías y los residuos se calculan SOLO con ellas. Nada de esto
 *      entra en ese cálculo: `buildModel` ajusta la recta sin ver una sola
 *      ancla, así que las métricas del panel siguen describiendo la red real.
 *   2. Las anclas solo existen **por encima del techo de la red**, que es
 *      justo donde no hay nada que reemplazar.
 *   3. Se etiquetan **siempre** como Open-Meteo, nunca como Cabildo. En la
 *      lista de estaciones que sostienen un punto, en el panel y en fuentes.
 *
 * Por qué funciona sin tocar el motor: el ancla entra en el campo de residuos
 * como una muestra más, y la distancia efectiva del IDW ya mezcla horizontal y
 * desnivel (`hypot(d, Δz/100)`). Un punto en la cumbre tiene el ancla a Δz=0 y
 * la estación real 865 m más abajo, así que manda el ancla; un punto a la
 * altura de las estaciones tiene el ancla a 8,6 km efectivos y mandan ellas.
 * El relevo lo hace la geometría, no un `if`.
 *
 * Open-Meteo es un MODELO (mezcla ICON/GFS/ECMWF), no una medida, y por eso no
 * se le deja tocar el ajuste. Es keyless y sin registro, y envía
 * `Access-Control-Allow-Origin: *`, así que **se podía** llamar desde el
 * navegador sin proxy — y así se hacía. Ya no: el 13 de agosto de 2026
 * contestó 429 a las tres llamadas de la aplicación, porque su plan gratuito
 * limita por IP y sin proxy cada pestaña pide por su cuenta. Ahora va por
 * `api/openmeteo.ts`, cacheada, igual que el Cabildo.
 *
 * DE DÓNDE SALE EL VALOR DEL ANCLA. Ya no de `temperature_2m`, sino del perfil
 * vertical (`profile.ts`). El valor de superficie con `elevation=` forzada era
 * la temperatura de la celda trasladada con un gradiente CONSTANTE de
 * −0,65 K/100 m, aplicado a través de la inversión del alisio, donde el
 * gradiente real llega a ser positivo. Contrastado contra la estación real del
 * Roque (TNG, 2387 m) sobre 24 h: **8,20 K de error medio con la superficie,
 * 1,27 K con el perfil**. Y la humedad de superficie no era imprecisa sino
 * constante —el modelo no la ajusta en altura en absoluto—, así que las anclas
 * de humedad no llevaban ninguna información vertical.
 *
 * `fetchAnchors` sigue existiendo, pero ya solo para lo que sí es un valor de
 * superficie: comparar el modelo con las estaciones EN SU PROPIO PUNTO, que es
 * como se mide el sesgo que calibra la banda de incertidumbre.
 */

import type { Dem } from './dem'
import { SEA_LEVEL_M } from './dem'
import { dataUrl } from './endpoints'
import { pixelXToLon, pixelYToLat } from './geo'
import { fetchProfiles, humidityAt, sampleProfile, type VerticalProfile } from './profile'

/**
 * Ya NO se llama a `api.open-meteo.com` desde el navegador.
 *
 * Se llamaba, porque Open-Meteo sí manda CORS y la llamada directa funciona; y
 * precisamente por funcionar, cada pestaña abierta pedía por su cuenta y el
 * límite por IP del plan gratuito acabó contestando 429. Ahora va por
 * `api/openmeteo.ts`, que cachea igual que el proxy del Cabildo. El `kind` es
 * lo que decide la frescura al otro lado.
 */
export const OPEN_METEO_URL = () => dataUrl('/api/openmeteo?kind=surface')
/** Nombre con el que se presenta en cualquier sitio donde salga una fuente. */
export const MODEL_SOURCE_LABEL = 'Open-Meteo'

export interface Anchor {
  lon: number
  lat: number
  elevation: number
  temperature: number | null
  relativehumidity: number | null
  /** Instante de la pasada del modelo (epoch ms, UTC). */
  observedAt: number
}

/**
 * Ancla leída del PERFIL VERTICAL, no de la superficie. Lleva además el
 * diagnóstico de la inversión, para que la interfaz pueda decir por qué el mapa
 * de arriba no es la prolongación del de abajo.
 */
export interface ProfileAnchor extends Anchor {
  profile: VerticalProfile
}

/**
 * Elige puntos altos y separados entre sí sobre el propio DEM.
 *
 * No se cablean coordenadas de cumbres: una lista escrita a mano envejece y se
 * equivoca de altitud. Se cogen las celdas por encima de `aboveM` y se van
 * tomando de forma voraz las más altas que estén a más de `minSpacingKm` de las
 * ya elegidas, para no gastar las cuatro consultas en el mismo risco.
 */
export function pickHighAnchors(
  dem: Dem,
  aboveM: number,
  count = 4,
  minSpacingKm = 3,
): { lon: number; lat: number; elevation: number }[] {
  const { zoom } = dem.manifest
  const candidates: { lon: number; lat: number; elevation: number }[] = []
  // Un paso de 8 píxeles (~268 m) basta: buscamos cumbres, no detalle.
  const step = 8
  for (let j = 0; j < dem.height; j += step) {
    for (let i = 0; i < dem.width; i += step) {
      const h = dem.heights[j * dem.width + i]
      if (h <= SEA_LEVEL_M || h <= aboveM) continue
      candidates.push({
        lon: pixelXToLon(dem.originX + i, zoom),
        lat: pixelYToLat(dem.originY + j, zoom),
        elevation: h,
      })
    }
  }
  candidates.sort((a, b) => b.elevation - a.elevation)

  const chosen: { lon: number; lat: number; elevation: number }[] = []
  // Grados aproximados: 1° lat ≈ 111 km; en longitud, corregido por la latitud.
  const minDeg = minSpacingKm / 111
  for (const c of candidates) {
    if (chosen.length >= count) break
    const far = chosen.every((p) => {
      const dLat = p.lat - c.lat
      const dLon = (p.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180)
      return Math.hypot(dLat, dLon) >= minDeg
    })
    if (far) chosen.push(c)
  }
  return chosen
}

/**
 * Anclas por encima del techo de la red, leídas del perfil vertical.
 *
 * Cada punto se muestrea a SU altitud dentro del perfil de su propia columna, y
 * la humedad se recompone de la temperatura y el punto de rocío en vez de
 * transportarse. Un punto sin los dos valores no produce ancla: es preferible
 * que el motor vuelva a extrapolar —que es lo que hacía antes— a colocar arriba
 * una cifra que no se sostiene.
 *
 * Si Open-Meteo falla, esto devuelve una lista vacía y no pasa nada más. Nunca
 * tumba la aplicación.
 */
export async function fetchProfileAnchors(
  points: readonly { lon: number; lat: number; elevation: number }[],
  signal?: AbortSignal,
): Promise<ProfileAnchor[]> {
  const profiles = await fetchProfiles(points, signal)
  // Emparejado por COORDENADA, nunca por índice: `fetchProfiles` descarta las
  // columnas que llegan sin hora legible o con menos de dos niveles, así que la
  // lista puede venir más corta y un `points[i]` estaría dando a un ancla la
  // altitud de otro punto, en silencio.
  const key = (lon: number, lat: number) => `${lon.toFixed(5)},${lat.toFixed(5)}`
  const byPoint = new Map(points.map((p) => [key(p.lon, p.lat), p]))

  const out: ProfileAnchor[] = []
  profiles.forEach((profile) => {
    const p = byPoint.get(key(profile.lon, profile.lat))
    if (!p) return
    const temperature = sampleProfile(profile, p.elevation, 'temperature')
    const relativehumidity = humidityAt(profile, p.elevation)
    if (temperature === null && relativehumidity === null) return
    out.push({
      lon: p.lon,
      lat: p.lat,
      elevation: p.elevation,
      temperature,
      relativehumidity,
      observedAt: profile.observedAt,
      profile,
    })
  })
  return out
}

/**
 * `current.time` llega en UTC pero SIN sufijo de zona (`2026-08-12T13:00`), y
 * sin la Z el navegador lo leería como hora local — una hora de desfase en
 * Canarias en verano. Se completan los segundos solo si faltan.
 *
 * Si no se puede leer se devuelve NaN y arriba se descarta el ancla, en vez de
 * caer en `Date.now()`: eso presentaría una pasada de modelo de hace una hora
 * como recién medida, que es justo la mentira que la app no cuenta.
 */
export function parseModelTime(time: string | undefined): number {
  if (!time) return NaN
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(time)
  if (!m) return NaN
  return Date.parse(`${m[1]}${m[2] ?? ':00'}Z`)
}

/**
 * Pide a Open-Meteo las condiciones actuales en esos puntos, forzando la
 * altitud real de cada uno (`elevation=`) para que el modelo baje a la cota del
 * DEM en vez de a la media de su celda, que en una isla de 42 km se queda muy
 * corta.
 */
export async function fetchAnchors(
  points: readonly { lon: number; lat: number; elevation: number }[],
  signal?: AbortSignal,
): Promise<Anchor[]> {
  if (!points.length) return []
  const url =
    `${OPEN_METEO_URL()}&latitude=${points.map((p) => p.lat.toFixed(5)).join(',')}` +
    `&longitude=${points.map((p) => p.lon.toFixed(5)).join(',')}` +
    `&elevation=${points.map((p) => Math.round(p.elevation)).join(',')}` +
    `&current=temperature_2m,relative_humidity_2m&timezone=UTC`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`)
  const body = await res.json()
  // Con un solo punto la API devuelve un objeto; con varios, un array.
  const blocks: unknown[] = Array.isArray(body) ? body : [body]

  const out: Anchor[] = []
  blocks.forEach((raw, i) => {
    const b = raw as {
      elevation?: number
      current?: { time?: string; temperature_2m?: number; relative_humidity_2m?: number }
    }
    const c = b.current
    const p = points[i]
    if (!c || !p) return
    const at = parseModelTime(c.time)
    // Sin hora fiable no hay ancla: mejor extrapolar que fechar mal.
    if (!Number.isFinite(at)) return
    out.push({
      lon: p.lon,
      lat: p.lat,
      // La que el modelo dice haber usado, si la devuelve; si no, la pedida.
      elevation: Number.isFinite(b.elevation) ? (b.elevation as number) : p.elevation,
      temperature: Number.isFinite(c.temperature_2m) ? (c.temperature_2m as number) : null,
      relativehumidity: Number.isFinite(c.relative_humidity_2m)
        ? (c.relative_humidity_2m as number)
        : null,
      observedAt: at,
    })
  })
  return out
}
