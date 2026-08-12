/**
 * «¿Qué hay aquí?» — consulta de proximidad sobre las capas del Cabildo.
 *
 * El criterio para que una capa entre en este módulo es uno solo: que responda
 * a algo que uno se pregunta EN el punto que acaba de tocar. Un sendero, un
 * refugio o una parada de guagua lo hacen. Un presupuesto municipal no, por
 * interesante que sea — no tiene un sitio que le importe a nadie.
 *
 * Las capas se cargan bajo demanda, no al arrancar: son 10 MB en total y la
 * mayoría de las visitas nunca tocan el mapa.
 */

import { haversineKm, type LonLat } from './geo'
import { loadGuaguaNetwork, routeLabel, type GuaguaNetwork } from './guagua/network'

export type NearbyKind =
  | 'trail'
  | 'trailPoi'
  | 'recreation'
  | 'tourism'
  | 'viewpoint'
  | 'culture'
  | 'history'
  | 'busStop'
  | 'charging'

/**
 * Tope global de la lista. Veintidós entradas en un panel de móvil no son
 * riqueza, son ruido: quien mira quiere saber qué tiene al lado, no el
 * inventario del municipio. Se enseñan las más cercanas y el resto se pliega.
 */
export const NEARBY_VISIBLE = 8

/** Las descripciones del portal llegan a ser párrafos enteros. */
const MAX_DETAIL = 70

function shorten(text: string | undefined): string | undefined {
  if (!text) return undefined
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= MAX_DETAIL ? clean : `${clean.slice(0, MAX_DETAIL - 1).trimEnd()}…`
}

export interface NearbyItem {
  kind: NearbyKind
  name: string
  /** Segunda línea: tipo, dificultad, líneas de guagua… */
  detail?: string
  distanceKm: number
  lon: number
  lat: number
  url?: string
}

interface Feature {
  geometry: { type: string; coordinates: unknown } | null
  properties: Record<string, unknown> | null
}

interface Collection {
  features: Feature[]
}

/** Punto más cercano de una geometría cualquiera al objetivo. */
function nearestVertex(target: LonLat, geometry: Feature['geometry']): { d: number; at: LonLat } | null {
  if (!geometry) return null
  let best: { d: number; at: LonLat } | null = null
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const at: LonLat = [c[0], c[1]]
      const d = haversineKm(target, at)
      if (!best || d < best.d) best = { d, at }
      return
    }
    if (Array.isArray(c)) for (const k of c) walk(k)
  }
  walk(geometry.coordinates)
  return best
}

const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s && s !== 'null' && s !== 'NA' ? s : undefined
}

// ---------------------------------------------------------------------------
// Carga perezosa
// ---------------------------------------------------------------------------

const cache = new Map<string, Promise<Collection | null>>()

function load(file: string): Promise<Collection | null> {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(`/layers/${file}`)
        .then((r) => (r.ok ? (r.json() as Promise<Collection>) : null))
        .catch(() => null),
    )
  }
  return cache.get(file)!
}

// ---------------------------------------------------------------------------

interface LayerSpec {
  file: string
  kind: NearbyKind
  name: (p: Record<string, unknown>) => string | undefined
  detail?: (p: Record<string, unknown>, ctx: Context) => string | undefined
  url?: (p: Record<string, unknown>) => string | undefined
  /** Radio propio: un sendero se busca más lejos que una fuente. */
  radiusKm: number
  limit: number
}

interface Context {
  guagua: GuaguaNetwork | null
}

const LAYERS: LayerSpec[] = [
  {
    file: 'senderos.geojson',
    kind: 'trail',
    radiusKm: 1.5,
    limit: 3,
    name: (p) => str(p.codigo) ?? str(p.id_sendero),
    detail: (p) => {
      const parts = [str(p.tipo), str(p.dificultad)].filter(Boolean)
      const km = Number(p.longitud_km)
      if (Number.isFinite(km) && km > 0) parts.push(`${km.toFixed(1)} km`)
      return parts.join(' · ') || undefined
    },
  },
  {
    file: 'senderos-poi.geojson',
    kind: 'trailPoi',
    radiusKm: 1,
    limit: 4,
    name: (p) => str(p.descripcion) ?? str(p.subtipo) ?? str(p.tipo),
    detail: (p) => [str(p.tipo), str(p.subtipo)].filter(Boolean).join(' · ') || undefined,
  },
  {
    file: 'zonas-recreativas.geojson',
    kind: 'recreation',
    radiusKm: 4,
    limit: 3,
    name: (p) => str(p.nombre),
    detail: (p) =>
      [str(p.subtipo) ?? str(p.tipo), str(p.permisos) && 'requiere permiso']
        .filter(Boolean)
        .join(' · ') || undefined,
    url: (p) => str(p.web),
  },
  {
    file: 'interes-turistico.geojson',
    kind: 'tourism',
    radiusKm: 4,
    limit: 3,
    name: (p) => str(p.nombre),
    detail: (p) => str(p.tipo_recurso) ?? str(p.categoria_lista),
    url: (p) => str(p.url_ficha) ?? str(p.web_externa),
  },
  {
    // Radio corto y una sola entrada: un mirador a cuatro kilómetros no es
    // «cerca de aquí», y la capa no trae nada más que el nombre con lo que
    // justificar una segunda línea.
    file: 'miradores.geojson',
    kind: 'viewpoint',
    radiusKm: 2.5,
    limit: 2,
    name: (p) => str(p.nombre),
  },
  {
    file: 'interes-cultural.geojson',
    kind: 'culture',
    radiusKm: 3,
    limit: 3,
    name: (p) => str(p.nombre),
    detail: (p) => str(p.tipo),
  },
  {
    file: 'interes-historico.geojson',
    kind: 'history',
    radiusKm: 2,
    limit: 3,
    name: (p) => str(p.nombre),
    detail: (p) => [str(p.tipo), str(p.subtipo)].filter(Boolean).join(' · ') || undefined,
  },
  {
    file: 'paradas-guagua.geojson',
    kind: 'busStop',
    radiusKm: 2,
    limit: 3,
    name: (p) => str(p.nombre) ?? str(p.stop_code) ?? str(p.stop_id),
    detail: (p, ctx) => {
      // Sólo qué líneas paran, nunca a qué hora: el feed de horarios caducó y
      // anunciarlos sería decirle a alguien que pasa una guagua que no pasa.
      const id = str(p.stop_id)
      if (!id || !ctx.guagua) return undefined
      const routes = ctx.guagua.stops[id]?.routes
      if (!routes?.length) return undefined
      const names = routes.map((r) => routeLabel(ctx.guagua, r))
      return `Líneas ${names.slice(0, 6).join(', ')}${names.length > 6 ? '…' : ''}`
    },
  },
  {
    file: 'recarga-electrica.geojson',
    kind: 'charging',
    radiusKm: 5,
    limit: 2,
    name: (p) => str(p.nombre),
    detail: (p) => str(p.descripcion) ?? str(p.propietario),
  },
]

/** Precarga en segundo plano, para que el primer clic no espere. */
export function warmNearbyLayers(): void {
  void loadGuaguaNetwork()
  for (const l of LAYERS) void load(l.file)
}

export async function findNearby(lon: number, lat: number): Promise<NearbyItem[]> {
  const guagua = await loadGuaguaNetwork()
  const ctx: Context = { guagua }
  const target: LonLat = [lon, lat]

  const perLayer = await Promise.all(
    LAYERS.map(async (spec) => {
      const geo = await load(spec.file)
      if (!geo) return []
      const hits: NearbyItem[] = []
      for (const f of geo.features) {
        const near = nearestVertex(target, f.geometry)
        if (!near || near.d > spec.radiusKm) continue
        const props = f.properties ?? {}
        const name = spec.name(props)
        if (!name) continue
        hits.push({
          kind: spec.kind,
          name: shorten(name)!,
          detail: shorten(spec.detail?.(props, ctx)),
          distanceKm: near.d,
          lon: near.at[0],
          lat: near.at[1],
          url: spec.url?.(props),
        })
      }
      hits.sort((a, b) => a.distanceKm - b.distanceKm)
      // Se recorta por capa, no global: si no, los 1190 POI de senderos se
      // comerían el hueco de la única parada de guagua que hay cerca.
      return hits.slice(0, spec.limit)
    }),
  )

  return perLayer.flat().sort((a, b) => a.distanceKm - b.distanceKm)
}
