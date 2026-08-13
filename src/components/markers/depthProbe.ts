/**
 * Callar la sonda de profundidad que MapLibre le pone a cada marcador.
 *
 * QUÉ HACE MAPLIBRE. Con terreno encendido, cada `Marker` comprueba por su
 * cuenta si hay montaña delante, y lo hace leyendo el búfer de profundidad de
 * la GPU: `Terrain.depthAtPoint()` es un `gl.readPixels()` de un píxel. Un
 * `readPixels` no es una lectura barata —obliga a la CPU a esperar a que la GPU
 * vacíe todo lo que tuviera en cola— y se paga una o dos veces por marcador,
 * cada 100 ms, mientras la cámara se mueva.
 *
 * CUÁNTO CUESTA, medido en producción el 13 de agosto de 2026 sobre un MacBook
 * Air M2 con Chromium y ANGLE/Metal: en un arrastre de 6 s con la vista
 * inclinada, **2.541 llamadas y 1.694 ms** dentro de esa misma ventana de
 * 6.000 ms. El 28 % del tiempo de reloj parado esperando a la GPU, y en 2D cero
 * llamadas. Las cifras completas y la comprobación de que no es una fuga están
 * en `lib/occlusion.ts`.
 *
 * QUÉ SE PONE EN SU LUGAR. La misma pregunta, contestada con el modelo de
 * elevación que la aplicación ya tiene en memoria, y contestada una vez por
 * pasada de reparto en lugar de una por marcador y por ventana. La oclusión no
 * se pierde: cambia de sitio.
 *
 * SOBRE TOCAR UN MÉTODO PRIVADO. `_updateOpacity` no es API pública y esto se
 * hace con los ojos abiertos. Tres cosas lo hacen aceptable:
 *
 *  1. Se sustituye **por instancia**, no en el prototipo. Ningún otro mapa,
 *     ningún otro marcador y ninguna otra librería se entera.
 *  2. El fallo, si MapLibre lo renombra, es benigno: el marcador vuelve a hacer
 *     su comprobación cara y se ve exactamente igual, solo más lento.
 *  3. Y aun así no se deja pasar en silencio: `depthProbe.test.ts` comprueba
 *     que el método sigue existiendo en el prototipo, así que una subida de
 *     versión que lo renombre rompe la suite en vez de devolver los 1.694 ms
 *     sin que nadie lo note.
 */

import type { Marker } from 'maplibre-gl'

/** El método de MapLibre que hace la lectura. En un solo sitio, y probado. */
export const DEPTH_PROBE = '_updateOpacity'

/**
 * Deja al marcador sin sonda de profundidad.
 *
 * Se llama justo después de `addTo(map)`: `addTo` invoca `_update()`, que a su
 * vez encola la primera comprobación, así que sustituirlo antes no serviría de
 * nada y sustituirlo mucho después dejaría pasar unas cuantas.
 */
export function silenceDepthProbe(marker: Marker): void {
  const m = marker as unknown as Record<string, unknown>
  if (typeof m[DEPTH_PROBE] !== 'function') return
  m[DEPTH_PROBE] = () => {}
}
