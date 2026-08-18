/**
 * Qué se tira de la caché de teselas cuando se llena, y en qué orden.
 *
 * Está separado de `store.ts` —que es quien habla con IndexedDB— porque esto es
 * la decisión y aquello es la fontanería: la decisión se puede probar en Node,
 * sin navegador y sin base de datos, y de hecho `lru.test.ts` la prueba así.
 *
 * El orden es el de siempre, con una precedencia que sí importa: **primero lo
 * caducado y después lo viejo**. Una tesela caducada no vale nada aunque se
 * acabe de mirar, así que tirarla no cuesta un acierto futuro; una tesela vieja
 * pero fresca sí valdría, y solo se tira porque hace falta el sitio.
 */

import { TILE_TTL_MS } from './budget'

export interface TileMeta {
  key: string
  /** Bytes del cuerpo, para que la suma no exija leer las imágenes. */
  size: number
  /** Cuándo se descargó. Es lo que decide la caducidad. */
  storedAt: number
  /** Cuándo se usó por última vez. Es lo que decide el orden de la purga. */
  usedAt: number
}

export function isExpired(entry: TileMeta, now: number, ttl = TILE_TTL_MS): boolean {
  return now - entry.storedAt >= ttl
}

export interface SweepPlan {
  /** Las claves a borrar, caducadas primero. */
  drop: string[]
  /** Lo que quedará ocupado después de borrarlas. */
  keptBytes: number
}

/**
 * Qué borrar para que la caché quepa en `capBytes`.
 *
 * No devuelve la lista de lo que se queda: con 650 entradas eso sería copiar el
 * inventario entero para no usarlo. Devuelve lo que hay que tirar y cuánto
 * quedará, que es lo que necesitan tanto `store.ts` como el panel que enseña el
 * tamaño de la caché.
 */
export function planSweep(
  entries: TileMeta[],
  capBytes: number,
  now: number,
  ttl = TILE_TTL_MS,
): SweepPlan {
  const drop: string[] = []
  let bytes = 0
  const alive: TileMeta[] = []

  for (const e of entries) {
    if (isExpired(e, now, ttl)) drop.push(e.key)
    else {
      alive.push(e)
      bytes += e.size
    }
  }

  if (bytes <= capBytes) return { drop, keptBytes: bytes }

  // De la menos usada a la más usada. `usedAt` empatado se resuelve por clave
  // para que el plan sea el mismo en dos ejecuciones con los mismos datos: una
  // purga que depende del orden en que la base devolvió las filas es imposible
  // de probar.
  alive.sort((a, b) => a.usedAt - b.usedAt || (a.key < b.key ? -1 : 1))
  for (const e of alive) {
    if (bytes <= capBytes) break
    drop.push(e.key)
    bytes -= e.size
  }

  return { drop, keptBytes: bytes }
}

/**
 * Si conviene reescribir el `usedAt` de una tesela que se acaba de servir.
 *
 * Anotar cada lectura sería una escritura en disco por cada tesela que se
 * pinta, y en un arrastre eso son decenas por segundo para mover un número que
 * solo se consulta cuando la caché se llena. Con una hora de holgura, el orden
 * de la purga sigue siendo el correcto —lo que importa es qué se usó *este mes*,
 * no cuál se usó hace un minuto antes que cuál— y las escrituras caen a una por
 * tesela y hora.
 */
export const USED_AT_GRACE_MS = 3600 * 1000

export function shouldTouch(entry: TileMeta, now: number): boolean {
  return now - entry.usedAt >= USED_AT_GRACE_MS
}
