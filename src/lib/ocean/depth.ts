/**
 * Cuánto se acerca el agua a la cámara para ganarle al terreno, y por qué eso
 * NO puede ser un número fijo.
 *
 * ES EL GEMELO DEL SESGO DE PROFUNDIDAD DEL SOMBREADOR DE VÉRTICES, igual que
 * `coverage.ts` lo es de la primera decisión del de fragmentos: la GPU no puede
 * llamar a TypeScript, y un número que decide si el mar se sube a una ladera
 * tiene que poder medirse sin abrir un navegador.
 *
 * EL PROBLEMA. El mar es un plano, y su silueta contra la tierra la dibuja
 * ENTERAMENTE la prueba de profundidad contra la malla del terreno (ver la
 * cabecera de `OceanLayer.ts`). Para que esa prueba no la pierda contra la
 * lámina plana que MapLibre pone sobre el mar, el agua se empuja un poco hacia
 * la cámara. Hasta el 15 de agosto de 2026 ese empujón se daba en coordenadas
 * de recorte —`gl_Position.z -= 1e-4 * w`— con el argumento de que así «no
 * depende ni de la distancia ni del triángulo».
 *
 * ES VERDAD EN EL BÚFER Y FALSO EN EL MUNDO. El búfer de profundidad guarda
 * 1/z, así que un escalón constante en NDC vale cada vez más metros cuanto más
 * lejos cae el punto, y crece con el CUADRADO de la distancia:
 *
 *     metros = ndc · (f − n) · d² / (2 · f · n)
 *
 * MEDIDO sobre las mismas cuentas que hace `_calcMatrices` de maplibre-gl 4.7.1
 * —`nearZ = alto/50`, `farZ` del horizonte, campo de visión de 36,87°— para la
 * vista que enseña la isla entera (alto 739 px, inclinación 68°, 30 m por
 * píxel: la cámara queda a 12,5 km):
 *
 *   | distancia | `1e-4` vale | cota que trepa | suelo invadido al 10 % |
 *   |-----------|-------------|----------------|------------------------|
 *   |   24,9 km |      69,8 m |         34,9 m |                  349 m |
 *   |   36,4 km |     149,3 m |         51,0 m |                  510 m |
 *   |   59,9 km |     403,9 m |         84,0 m |                  840 m |
 *
 * Cuatrocientos metros de agua tirada hacia la cámara le ganan la prueba a todo
 * terreno que asome menos de 404·sen(θ) sobre el plano. Y con la misma costa en
 * primer plano —cámara a 700 m, 1,45 m por píxel— el mismo `1e-4` valía 3,6 m a
 * 1,4 km: nada. Por eso la invasión aparecía al alejarse y se curaba al
 * acercarse, que es exactamente lo que se veía en pantalla.
 *
 * LA SOLUCIÓN TIENE TRES TÉRMINOS, y ninguno sobra:
 *
 *  1. UN SUELO EN METROS (`BIAS_M`). El empujón se da en el mundo —el vértice
 *     se mueve hacia la cámara por su propio rayo, así que su posición en
 *     pantalla no cambia, solo su profundidad— y vale lo mismo de cerca que de
 *     lejos. Un metro: el mar se sube a un metro de cota y a nada más.
 *  2. UN MÍNIMO EN ESCALONES DEL BÚFER (`BIAS_STEPS`). Un metro es mucho a 2 km
 *     y es nada a 300 km: allí un solo escalón de un búfer de 24 bits ya vale
 *     12,1 m, y el agua desaparecería a partir de una línea recta —que es el
 *     fallo que el `1e-4` estaba tapando—. El empujón nunca baja de cuatro
 *     escalones del búfer QUE HAYA, medidos a la distancia de cada vértice.
 *  3. UN TECHO EN COTA TREPADA (`MAX_LEAK_M`). El término de los escalones se
 *     dispara donde el búfer es malo: con 16 bits, a 60 km pediría 493 m. El
 *     techo no lo mide en metros de empujón sino en lo único que importa —
 *     cuánta ladera se come—, y lo deja en tres metros de cota pase lo que pase.
 *
 * Los tres se turnan solos: cerca manda el metro, lejos mandan los escalones y
 * el techo solo aparece donde el búfer no da para las dos cosas. Con 24 bits el
 * relevo cae más allá de los 40 km, o sea fuera de la isla, y sobre La Palma
 * manda el metro y nada más. `depth.test.ts` mide las dos orillas: que el mar
 * no se suba a la ladera Y que siga estando ahí en el horizonte.
 *
 * LO QUE CUESTA, Y DÓNDE. Con un búfer de 16 bits las dos cosas no caben:
 * ganarle la profundidad a la lámina plana a 300 km pediría un empujón de 12 km,
 * y 12 km sobre un rayo rasante meten el agua por delante de 500 m de isla. El
 * techo se impone y el mar se apaga —medido— más allá de los 12 km. Es la
 * decisión, no un descuido: entre un mar que se pierde en la distancia y un mar
 * por delante de la Cumbre Nueva, lo primero. Con 24 bits, que es lo que da
 * cualquier GPU de esta década, el mismo cálculo pone ese límite en 1.800 km,
 * seis veces el alcance del propio mar.
 */

/**
 * El suelo del empujón, en metros de mundo.
 *
 * Un metro. Contra la ladera se traduce en `BIAS_M · sen(θ)` metros de cota
 * trepada —34 cm con la vista a 20°—, que sobre una pendiente del 10 % son 3,4 m
 * de suelo: un octavo de píxel a la escala de la vista de isla. El límite por
 * abajo no es la estética sino la lámina plana de MapLibre: `SEA_LIFT_M` la
 * separa 2 m en el mundo, y este metro es el margen que hace que esa separación
 * sobreviva al redondeo del búfer.
 */
export const BIAS_M = 1

/**
 * Y el mínimo, en escalones del búfer de profundidad.
 *
 * Cuatro. Uno bastaría si el redondeo fuera perfecto en los dos lados de la
 * comparación —el agua y la malla del terreno se cuantizan a la misma rejilla—;
 * cuatro es el margen que aguanta que las dos posiciones no salgan de la misma
 * cuenta. Subirlo sale caro justo donde el búfer es peor.
 */
export const BIAS_STEPS = 4

/**
 * El techo, medido en cota de terreno que el agua puede cubrir.
 *
 * Tres metros. No es una elección estética: es un píxel. En la vista que enseña
 * la isla entera —30 m por píxel— tres metros de cota sobre una pendiente del
 * 10 % son 30 m de suelo, o sea un píxel de orilla mal puesta. Por debajo de eso
 * no hay nada que ver, y por encima empieza a verse. Tiene que ser mayor que el
 * metro de `BIAS_M` —si no, el techo pelearía con el suelo en las vistas
 * picadas, donde `sen(θ)` vale casi 1—, y lo es por tres veces.
 */
export const MAX_LEAK_M = 3

/**
 * Bits del búfer de profundidad cuando la GPU no lo dice.
 *
 * Dieciséis, que es el peor caso realista. Equivocarse por abajo cuesta un poco
 * de mar trepado —acotado por `MAX_LEAK_M`—; equivocarse por arriba cuesta que
 * el mar desaparezca a lo lejos, que es el fallo más visible de los dos.
 */
export const FALLBACK_DEPTH_BITS = 16

/** Lo que ocupa un escalón del búfer en NDC, donde la z va de −1 a 1. */
export function ndcStep(bits: number): number {
  return 2 / Math.pow(2, bits)
}

export interface Frustum {
  /** Distancia del punto a la cámara, en las mismas unidades que `near` y `far`. */
  distance: number
  near: number
  far: number
}

/**
 * Cuántas unidades de mundo vale un salto de `ndc` en el búfer, a esa distancia.
 *
 * Es la derivada de la profundidad en perspectiva, `z_ndc = A − B/d`, invertida.
 * Crece con el cuadrado de la distancia: ahí está todo el problema.
 */
export function worldPerNdc(ndc: number, frustum: Frustum): number {
  const { distance, near, far } = frustum
  return (ndc * (far - near) * distance * distance) / (2 * far * near)
}

/** La inversa: cuánto NDC gana acercarse `world` unidades. */
export function ndcPerWorld(world: number, frustum: Frustum): number {
  const { distance, near, far } = frustum
  return (world * 2 * far * near) / ((far - near) * distance * distance)
}

/**
 * Hasta qué cota se sube el agua con ese empujón, en metros.
 *
 * El agua le gana la prueba a todo terreno que esté a menos de `biasM` de ella
 * MEDIDO SOBRE EL RAYO. Un punto de terreno a cota `h` y el punto del plano que
 * hay debajo caen sobre el mismo rayo separados `h / sen(θ)`, así que el agua
 * trepa hasta `h = biasM · sen(θ)` y ni un centímetro más.
 */
export function leakHeightM(biasM: number, sinDepression: number): number {
  return biasM * Math.abs(sinDepression)
}

/** Y eso, sobre una ladera de esa pendiente, cuántos metros de suelo son. */
export function leakGroundM(biasM: number, sinDepression: number, slopeGrade: number): number {
  return leakHeightM(biasM, sinDepression) / slopeGrade
}

export interface BiasInputs extends Frustum {
  /** Bits del búfer de profundidad. */
  depthBits: number
  /**
   * Seno del ángulo de picado del rayo: `(z_cámara − z_punto) / distancia`.
   * Es lo que convierte metros de empujón en metros de ladera trepada.
   */
  sinDepression: number
  /** Cuántos metros vale una unidad del frustum. MapLibre mide en píxeles. */
  metersPerUnit: number
}

/**
 * El empujón definitivo, en unidades del frustum. Gemelo exacto del GLSL.
 *
 * El sombreador no conoce `near` ni `far` —no se los pasa nadie— así que en vez
 * de esta fórmula sondea la matriz: proyecta el vértice y lo vuelve a proyectar
 * un poco más cerca, y de la diferencia saca los mismos metros por escalón que
 * salen aquí. Las dos versiones tienen que dar lo mismo, y `depth.test.ts` lo
 * comprueba contra una matriz de perspectiva de verdad.
 */
export function biasWorld(input: BiasInputs): number {
  const floor = BIAS_M / input.metersPerUnit
  const steps = worldPerNdc(BIAS_STEPS * ndcStep(input.depthBits), input)
  const ceiling = MAX_LEAK_M / input.metersPerUnit / Math.max(Math.abs(input.sinDepression), 1e-6)
  return Math.min(Math.max(floor, steps), Math.max(floor, ceiling))
}
