/**
 * La memoria de la espuma, sin navegador.
 *
 * La espuma de verdad no nace y muere en el mismo instante: la ola que rompe
 * deja una mancha que se deshace en decenas de segundos, y los regueros del
 * viento atraviesan el mar arrastrándose. La GPU lo pinta con un campo de
 * espuma que acumula lo que rompe y decae en cada fotograma; este fichero es
 * el gemelo de esa cuenta, para que el tiempo de vida se pueda medir y probar
 * sin abrir un WebGL.
 *
 * `decay` es exp(−dt/τ): a los τ segundos queda exactamente 1/e de la espuma
 * que había, que es la definición de vida media exponencial y la que usa el
 * sombreador.
 */

/**
 * Vida media de la espuma, en segundos. Quince.
 *
 * La banda que deja una ola al romper se ve minutos en según qué mares, pero
 * la que se distingue como blanca —que es lo que esto dibuja— se funde en el
 * orden de los diez o veinte segundos. Medido en pantalla contra la rompiente
 * de Tazacorte: con 8 s la estela se lee como un parpadeo detrás de la ola y
 * con 30 el mar se queda sucio entre trenes de olas; 15 deja la estela justo
 * hasta que llega la ola siguiente, que es lo que hace el mar de verdad.
 */
export const FOAM_LIFETIME_S = 15

/** Cuánto queda de la espuma anterior tras `dtS` segundos. Gemelo del GLSL. */
export function foamDecay(dtS: number): number {
  return Math.exp(-Math.max(0, dtS) / FOAM_LIFETIME_S)
}
