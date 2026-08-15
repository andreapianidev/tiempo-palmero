/**
 * Cuánto oscurece una sombra arrojada. Y no es una constante.
 *
 * LA TENTACIÓN ERA PONER UN 0,6 Y SEGUIR. Sería un número elegido, y además
 * sería falso de una manera que se ve: una sombra no quita «la luz», quita **el
 * haz directo del sol**. Lo que queda dentro de ella es la luz del cielo, que
 * sigue llegando entera porque el cielo no lo tapa la montaña. Así que la
 * profundidad de una sombra es la proporción entre esas dos luces, y esa
 * proporción cambia muchísimo a lo largo del día.
 *
 * Y CAMBIA JUSTO AL REVÉS DE LO QUE UNO ESPERA. Con el sol alto, el haz directo
 * lo es casi todo y una sombra es un agujero negro. Con el sol rasante, el rayo
 * atraviesa diez veces más atmósfera, se debilita y se dispersa: al amanecer la
 * mayor parte de la luz que hay ya es cielo difuso, y una sombra apenas se
 * distingue. Es lo que se ve en cualquier amanecer — las sombras son larguísimas
 * y blandas, no negras.
 *
 * Esto importa además por una razón práctica. Las sombras arrojadas de esta isla
 * cubren, medido sobre el DEM el 15 de agosto de 2026, el **50,5 % de la tierra
 * con el sol a 5°**, el 44,7 % a 10°, el 13,1 % a 20°, el 4,0 % a 30°, el 0,6 %
 * a 45° y nada por encima de 60°. O sea que existen casi solo cuando el sol está
 * bajo, que es exactamente cuando esta función dice que tienen que ser suaves.
 * Con una profundidad constante, encender las sombras habría hundido media isla
 * en negro al amanecer; con ésta, media isla se apaga un tercio, que es lo que
 * hace de verdad.
 *
 * EL MODELO. Masa de aire de Kasten y Young (1989), transmitancia del haz
 * directo de Meinel y Meinel (0,7^AM^0,678) y reparto directo/difuso de cielo
 * claro de Liu y Jordan. Son tres fórmulas clásicas de ingeniería solar, no
 * ajustes de dibujo, y todas dependen solo de la altura del sol.
 */

const RAD = Math.PI / 180

/**
 * Masa de aire relativa. Kasten y Young (1989).
 *
 * La versión ingenua, `1/sen(h)`, se va a infinito en el horizonte y ya se
 * equivoca en un 10 % a 10° de altura. Ésta está ajustada a la atmósfera real y
 * vale hasta el propio horizonte, donde da 38 — que es el número que hace que un
 * atardecer sea naranja.
 */
export function airMass(elevationDeg: number): number {
  const h = Math.max(0, elevationDeg)
  return 1 / (Math.sin(h * RAD) + 0.50572 * Math.pow(h + 6.07995, -1.6364))
}

/**
 * Qué fracción de la luz de un punto se pierde al meterlo en la sombra.
 *
 * 0 = la sombra no se nota, 1 = dentro no llega nada. Lo que queda fuera del
 * cálculo, a propósito, es la luz reflejada por el terreno de alrededor, que en
 * un barranco estrecho rellena bastante: por eso esto es un techo y no una
 * medida exacta de lo que vería una cámara.
 *
 * Valores que da, para tenerlos escritos donde se puedan comprobar:
 *
 *   sol a 60° → 0,81     sol a 20° → 0,65     sol a  5° → 0,30
 *   sol a 45° → 0,78     sol a 10° → 0,48     sol a  2° → 0,13
 */
export function shadowDepth(elevationDeg: number): number {
  if (elevationDeg <= 0) return 0
  const am = airMass(elevationDeg)
  // Transmitancia del haz directo a través de esa masa de aire.
  const beam = Math.pow(0.7, Math.pow(am, 0.678))
  const sin = Math.sin(elevationDeg * RAD)
  // Sobre el plano horizontal: lo que llega en línea recta, y lo que llega
  // rebotado por el cielo. Liu y Jordan reparten la mitad de lo que la
  // atmósfera se come en difuso.
  const direct = beam * sin
  const diffuse = 0.5 * (1 - beam) * sin
  const total = direct + diffuse
  return total <= 0 ? 0 : direct / total
}
