/**
 * Una cola de uno.
 *
 * El taller de WebGL y el lienzo donde se arma el mosaico del modelo son
 * ÚNICOS y se reutilizan en cada tesela: es lo que evita reservar dos megas de
 * búfer cada vez que MapLibre pide una. El precio de reutilizarlos es que dos
 * teselas no pueden estar dentro a la vez —la segunda le cambiaría el tamaño al
 * lienzo a la primera a mitad de dibujo— y MapLibre pide de veinte en veinte.
 *
 * Así que se hacen en fila. No es una limitación disfrazada de decisión:
 * sombrear una tesela son unos milisegundos de GPU, y veinte en fila siguen
 * cabiendo de sobra en el tiempo que tardan en llegar las teselas de la red.
 * Lo que sí importa es que la fila NO bloquea el hilo: cada una espera su turno
 * con un `await`, y entre medias el mapa se mueve.
 */

let tail: Promise<unknown> = Promise.resolve()

export function inTurn<T>(job: () => Promise<T>): Promise<T> {
  // El `catch` es lo que impide que una tesela que falle se lleve por delante
  // toda la cola detrás de ella.
  const run = tail.then(job, job)
  tail = run.catch(() => undefined)
  return run
}
