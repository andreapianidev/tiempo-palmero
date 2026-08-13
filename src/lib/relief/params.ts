/**
 * Los números del sombreado. Todos medidos sobre el modelo de verdad.
 *
 * El banco de pruebas son las 63 teselas de `public/dem/12` montadas enteras
 * —1792 × 2304 px a 33,54 m/px, 711 km² de tierra emergida, cota máxima
 * 2400,1 m— y la pregunta no es «¿queda bonito?» sino **cuánta isla se queda
 * sin dibujar**, contada de dos maneras:
 *
 *   negro — píxeles de tierra por debajo del 5 % de luminancia. Ahí no hay
 *           forma: hay una mancha.
 *   plano — píxeles cuyo vecindario de 5 × 5 varía menos de 1/255. Aunque no
 *           estén negros, el ojo no puede sacar de ahí ninguna forma, porque
 *           todo el entorno cae dentro del mismo nivel de gris.
 *
 * Y se cuenta dos veces: sobre toda la isla, y solo sobre las **laderas que
 * miran entre el este y el suroeste**, que son el **32 %** de la tierra y las
 * que la luz cartográfica clásica —el sol en el noroeste— deja de espaldas.
 *
 *                                    toda la isla        laderas E–SO
 *                                   plano %  negro %   plano %  negro %
 *   una luz, noroeste                 0,21     1,91      0,38     5,67
 *   cuatro luces con pesos            0,53     0,11      0,13     0,33
 *   cuatro luces + textura            0,35     0,34      0,10     0,94
 *
 * Se lee así, y las dos orillas pesan igual:
 *
 *  - **Las cuatro luces son lo que arregla el problema de verdad.** En la cara
 *    que el sol no toca, el negro sin forma pasa del 5,67 % al 0,33 %: **17
 *    veces menos**. Esa es la vertiente de Mazo y Fuencaliente entera.
 *  - **Y tienen un precio, que también está medido.** Meter cuatro luces en el
 *    mismo rango de grises comprime el contraste local, y el «plano» de toda la
 *    isla EMPEORA: 0,21 → 0,53 %.
 *  - **El término de textura es quien paga ese precio.** Devuelve el plano a
 *    0,35 % en toda la isla y lo deja en 0,10 % en las laderas oscuras, que es
 *    menos de la mitad de lo que daba la luz única (0,38 %). O sea que la
 *    combinación final gana en las dos cuentas justo donde importa.
 *
 * El 0,34 % de negro de la última fila es la textura restando donde ya había
 * poco: sigue siendo 5,6 veces menos negro que la luz única, y a cambio es la
 * única de las tres que dibuja algo dentro de esa sombra.
 */

/** Píxeles por tesela de relieve. */
export const RELIEF_TILE_PX = 512

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
]

export const RELIEF_PARAMS = {
  /**
   * Los cuatro focos, en grados desde el norte. El noroeste es la convención
   * cartográfica —el cerebro lee como relieve lo iluminado desde arriba a la
   * izquierda, y al revés lo lee como agujero— y por eso es el que manda. Los
   * otros tres van repartidos hacia el oeste, el suroeste y el norte: cubren
   * el arco de aspectos que el principal deja de espaldas.
   */
  azimuths: new Float32Array([315, 270, 225, 0]),
  /**
   * Y lo que pesa cada uno. Suman 1, así que el resultado sigue siendo un
   * sombreado normalizado y no hay que reescalarlo después.
   */
  weights: new Float32Array([0.4, 0.24, 0.18, 0.18]),
  /**
   * Altura del sol. 42° y no los 45 de manual: con la pendiente máxima medida
   * en este modelo —362,7 %, o sea 74,6°, las paredes de la Caldera— un sol más
   * alto aplana la diferencia entre una ladera de 30° y una de 50°, que en esta
   * isla es la diferencia entre un camino y un despeñadero.
   */
  altitude: 42,
  /** Cuánto manda la oclusión sobre la luz directa. */
  sky: 0.35,
  /** Cuánto manda el realce de textura. */
  texture: 0.14,
  /**
   * A cuántos metros de resalte sobre su propio entorno satura ese realce.
   * 45 m es el orden de un barranco de medianía en esta isla: por debajo
   * quedan los surcos, por encima ya manda la luz.
   */
  textureScale: 45,
  /** Pendiente (en tangente) donde empieza a entrar el acento: 0,9 ≈ 42°. */
  accentAt: 0.9,
  accent: 0.3,

  /*
   * Los colores. Siguen siendo los del mapa oscuro, pero con más recorrido:
   * medido sobre la isla entera con estos dos extremos, la tierra emergida
   * queda con luminancia mediana **0,292** y va del 0,089 (p1) al 0,375 (p99).
   * El fondo anterior —el color de tierra #191714 con el `hillshade` encima—
   * se movía en un margen mucho más estrecho y por eso las capturas salían con
   * la isla convertida en una mancha parda.
   *
   * Se probaron cuatro parejas y se eligió por esa mediana, no por gusto: con
   * #a89d8b arriba sale en 0,387, que sobre un mar de 0,03 ya parece un recorte
   * pegado encima de otra aplicación. 0,29 es una isla iluminada dentro de un
   * mapa oscuro, que es lo que esto es.
   */
  shadow: new Float32Array(rgb('#090807')),
  highlight: new Float32Array(rgb('#7d7466')),
  accentColor: new Float32Array(rgb('#241f1a')),

  /**
   * El tinte hipsométrico: cálido abajo, frío arriba. Al 10 % y no más.
   *
   * Es lo que separa la platanera de la costa del pinar de cumbre sin escribir
   * una leyenda, y tiene que quedarse en un matiz por una razón que no es de
   * gusto: encima de este fondo se pinta la malla interpolada, y el color de la
   * malla ES la lectura. Un fondo con color propio compitiendo con ella haría
   * que un naranja de 28° se leyera distinto en la costa que en la cumbre.
   */
  warm: new Float32Array(rgb('#40352a')),
  cool: new Float32Array(rgb('#333a48')),
  tint: 0.1,
  /** La cota que da el tinte frío entero: la máxima medida en este modelo. */
  summit: 2400,
} as const
