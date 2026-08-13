/**
 * Recorrer un sendero con el modelo puesto.
 *
 * QUÉ HACE. Coge el trazado —que la aplicación ya tiene descargado, 49
 * senderos y 640,7 km en `public/layers/senderos.geojson`— lo densifica a
 * pasos regulares y pregunta en cada paso lo mismo que el panel de punto
 * pregunta cuando pinchas el mapa. No hay ninguna fuente nueva: es el campo ya
 * validado, leído a lo largo de una línea en vez de en un sitio.
 *
 * POR QUÉ 200 m DE PASO. El modelo de elevación tiene una resolución de ~33 m
 * y el campo interpolado varía sobre todo con la altitud, así que el paso
 * tiene que ser fino comparado con lo que sube el sendero, no comparado con el
 * sendero entero. Con 200 m, la ruta más larga del inventario —GR 130.3, 28,5
 * km— sale en ~143 puntos, y las 49 juntas en unos 3200: un coste que se paga
 * una vez por refresco del modelo. Bajar a 50 m cuadruplicaría eso para
 * describir mejor un desnivel que el DEM ya no resuelve.
 *
 * LO QUE NO HACE: interpolar viento ni lluvia. Ninguno de los dos se
 * interpola nunca en esta aplicación —los barrancos encauzan el viento y la
 * vertiente NE recibe múltiplos de la SW a igual altitud—, así que el viento
 * de un sendero sale del campo híbrido de `wind/field.ts`, que declara cuánto
 * pone la estación y cuánto el modelo, y `alerts.ts` lo dice al enseñarlo.
 */

import { haversineKm } from '../geo'
import { elevationAt, type Dem } from '../dem'
import { estimateBundle, type InterpolableVariable, type Model } from '../interpolate'
import { sampleField, speedOf, type WindField } from '../wind/field'
import { areaContaining, type NamedArea } from '../geo'
import { trailLabel } from './names'

/** Paso de muestreo a lo largo del trazado, en metros. */
export const STEP_M = 200

export interface TrailFeature {
  id: number
  codigo: string
  tipo: string
  dificultad: string
  longitudKm: number
  /** Una o varias sartas de coordenadas: el dato es MultiLineString. */
  parts: [number, number][][]
}

export interface TrailPoint {
  lon: number
  lat: number
  elevationM: number
  temperature: number | null
  relativehumidity: number | null
  vpd: number | null
  /** Velocidad del campo híbrido, m/s. `null` fuera del campo o sin campo. */
  windMs: number | null
  /** 0 = sólo modelo, 1 = sólo estaciones. Viaja para poder decirlo. */
  windStationShare: number | null
}

export interface TrailProfile {
  trail: TrailFeature
  label: string
  points: TrailPoint[]
  minElevationM: number
  maxElevationM: number
  /** Desnivel acumulado de subida, m. Lo que de verdad cansa. */
  ascentM: number
}

/**
 * Lee el GeoJSON de senderos. Lo que no tenga código o geometría usable se
 * cae en silencio: son 49 rutas y ninguna es imprescindible para que las
 * demás se dibujen.
 *
 * Se clava en `id_sendero`, NUNCA en `codigo`: el inventario tiene dos
 * `PRLP1310` y dos `PRLP1700` —comprobado el 13 ago 2026 sobre el propio
 * fichero—, así que un mapa indexado por código perdería dos senderos sin
 * avisar.
 */
export function parseTrails(geojson: unknown): TrailFeature[] {
  const features = (geojson as { features?: unknown[] })?.features
  if (!Array.isArray(features)) return []

  const out: TrailFeature[] = []
  for (const raw of features) {
    const f = raw as {
      properties?: Record<string, unknown>
      geometry?: { type?: string; coordinates?: unknown }
    }
    const p = f.properties
    const g = f.geometry
    if (!p || !g || typeof p.codigo !== 'string' || typeof p.id_sendero !== 'number') continue

    const parts =
      g.type === 'MultiLineString'
        ? (g.coordinates as [number, number][][])
        : g.type === 'LineString'
          ? [g.coordinates as [number, number][]]
          : null
    if (!parts?.length) continue

    out.push({
      id: p.id_sendero,
      codigo: p.codigo,
      tipo: typeof p.tipo === 'string' ? p.tipo : '',
      dificultad: typeof p.dificultad === 'string' ? p.dificultad : '',
      longitudKm: typeof p.longitud_km === 'number' ? p.longitud_km : 0,
      parts,
    })
  }
  return out
}

/**
 * Reparte puntos cada `stepM` a lo largo de una sarta de coordenadas.
 *
 * Interpola DENTRO de cada segmento en vez de quedarse con los vértices: el
 * trazado tiene tramos rectos de más de un kilómetro en la costa y vértices
 * cada pocos metros en las lazadas de la cumbre, así que muestrear los
 * vértices daría cien puntos donde no hace falta y ninguno donde sí.
 */
export function densify(
  line: readonly [number, number][],
  stepM = STEP_M,
): [number, number][] {
  if (line.length < 2) return line.slice() as [number, number][]

  const out: [number, number][] = [line[0]]
  let carry = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const segM = haversineKm(a, b) * 1000
    if (segM <= 0) continue

    let travelled = stepM - carry
    while (travelled <= segM) {
      const t = travelled / segM
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      travelled += stepM
    }
    carry = (carry + segM) % stepM
  }

  const last = line[line.length - 1]
  const tail = out[out.length - 1]
  if (tail[0] !== last[0] || tail[1] !== last[1]) out.push(last)
  return out
}

/**
 * Muestrea un sendero entero contra el modelo, el DEM y el campo de viento.
 *
 * Un punto sin altitud se descarta: sin cota no hay estimación posible, y el
 * trazado se sale del DEM en algún borde de la costa. Si no queda ninguno,
 * devuelve `null` en vez de un perfil vacío que luego habría que comprobar en
 * cada uso.
 */
export function sampleTrail(
  trail: TrailFeature,
  dem: Dem,
  models: Record<InterpolableVariable, Model | null>,
  wind: WindField | null,
  municipalities: NamedArea[],
  stepM = STEP_M,
): TrailProfile | null {
  const points: TrailPoint[] = []

  for (const part of trail.parts) {
    for (const [lon, lat] of densify(part, stepM)) {
      const elevationM = elevationAt(dem, lon, lat)
      if (elevationM === null) continue

      const bundle = estimateBundle(models, lon, lat, elevationM)
      const w = wind ? sampleField(wind, lon, lat) : null

      points.push({
        lon,
        lat,
        elevationM,
        temperature: bundle.temperature?.value ?? null,
        relativehumidity: bundle.relativehumidity?.value ?? null,
        vpd: bundle.vpd?.value ?? null,
        windMs: w ? speedOf(w.u, w.v) : null,
        windStationShare: w ? w.station : null,
      })
    }
  }

  if (!points.length) return null

  const elevations = points.map((p) => p.elevationM)
  let ascentM = 0
  for (let i = 1; i < points.length; i++) {
    const rise = points[i].elevationM - points[i - 1].elevationM
    if (rise > 0) ascentM += rise
  }

  const first = points[0]
  const last = points[points.length - 1]

  return {
    trail,
    label: trailLabel(
      trail.codigo,
      areaContaining(first.lon, first.lat, municipalities),
      areaContaining(last.lon, last.lat, municipalities),
    ),
    points,
    minElevationM: Math.min(...elevations),
    maxElevationM: Math.max(...elevations),
    ascentM: Math.round(ascentM),
  }
}
