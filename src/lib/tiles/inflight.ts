/**
 * Una tesela, una descarga: dos peticiones simultáneas de lo mismo se juntan.
 *
 * ESTO NO ES UNA PRECAUCIÓN TEÓRICA. La primera medida de
 * `scripts/checks/tile-cache.ts` contra un navegador de verdad (18 ago 2026)
 * salió con **25 peticiones a GRAFCAN, dos de ellas repetidas byte a byte**: al
 * encender la ortofoto, el precargador pide la vista de lejos y MapLibre pide a
 * la vez las teselas de la pantalla, que a zoom 9,6 son del mismo z10. Ninguno
 * de los dos había terminado de guardar cuando el otro preguntó al inventario,
 * así que los dos salieron a la red. La caché existe para pedirle menos a
 * GRAFCAN; pedir dos veces la misma imagen en el mismo segundo era justo lo
 * contrario.
 *
 * EL `signal` NO SE PASA A LA PETICIÓN COMPARTIDA, y es deliberado. Si el
 * primero que la pidió se va —MapLibre cancela lo que sale de la vista—, el
 * segundo se quedaría sin nada y tendría que empezar de cero. La descarga sigue
 * hasta el final y acaba en la caché: son 230 kB de mediana que ya iban por el
 * cable, y tenerlos guardados vale más que ahorrarse la cola de una respuesta
 * que estaba a medio camino. Quien quiera desentenderse antes de tiempo corta
 * por su lado, con `raceAbort`.
 */

export interface FetchedTile {
  body: ArrayBuffer
  type: string
}

const inflight = new Map<string, Promise<FetchedTile>>()

/** Descarga una tesela, o se engancha a la descarga que ya haya en marcha. */
export function fetchTileOnce(key: string, url: string): Promise<FetchedTile> {
  const yaVa = inflight.get(key)
  if (yaVa) return yaVa

  const p = (async (): Promise<FetchedTile> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`GRAFCAN HTTP ${res.status}`)
    return {
      body: await res.arrayBuffer(),
      type: res.headers.get('content-type') ?? 'image/jpeg',
    }
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
  return p
}

/**
 * Deja de esperar una descarga si la cancelan, sin cancelarla para los demás.
 *
 * Rechaza con el motivo del `AbortSignal`, que es lo que MapLibre espera para
 * distinguir «esta tesela ya no hace falta» de «esta tesela ha fallado» — un
 * error de verdad lo pinta como fuente rota.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (!signal) return promise
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      if (signal.aborted) return reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }),
  ])
}

/** Cuántas descargas hay en vuelo. Para poder observar esto desde una prueba. */
export function inflightCount(): number {
  return inflight.size
}
