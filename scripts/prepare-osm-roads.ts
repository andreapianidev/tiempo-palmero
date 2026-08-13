/**
 * El viario completo de la isla, de OpenStreetMap y en tiempo de compilación.
 *
 * Por qué hace falta, si ya hay una capa de carreteras: la del Cabildo son 61
 * tramos —las 53 vías insulares, seis municipales, la del Parque Nacional y la
 * del aeropuerto— y no pretende ser otra cosa. Por debajo de esas 61 la isla
 * salía vacía: en las medianías de Tijarafe, en Puntagorda o en cualquier lomo,
 * las paradas de guagua y los sensores flotaban sobre un relieve sin una sola
 * calle por la que se llega hasta ellos. OSM tiene el resto.
 *
 * Lo que se baja son VÍAS, no senderos: los `path`, `footway`, `steps` y
 * `cycleway` se quedan fuera porque la capa de senderos ya está, viene del
 * Cabildo y trae nombre y avisos. La lista exacta está en `src/lib/osm-roads.ts`
 * y es la misma que decide con qué grosor se pinta cada una.
 *
 * En runtime la aplicación NO consulta Overpass. La usage policy lo prohíbe
 * para uso sistemático desde una app, así que esto se ejecuta una vez, deja un
 * fichero estático con su atribución dentro y la aplicación solo lee ficheros.
 *
 *   npm run prepare-data -- --only=viario
 */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ISLAND_BBOX, haversineKm } from '../src/lib/geo.js'
import { OSM_ROAD_KINDS, roadTier, type RoadTier } from '../src/lib/osm-roads.js'
import { roundPath, simplifyPath, type Point } from '../src/lib/simplify.js'
import { PUBLIC, log, overpass, warn, type LayerIndexEntry } from './shared.js'

const OUT = 'viario-osm.geojson'

/**
 * Adelgazado y redondeo. Los dos números están medidos, no elegidos: ver la
 * cabecera de `src/lib/simplify.ts`. En corto, el mapa llega a zoom 16, donde un
 * píxel son 2,10 m a esta latitud; 1e-5 grados son 1,11 m como mucho, medio
 * píxel en la vista más cercana que la aplicación permite.
 */
const TOLERANCE_DEG = 1e-5
const DECIMALS = 5

interface OverpassWay {
  id: number
  tags?: Record<string, string>
  geometry?: { lon: number; lat: number }[]
}

/** Una sola consulta para toda la isla: son 20 MB y tarda seis segundos. */
function query(): string {
  const { south, west, north, east } = ISLAND_BBOX
  return (
    `[out:json][timeout:600];` +
    `way["highway"~"^(${OSM_ROAD_KINDS.join('|')})$"](${south},${west},${north},${east});` +
    `out geom;`
  )
}

/**
 * Punto de millar, también con cuatro cifras.
 *
 * `toLocaleString('es-ES')` no agrupa los números de cuatro dígitos —lo dice la
 * RAE y lo hace el ICU—, pero este repositorio los escribe agrupados de punta a
 * punta («2.387 elementos», «1.190 puntos de interés»), y una etiqueta que
 * dijera «3373 km» al lado de «19.770 trazados» se leería como una errata.
 */
const miles = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function lengthKm(points: readonly Point[]): number {
  let km = 0
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i])
  return km
}

export async function prepareOsmRoads(): Promise<Record<string, LayerIndexEntry>> {
  let ways: OverpassWay[]
  try {
    ways = await overpass<OverpassWay>(query())
  } catch (e) {
    warn(`viario OSM: ${String(e)} — se deja el fichero anterior`)
    return {}
  }

  const features: GeoJSON.Feature[] = []
  const km = new Map<RoadTier, number>()
  const count = new Map<RoadTier, number>()
  let verticesIn = 0
  let verticesOut = 0

  for (const w of ways) {
    const tier = roadTier(w.tags?.highway)
    // La consulta pide justo las clases que se saben pintar, así que esto no
    // debería descartar nada. Si un día lo hace, es que las dos listas se han
    // separado y hay que enterarse.
    if (!tier || !w.geometry || w.geometry.length < 2) continue

    const original: Point[] = w.geometry.map((g) => [g.lon, g.lat])
    const points = roundPath(simplifyPath(original, TOLERANCE_DEG), DECIMALS)
    if (points.length < 2) continue

    verticesIn += original.length
    verticesOut += points.length
    km.set(tier, (km.get(tier) ?? 0) + lengthKm(original))
    count.set(tier, (count.get(tier) ?? 0) + 1)

    features.push({
      type: 'Feature',
      // `t` es la jerarquía —con qué grosor se pinta— y `c` la etiqueta original
      // de OSM, que es lo que distingue una pista de tierra de un camino de
      // servicio asfaltado. Nombres cortos: multiplicados por 19.770 features,
      // `tier`/`class` costarían 130 KB de nombres de campo repetidos.
      properties: { t: tier, c: w.tags!.highway },
      geometry: { type: 'LineString', coordinates: points },
    })
  }

  if (!features.length) {
    warn('viario OSM: la consulta no ha devuelto ni un trazado; no se escribe nada')
    return {}
  }

  const totalKm = [...km.values()].reduce((a, b) => a + b, 0)
  await writeFile(
    path.join(PUBLIC, 'layers', OUT),
    JSON.stringify({
      type: 'FeatureCollection',
      // Miembros extra de la colección: la atribución viaja DENTRO del fichero,
      // no en un índice aparte que se puede perder por el camino.
      generated: new Date().toISOString(),
      attribution: '© OpenStreetMap contributors — ODbL 1.0',
      note:
        'Extraído en build time vía Overpass API. La aplicación no consulta ' +
        'Overpass ni Nominatim en runtime. Trazados adelgazados con ' +
        `Douglas-Peucker a ${TOLERANCE_DEG} grados (≤1,11 m) y ${DECIMALS} decimales.`,
      count: features.length,
      lengthKm: +totalKm.toFixed(1),
      features,
    }),
  )

  for (const tier of [1, 2, 3] as RoadTier[]) {
    log(
      `viario OSM · nivel ${tier}: ${count.get(tier) ?? 0} trazados, ` +
        `${(km.get(tier) ?? 0).toFixed(1)} km`,
    )
  }
  log(
    `${OUT}: ${features.length} trazados, ${totalKm.toFixed(1)} km, ` +
      `${verticesOut} vértices de ${verticesIn} (${((1 - verticesOut / verticesIn) * 100).toFixed(0)}% menos)`,
  )

  return {
    viario: {
      file: `/layers/${OUT}`,
      features: features.length,
      label: `Viario completo de OSM (${miles(features.length)} trazados, ${miles(totalKm)} km)`,
      source: 'OpenStreetMap vía Overpass API',
      license: 'ODbL 1.0',
    },
  }
}
