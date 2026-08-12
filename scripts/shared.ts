/**
 * Lo que comparten los scripts de preparación de datos: rutas de salida,
 * identificación ante los servidores de terceros y el `fetch` con reintentos.
 *
 * Vive aparte porque `prepare-data.ts` ya no es el único: cada fuente que
 * necesita más de cuatro líneas de tratamiento propio —el GTFS de TILP es la
 * primera— se lleva su fichero, y todos entran por aquí.
 */

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
