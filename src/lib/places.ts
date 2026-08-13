/**
 * Los sitios que publica el Cabildo y que se pueden encender uno a uno.
 *
 * Hasta ahora estas capas solo existían dentro de «cerca de aquí»: había
 * que tocar un punto del mapa para enterarse de que a 300 m hay un mirador. El
 * mapa no las dibujaba, así que no se podían BUSCAR, solo encontrar por azar.
 * Aquí están declaradas como catálogo —fichero, icono, color y cómo se llama
 * cada cosa— para que la barra lateral pueda ofrecerlas como interruptores y el
 * mapa las pinte igual que los puntos de los senderos.
 *
 * Los polígonos entran como su centro. `interes-historico` publica 390 recintos
 * con superficie, y a la escala en la que se mira la isla un recinto de 200 m²
 * es un punto: dibujarlo como área sería un píxel invisible, y el dato de la
 * superficie sigue estando en la ficha, que es donde se puede leer.
 */

export type PlaceKind =
  | 'tourism'
  | 'viewpoint'
  | 'culture'
  | 'history'
  | 'recreation'
  | 'charging'

export interface PlaceSpec {
  kind: PlaceKind
  file: string
  color: string
  /** Trazo del icono, en una caja de 24×24 centrada en (12,12). */
  glyph: string
  /** Cómo se llama cada elemento de esta capa. */
  name: (p: Record<string, unknown>) => string | undefined
}

const str = (v: unknown): string | undefined => {
  const s = String(v ?? '').trim()
  return s && s !== 'null' && s !== 'NA' ? s : undefined
}

export const PLACES: PlaceSpec[] = [
  {
    kind: 'tourism',
    file: 'interes-turistico.geojson',
    color: '#e0a96a',
    // Una estrella: los «imprescindibles» que destaca el Cabildo. Este dibujo
    // era antes el de los dos montes y el arco de la vista, que es literalmente
    // un mirador — y desde que los miradores son su propia capa, tenerlo aquí
    // era decir «mirador» en el sitio equivocado.
    glyph: 'M12 6.2l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z',
    name: (p) => str(p.nombre),
  },
  {
    kind: 'viewpoint',
    file: 'miradores.geojson',
    color: '#7fc6c0',
    // Dos montes y el arco de la vista: lo que se ve desde el mirador, no el
    // mirador en sí. Un balcón dibujado a 22 px es una reja ilegible.
    glyph: 'M5.8 15.6l4-5.2 2.6 3.2 2-2.4 3.8 4.4M6.4 17.6c2.4-1.6 8.8-1.6 11.2 0',
    name: (p) => str(p.nombre),
  },
  {
    kind: 'culture',
    file: 'interes-cultural.geojson',
    color: '#e2c56a',
    glyph:
      'M6.2 17.2h11.6M6.6 11.4L12 7.2l5.4 4.2zM8.6 11.8v5M11 11.8v5M13.4 11.8v5M15.8 11.8v5',
    name: (p) => str(p.nombre),
  },
  {
    kind: 'history',
    file: 'interes-historico.geojson',
    color: '#cfa3d8',
    // Un muro con una hornacina: patrimonio construido, no un museo.
    glyph: 'M6.4 17.4V9.6l5.6-2.8 5.6 2.8v7.8M9.8 17.4v-3.6a2.2 2.2 0 014.4 0v3.6',
    name: (p) => str(p.nombre),
  },
  {
    kind: 'recreation',
    file: 'zonas-recreativas.geojson',
    color: '#8fc79a',
    glyph: 'M5.6 10.8h12.8M7.8 10.8L6.4 17.2M16.2 10.8l1.4 6.4M7.4 14.2h9.2',
    name: (p) => str(p.nombre),
  },
  {
    kind: 'charging',
    file: 'recarga-electrica.geojson',
    color: '#8fc3e0',
    glyph: 'M12.8 6.6L8.2 13h3.4l-.4 4.4L16 11h-3.4z',
    name: (p) => str(p.nombre),
  },
]

export const PLACE_BY_KIND: Record<PlaceKind, PlaceSpec> = Object.fromEntries(
  PLACES.map((p) => [p.kind, p]),
) as Record<PlaceKind, PlaceSpec>

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------

const ICON_SIZE = 24

export function placeIconSvg(kind: PlaceKind, size = ICON_SIZE): string {
  const spec = PLACE_BY_KIND[kind]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="10.2" fill="rgba(14,13,11,0.86)" stroke="${spec.color}" stroke-width="1.4"/>` +
    `<path d="${spec.glyph}" fill="none" stroke="${spec.color}" ` +
    `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  )
}

export function placeIconDataUrl(kind: PlaceKind, size = ICON_SIZE): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeIconSvg(kind, size))}`
}

export const placeImageId = (kind: PlaceKind) => `place-${kind}`

// ---------------------------------------------------------------------------
// Geometría y ficha
// ---------------------------------------------------------------------------

/** Centro del rectángulo que envuelve la geometría, sea cual sea su tipo. */
export function centroidOf(geometry: unknown): [number, number] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      minX = Math.min(minX, c[0])
      maxX = Math.max(maxX, c[0])
      minY = Math.min(minY, c[1])
      maxY = Math.max(maxY, c[1])
      return
    }
    if (Array.isArray(c)) for (const k of c) walk(k)
  }
  walk((geometry as { coordinates?: unknown } | null)?.coordinates)
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
  return [(minX + maxX) / 2, (minY + maxY) / 2]
}

/** Colección lista para el mapa: todo puntos, con `kind` e `icon` dentro. */
export function toPlacePoints(
  fc: GeoJSON.FeatureCollection,
  kind: PlaceKind,
): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = []
  for (const f of fc.features) {
    const at = centroidOf(f.geometry)
    if (!at) continue
    out.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: at },
      properties: { ...(f.properties ?? {}), kind, icon: placeImageId(kind) },
    })
  }
  return out
}

export interface PlaceRecord {
  kind: PlaceKind
  name: string
  lon: number
  lat: number
  /** Propiedades crudas de la capa, tal cual las publica el Cabildo. */
  props: Record<string, unknown>
}

/** Campos que añade la app y que no son datos de la fuente. */
const INTERNAL = new Set(['kind', 'icon'])

export function isPlaceDataProp(k: string): boolean {
  return !INTERNAL.has(k)
}

export function readPlace(
  props: Record<string, unknown>,
  lon: number,
  lat: number,
): PlaceRecord {
  const kind = (String(props.kind ?? 'tourism') as PlaceKind) ?? 'tourism'
  const spec = PLACE_BY_KIND[kind] ?? PLACES[0]
  return {
    kind: spec.kind,
    name: spec.name(props) ?? str(props.id) ?? '—',
    lon,
    lat,
    props,
  }
}
