/**
 * Cuánto queda de la primera carga, capa por capa.
 *
 * EXISTE PORQUE LOS VALORES DE FÁBRICA CAMBIARON. Hasta el 22 de agosto de 2026
 * la primera visita llegaba con seis capas encendidas y las pesadas apagadas, y
 * lo que se descargaba al arrancar cabía en el arranque. Desde que las doce
 * vienen encendidas, quien abre la aplicación por primera vez pide además las
 * guaguas, las carreteras, el viario de OSM, la cobertura TDT y los aforos: en
 * el peor caso, sobre una red lenta, son unos segundos en los que aparecen
 * trazados donde antes no había nada. Una barra que diga cuántas van es la
 * diferencia entre «se está preparando» y «se está moviendo solo».
 *
 * AQUÍ NO HAY NINGUNA PETICIÓN NI NINGÚN `useState`. Esto es la aritmética —qué
 * cuenta como terminado— y por eso se puede probar en Node; quien tiene los
 * ganchos delante es `hooks/useFirstLoad.ts`, y quien lo pinta,
 * `components/boot/FirstLoad.tsx`.
 *
 * LA REGLA QUE NO ES OBVIA: una capa cuenta como terminada TAMBIÉN CUANDO
 * FALLA. La barra dice cuánto falta de la primera carga, no cuántas capas han
 * llegado bien: si el viario de OSM no contesta, quien está mirando el mapa no
 * tiene que quedarse con una barra clavada en 4/5 para siempre. Que la capa no
 * está se dice donde ya se decía —en su aviso del panel—, no aquí.
 */

/** Lo que cada gancho de carga sabe de sí mismo. */
export interface Load {
  /** La petición está en marcha ahora mismo. */
  loading: boolean
  /** Ya hay datos, o ya se sabe que no los va a haber. */
  ready: boolean
}

/** Y lo que la barra recuerda de cada uno entre un render y el siguiente. */
export interface Step {
  /** Se le ha visto pedir alguna vez. Sin esto no se puede distinguir «aún no
   *  ha empezado» de «ya ha terminado»: en los dos, `loading` vale `false`. */
  seen: boolean
  done: boolean
}

export const PENDING: Step = { seen: false, done: false }

/**
 * El estado nuevo de un paso a partir del anterior y de lo que dice su gancho.
 *
 * Es monótona a propósito: lo que ya está hecho no se deshace. Los ganchos de
 * capa reintentan al apagar y volver a encender el interruptor —`useOsmRoads`
 * lo hace explícitamente—, y sin esta regla la barra reaparecería a mitad de
 * sesión por un interruptor que alguien tocó, que no es «la primera carga».
 */
export function advance(prev: Step, load: Load): Step {
  if (prev.done) return prev
  if (load.ready) return { seen: true, done: true }
  const seen = prev.seen || load.loading
  return { seen, done: seen && !load.loading }
}

/** Los pasos hechos y los que hay. */
export function progress(steps: readonly Step[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length }
}

/**
 * CUÁNTO SE ESPERA COMO MUCHO: 120 segundos.
 *
 * Medido el 22 de agosto de 2026 CONTRA LA PRODUCCIÓN, pidiendo cada fichero a
 * `app.tiempopalmero.com` con `Accept-Encoding: br` y contando los bytes que
 * llegan. Y se mide así por algo: la primera versión de esta cuenta usó un
 * `brotli -q 11` local y daba 495 kB para el viario de OSM. Falso. Vercel no
 * comprime al máximo —son 896 kB—, o sea casi el doble, y con la cifra de
 * laboratorio este tope se habría quedado corto justo en la red donde hace
 * falta. Un número que decide algo se mide donde va a pasar:
 *
 *   viario de OSM      5.106 kB en crudo →  896 kB
 *   carreteras         1.369 kB          →  370 kB
 *   líneas de guagua   1.256 kB          →  222 kB
 *   red de guagua        323 kB          →   38 kB
 *   paradas de guagua    218 kB          →   23 kB
 *   cobertura TDT                            27 kB (PNG, ya comprimido)
 *
 * Son 1.576 kB por el cable, más los aforos, que son tres peticiones a la API
 * del Cabildo. Un teléfono a 200 kbit/s —la cobertura de un barranco de
 * Garafía— baja ese bulto en unos 63 s; a 1 Mbit/s, en 13. A los 120 la barra
 * se quita: es el doble del peor caso que se ha medido, y si a esas alturas
 * falta algo, lo que hay es una red que no está —una barra parada no lo arregla
 * ni lo explica.
 */
export const FIRST_LOAD_MAX_MS = 120_000

/**
 * Y CUÁNTO SE ESPERA ANTES DE ENSEÑARLA: 600 ms.
 *
 * Sin esta espera, una conexión buena enseña la pastilla y se la lleva en menos
 * de lo que dura su propia animación de entrada: un parpadeo en la esquina que
 * no da tiempo a leer y que parece un fallo de pintado. La barra existe para
 * explicar una espera; si no hay espera, no hay nada que explicar.
 */
export const FIRST_LOAD_MIN_WAIT_MS = 600
