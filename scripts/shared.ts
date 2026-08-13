/**
 * Lo que comparten los scripts de preparación de datos: rutas de salida,
 * identificación ante los servidores de terceros y el `fetch` con reintentos.
 *
 * Vive aparte porque `prepare-data.ts` ya no es el único: cada fuente que
 * necesita más de cuatro líneas de tratamiento propio —el GTFS de TILP es la
 * primera— se lleva su fichero, y todos entran por aquí.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PUBLIC = path.join(ROOT, 'public')

export const UA = {
  'User-Agent': 'TiempoPalmero/0.1 (build-time data preparation; andreapiani.dev@gmail.com)',
}

export const log = (...a: unknown[]) => console.log('·', ...a)
export const warn = (...a: unknown[]) => console.warn('!', ...a)

export const CKAN =
  'https://lapalmasmart-open.lapalma.es/datosabiertos/catalogo/api/3/action'

export interface CkanResource {
  name: string
  format: string
  url: string
}

/**
 * Overpass, con los dos espejos.
 *
 * Vive aquí y no en `prepare-data.ts` porque ya son dos los que lo usan: el
 * gazetteer de topónimos y el viario. Ninguna de las dos consultas se hace en
 * runtime — la usage policy de Overpass prohíbe el uso sistemático desde una
 * aplicación, no una ejecución de build puntual y educada—, y por eso el
 * reintento es lento a propósito: si el primer espejo está saturado, esperar
 * cuatro segundos es gratis aquí y sería inaceptable en el navegador.
 */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

export async function overpass<T>(query: string): Promise<T[]> {
  let last: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: query }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = (await res.json()) as { elements: T[] }
        return j.elements ?? []
      } catch (e) {
        last = e
        await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
      }
    }
  }
  throw last
}

export interface LayerIndexEntry {
  file: string
  features: number
  label: string
  /** Solo cuando la capa NO viene del Cabildo: ver la cabecera del índice. */
  source?: string
  license?: string
}

/**
 * Registra capas en `public/layers/index.json` SIN borrar las que ya estaban.
 *
 * Antes el índice se escribía entero de una vez, y eso obligaba a que todo lo
 * que va en él se descargara en la misma ejecución: pedir solo el viario
 * borraba del inventario las catorce capas del Cabildo, que seguían en el
 * directorio. Cada productor registra lo suyo y el índice es lo que hay.
 */
export async function mergeLayerIndex(
  entries: Record<string, LayerIndexEntry>,
): Promise<void> {
  const file = path.join(PUBLIC, 'layers', 'index.json')
  let previous: Record<string, LayerIndexEntry> = {}
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as {
      layers?: Record<string, LayerIndexEntry>
    }
    previous = raw.layers ?? {}
  } catch {
    /* primera ejecución: no hay índice todavía */
  }

  await writeFile(
    file,
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        source:
          'Cabildo Insular de La Palma — Servicio de Transformación Digital (La Palma Smart Island), ' +
          'catálogo CKAN y visor ArcGIS de opendatalapalma.es. Las capas con `source` propio ' +
          'no vienen de ahí: dice cada una de dónde sale y con qué licencia.',
        license: 'CC-BY 4.0 / ODC-BY (límites administrativos)',
        layers: { ...previous, ...entries },
      },
      null,
      2,
    ),
  )
}

/**
 * Recorta las coordenadas a 6 decimales (~11 cm en el ecuador).
 *
 * Sin esto el fichero de municipios reproyectado sale a 4,4 MB porque cada
 * número lleva 15 cifras de coma flotante, y el navegador tiene que
 * descargarlo entero para poder decir en qué municipio has tocado. Con el
 * recorte baja a una fracción, y la precisión que se pierde está muy por
 * debajo del error del propio trazado del límite.
 *
 * Los servicios ArcGIS son aún peores en esto: devuelven la reproyección a
 * WGS84 con toda la basura del `double`, y la red de carreteras pasa de 2,2 MB
 * a 1,2 MB solo con esto.
 */
export function roundCoords(c: unknown): unknown {
  if (typeof c === 'number') return Math.round(c * 1e6) / 1e6
  return Array.isArray(c) ? c.map(roundCoords) : c
}

export async function getJson<T>(
  url: string,
  tries = 4,
  init: RequestInit = {},
): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) } })
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
      return (await res.json()) as T
    } catch (e) {
      last = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)))
    }
  }
  throw last
}
