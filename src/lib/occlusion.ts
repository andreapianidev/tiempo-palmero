/**
 * ¿Se ve este punto desde donde está la cámara, o hay montaña delante?
 *
 * POR QUÉ EXISTE ESTE FICHERO, Y NO ES UNA MEJORA COSMÉTICA. MapLibre ya
 * resuelve la pregunta —un marcador tapado por una ladera se apaga— y la
 * resuelve bien, pero la resuelve **leyendo el búfer de profundidad de la GPU,
 * un marcador cada vez**: `Terrain.depthAtPoint()` hace un `gl.readPixels()` de
 * un solo píxel por marcador, y un `readPixels` obliga a la CPU a esperar a que
 * la GPU termine todo lo que tenía pendiente. Con 249 marcadores en pantalla
 * eso son cientos de paradas por segundo.
 *
 * MEDIDO el 13 de agosto de 2026 contra la aplicación en producción, en un
 * MacBook Air M2 con Chromium y ANGLE/Metal, con el MISMO gesto de seis
 * segundos en los dos modos (`scratchpad/profile3d.mjs`):
 *
 *   | modo                      | fps  | p95     | readPixels | tiempo en readPixels |
 *   |---------------------------|------|---------|------------|----------------------|
 *   | 2D, arrastre              | 57,0 | 17,6 ms |          0 |                 0 ms |
 *   | 3D, arrastre              | 43,9 | 35,3 ms |      2.541 |             1.694 ms |
 *   | 3D, Ctrl+arrastre (órbita)| 35,6 | 66,6 ms |      2.044 |             1.609 ms |
 *
 * 1.694 ms de espera dentro de una ventana de 6.000 ms son el **28 % del tiempo
 * de reloj** parado esperando a la GPU. En 2D no hay ni una sola llamada: todo
 * eso lo trae la vista inclinada, y todo eso son los marcadores.
 *
 * NO ES UNA FUGA. Se comprobó aparte, ocho órbitas idénticas seguidas
 * (`scratchpad/degrada.mjs`): los marcadores se quedan en 249, los nodos del
 * DOM en 617, las texturas de WebGL en 119, los búferes en 82 y los
 * framebuffers en 17 — planos de la primera vuelta a la octava. Lo que hay no
 * es algo que crezca, es un coste fijo y alto que se paga cada vez que la
 * cámara se mueve; se nota «al rato» porque en 3D uno se pasa el rato moviendo
 * la cámara, no porque empeore.
 *
 * LA ALTERNATIVA, QUE ES LA QUE HACE ESTE FICHERO. La misma pregunta se puede
 * contestar sin tocar la GPU, porque el modelo de elevación **ya está en
 * memoria**: son las mismas teselas terrarium de `public/dem/` con las que el
 * motor pone las cotas de cada punto. Se lanza el rayo de la cámara al punto y
 * se mira si el relieve lo corta. Son unas decenas de consultas bilineales por
 * marcador, en JavaScript, sin esperar a nadie.
 *
 * Y NO SE DIBUJA UN DATO DONDE NO PUEDE VERSE. Renunciar a la oclusión habría
 * sido más fácil y más rápido todavía, pero entonces la pastilla de una
 * estación del otro lado de la Caldera se leería encima de la pared que la
 * tapa, como si estuviera delante. Eso no es un defecto de dibujo: es enseñar
 * una medida en un sitio donde no está.
 */

import { elevationAt, type Dem } from './dem'
import { haversineKm } from './geo'

/** Dónde está la cámara. Sale de `map.transform.getCameraPosition()`. */
export interface Camera {
  lon: number
  lat: number
  /** Metros sobre el nivel del mar, ya en la escala que se está dibujando. */
  altitude: number
}

export interface Target {
  lon: number
  lat: number
  /** Cota real del punto, en metros. La exageración la aplica esta función. */
  elevation: number
}

/**
 * Separación entre muestras del rayo, en metros.
 *
 * 40 m es poco más de un píxel del DEM (33,54 m/píxel a z12): por debajo se
 * consulta dos veces el mismo píxel y no se entera uno de nada nuevo. Por
 * encima se empiezan a saltar cuchillas, y en esta isla las divisorias son
 * justo eso — la Cumbre Nueva tiene tramos de cresta de menos de 100 m de
 * ancho, y un paso de 200 m la cruzaría sin verla.
 */
export const SAMPLE_STEP_M = 40

/**
 * Tope de muestras por rayo. 220 × 40 m = 8,8 km, que es más que cualquier
 * tramo de isla que quepa en pantalla con la cámara a 65°; los rayos más largos
 * se muestrean algo más gruesos en vez de costar lo que no vale.
 */
export const MAX_SAMPLES = 220

/**
 * Cuánto tiene que asomar el relieve por encima del rayo para dar el punto por
 * tapado, en metros.
 *
 * NO ES UN NÚMERO ELEGIDO. Está medido contra el veredicto del propio MapLibre
 * —que lee la profundidad de la escena realmente dibujada, así que es la verdad
 * de lo que se ve en pantalla— sobre **1.843 puntos** de una rejilla repartida
 * por cuatro cámaras distintas de la isla, con inclinaciones de 58 a 65° y los
 * cuatro rumbos. Lo repite `scripts/checks/occlusion-margin.ts`.
 *
 * LAS DOS ORILLAS, en metros que el relieve asoma sobre la línea de visión
 * (negativo = el rayo pasa limpio, y por cuánto):
 *
 *   - de los 1.765 puntos que MapLibre da por VISIBLES: p50 −281, p95 **−31**;
 *   - de los 78 que da por TAPADOS: p05 **−63**, p50 +187, p95 +454.
 *
 * Las dos poblaciones están separadas por unos 250 m de mediana y se rozan solo
 * en la cola, que es donde vive un punto justo en el filo de una cresta. No hay
 * un valor que acierte el 100 %, y no lo hay por una razón que no se puede
 * quitar: MapLibre dibuja el terreno con la malla de teselas que tenga cargada
 * —más gruesa cuanto más lejos de la cámara— y aquí se consulta siempre el z12
 * completo. Son dos relieves parecidos, no el mismo.
 *
 * DÓNDE SE PONE, ENTONCES. Los dos errores no pesan igual, y la regla de la
 * casa es explícita: esconder un dato que sí se ve es peor que dibujar uno que
 * no, porque el que se esconde desaparece sin decir por qué.
 *
 *   | margen | esconde de más | deja pasar | aciertos |
 *   |--------|----------------|------------|----------|
 *   |    0 m |         3,5 %  |    12,8 %  |  96,1 %  |
 *   |   15 m |         2,8 %  |    16,7 %  |  96,6 %  |
 *   | **25 m** |     **2,4 %**|  **16,7 %**| **97,0 %**|
 *   |   40 m |         2,0 %  |    19,2 %  |  97,2 %  |
 *   |  100 m |         1,1 %  |    34,6 %  |  97,4 %  |
 *
 * 25 m es el último punto en el que bajar el «esconde de más» todavía es
 * gratis: de 0 a 25 m se recorta un tercio de ese error sin que el «deja pasar»
 * se mueva de su suelo (13 puntos de 78). A partir de ahí cada metro se paga
 * con puntos tapados que se dibujan, y la exactitud total ya no se mueve.
 */
export const CLEARANCE_MARGIN_M = 25

/**
 * De dónde a dónde se muestrea el rayo, en fracción del recorrido.
 *
 * No se empieza en la cámara ni se acaba en el punto, y las dos cosas importan:
 *
 *  - cerca de la cámara el rayo va casi pegado al suelo si la vista es rasante,
 *    y el propio terreno bajo la cámara taparía la isla entera;
 *  - en el último tramo el rayo aterriza EN el punto, así que el suelo del
 *    propio punto siempre está a distancia cero y todo se daría por tapado.
 */
const FROM = 0.04
const TO = 0.97

/**
 * Cuánto asoma el relieve por encima de la línea de visión, en metros.
 *
 * Positivo = hay montaña delante, y cuánta. Negativo = el rayo pasa limpio, y
 * por cuánto. Devuelve la cifra en vez de un sí/no porque es lo que permite
 * MEDIR el umbral en lugar de elegirlo: `occlusion-margin.ts` compara esta
 * distancia con el veredicto de MapLibre y enseña dónde se separan los dos
 * montones.
 *
 * `null` cuando el rayo se sale del modelo —el punto está fuera de la isla—:
 * ahí no hay relieve que pueda tapar nada y no hay nada que afirmar.
 */
export function reliefAboveSight(
  dem: Dem,
  camera: Camera,
  target: Target,
  exaggeration = 1,
): number | null {
  const distM = haversineKm([camera.lon, camera.lat], [target.lon, target.lat]) * 1000
  // La cámara justo encima del punto: no hay recorrido en el que meter una
  // montaña. Se resuelve aquí y no en el bucle, que con `distM` a cero daría
  // cero muestras y devolvería «visible» por accidente y no por razón.
  if (!(distM > 1)) return -Infinity

  const samples = Math.min(MAX_SAMPLES, Math.max(2, Math.round(distM / SAMPLE_STEP_M)))
  const camZ = camera.altitude
  const targetZ = target.elevation * exaggeration

  let worst = -Infinity
  for (let i = 0; i < samples; i++) {
    const t = FROM + ((TO - FROM) * i) / (samples - 1)
    const lon = camera.lon + (target.lon - camera.lon) * t
    const lat = camera.lat + (target.lat - camera.lat) * t
    const ground = elevationAt(dem, lon, lat)
    // Fuera del modelo es mar abierto: no tapa, pero tampoco cuenta.
    if (ground === null) continue
    const sight = camZ + (targetZ - camZ) * t
    const above = ground * exaggeration - sight
    if (above > worst) worst = above
  }
  return worst === -Infinity ? null : worst
}

/**
 * La respuesta de sí o no, que es lo que consume el mapa.
 *
 * Sin modelo de elevación devuelve `false`: si no se sabe, se enseña. Callar un
 * dato por no haber podido comprobar si se ve sería peor que enseñarlo de más.
 */
export function hiddenByRelief(
  dem: Dem | null,
  camera: Camera,
  target: Target,
  exaggeration = 1,
  margin = CLEARANCE_MARGIN_M,
): boolean {
  if (!dem) return false
  const above = reliefAboveSight(dem, camera, target, exaggeration)
  return above !== null && above > margin
}
