/**
 * Dónde se guardan las teselas de GRAFCAN: IndexedDB.
 *
 * NO `localStorage`, que solo admite texto y se llena a los 5 MB —una pantalla
 * de ortofoto—. NO la Cache Storage API, que sería el sitio natural para
 * respuestas HTTP pero no sabe decir cuánto ocupa ni en qué orden se usó nada:
 * para purgar por tamaño habría que abrir cada respuesta y medirla, que es
 * justamente leer los 150 MB para decidir qué borrar.
 *
 * DOS ALMACENES Y NO UNO, y esta es la decisión que sostiene todo lo demás. En
 * IndexedDB, recorrer un índice te da la clave y el valor indexado, pero para
 * saber el tamaño de una entrada hay que leer la entrada **entera** — con su
 * JPEG dentro. Con los metadatos aparte, sumar lo que ocupa la caché y decidir
 * la purga cuesta un recorrido sobre unos kilobytes; con un solo almacén,
 * costaría cargar en memoria los 150 MB que se están intentando recortar.
 *
 *   meta   clave → { size, storedAt, usedAt }   se recorre entero, es diminuto
 *   body   clave → { body: ArrayBuffer, type }  solo se lee la que se pide
 *
 * TODO FALLA EN BLANDO. Safari en navegación privada, un perfil con el
 * almacenamiento bloqueado o una cuota llena lanzan al abrir o al escribir. Nada
 * de eso es motivo para que no se vea el mapa: si la caché no se puede abrir,
 * cada función de aquí se comporta como una caché vacía que no guarda nada y la
 * aplicación sigue pidiendo teselas como pedía antes de que esto existiera.
 */

import { cacheCapBytes, TILE_TTL_MS } from './budget'
import { planSweep, shouldTouch, type TileMeta } from './lru'

const DB_NAME = 'tiempo-palmero-teselas'
const DB_VERSION = 1
const META = 'meta'
const BODY = 'body'

export interface CachedTile {
  body: ArrayBuffer
  type: string
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      resolve(null) // almacenamiento bloqueado: caché vacía y a seguir
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      if (!db.objectStoreNames.contains(BODY)) db.createObjectStore(BODY)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return dbPromise
}

function promisify<T>(req: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

/** La tesela guardada, o `null` si no está, caducó o la caché no se pudo abrir. */
export async function readTile(key: string, now: number): Promise<CachedTile | null> {
  const db = await openDb()
  if (!db) return null
  try {
    const tx = db.transaction([META, BODY], 'readonly')
    const meta = (await promisify(tx.objectStore(META).get(key))) as TileMeta | null
    if (!meta) return null
    const body = (await promisify(tx.objectStore(BODY).get(key))) as CachedTile | null
    if (!body) return null
    // La caducidad la decide `lru.ts`; aquí solo se aplica. Una tesela vencida
    // se comporta como ausente y la purga siguiente se la lleva.
    if (now - meta.storedAt >= TILE_TTL_MS) return null
    if (shouldTouch(meta, now)) void touch(db, key, meta, now)
    return body
  } catch {
    return null
  }
}

function touch(db: IDBDatabase, key: string, meta: TileMeta, now: number): void {
  try {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put({ ...meta, usedAt: now }, key)
  } catch {
    // Anotar el uso es una optimización de la purga, no un dato: si falla, la
    // tesela se sigue sirviendo y lo único que pasa es que parece más vieja.
  }
}

/** Guarda una tesela recién descargada. Devuelve si se pudo. */
export async function writeTile(
  key: string,
  body: ArrayBuffer,
  type: string,
  now: number,
): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction([META, BODY], 'readwrite')
    const meta: TileMeta = { key, size: body.byteLength, storedAt: now, usedAt: now }
    tx.objectStore(META).put(meta, key)
    tx.objectStore(BODY).put({ body, type } satisfies CachedTile, key)
    return await new Promise((resolve) => {
      tx.oncomplete = () => resolve(true)
      // Cuota llena. No se reintenta ni se avisa: la tesela ya está en pantalla,
      // y lo único que se pierde es tenerla mañana. La purga del próximo reposo
      // hará sitio.
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch {
    return false
  }
}

/** Está guardada y sigue fresca. No lee el cuerpo: es para decidir si precargar. */
export async function hasTile(key: string, now: number): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction(META, 'readonly')
    const meta = (await promisify(tx.objectStore(META).get(key))) as TileMeta | null
    return meta !== null && now - meta.storedAt < TILE_TTL_MS
  } catch {
    return false
  }
}

/** Todo el inventario de metadatos. Unos 40 bytes por tesela, no las imágenes. */
async function allMeta(db: IDBDatabase): Promise<TileMeta[]> {
  const tx = db.transaction(META, 'readonly')
  const rows = (await promisify(tx.objectStore(META).getAll())) as TileMeta[] | null
  return rows ?? []
}

export interface CacheStats {
  tiles: number
  bytes: number
}

export async function cacheStats(): Promise<CacheStats> {
  const db = await openDb()
  if (!db) return { tiles: 0, bytes: 0 }
  try {
    const rows = await allMeta(db)
    return { tiles: rows.length, bytes: rows.reduce((s, r) => s + r.size, 0) }
  } catch {
    return { tiles: 0, bytes: 0 }
  }
}

/**
 * Tira lo caducado y lo que sobre del techo. Se llama en los reposos del mapa,
 * nunca en mitad de una descarga: es un recorrido del inventario y varias
 * escrituras, y el momento de hacerlo es cuando nadie está esperando nada.
 */
export async function sweep(now: number): Promise<CacheStats> {
  const db = await openDb()
  if (!db) return { tiles: 0, bytes: 0 }
  try {
    const rows = await allMeta(db)
    const quota = await estimateQuota()
    const { drop, keptBytes } = planSweep(rows, cacheCapBytes(quota), now)
    if (drop.length) {
      const tx = db.transaction([META, BODY], 'readwrite')
      for (const key of drop) {
        tx.objectStore(META).delete(key)
        tx.objectStore(BODY).delete(key)
      }
      await new Promise((resolve) => {
        tx.oncomplete = resolve
        tx.onerror = resolve
        tx.onabort = resolve
      })
    }
    return { tiles: rows.length - drop.length, bytes: keptBytes }
  } catch {
    return { tiles: 0, bytes: 0 }
  }
}

async function estimateQuota(): Promise<number | undefined> {
  try {
    return (await navigator.storage?.estimate())?.quota
  } catch {
    return undefined
  }
}

/** Vacía la caché entera. Existe para el panel de ajustes y para las pruebas. */
export async function clearTiles(): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction([META, BODY], 'readwrite')
    tx.objectStore(META).clear()
    tx.objectStore(BODY).clear()
    await new Promise((resolve) => {
      tx.oncomplete = resolve
      tx.onerror = resolve
      tx.onabort = resolve
    })
  } catch {
    // Nada que hacer: la caché se purga sola por tiempo.
  }
}
