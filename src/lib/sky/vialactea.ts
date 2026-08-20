/**
 * Cuánto se ve la Vía Láctea esta noche, que es una pregunta con respuesta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA IDEA, Y POR QUÉ NO ES UNA OPACIDAD A GUSTO. La Vía Láctea no cambia: es
 * una luminancia fija en el cielo. Lo que cambia es el fondo contra el que se
 * mira, y ese fondo lo MIDEN los fotómetros del Cabildo cada pocos minutos.
 * Así que «cuánto se ve» no hay que elegirlo, sale de dividir:
 *
 *     fracción = L_vialactea / (L_vialactea + L_cielo)
 *
 * que es la parte de la luz que llega de esa dirección que pone ella. Es un
 * número de 0 a 1 con significado físico, y se apaga solo cuando sale la luna
 * sin que nadie tenga que escribir «si hay luna, bajar la opacidad».
 *
 * DE DÓNDE SALE LA LUMINANCIA DE LA VÍA LÁCTEA, que es el único número que no
 * mide este repositorio. El mapa de `prepare-vialactea.ts` trae cinco niveles
 * de contorno de d3-celestial y **ninguna calibración fotométrica**: son curvas
 * de nivel, no medidas. Hay que anclarlas a algo, y el ancla es la cifra que sí
 * está publicada y es la misma en toda la literatura de cielo oscuro: **en sus
 * regiones más brillantes la Vía Láctea sube el fondo de cielo unas 0,4
 * magnitudes por segundo de arco cuadrado.**
 *
 * De ahí sale todo lo demás sin elegir nada más. Contra el cielo oscuro de
 * referencia de la isla —`ISLAND_DARK_SKY`, 21,6, que sí está medido contra el
 * archivo de la red—, subir 0,4 mag significa:
 *
 *     L_total / L_cielo = 10^(0,4 · 0,4) = 1,445
 *     L_nucleo / L_cielo = 0,445
 *     m_nucleo = 21,6 + 2,5 · log10(1 / 0,445) = 22,48
 *
 * `MW_PEAK_MAG` es ese 22,48. No es un gusto: es la consecuencia aritmética de
 * una cifra publicada y una constante medida, y si cualquiera de las dos se
 * toca, ésta se vuelve a derivar.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTO PREDICE, Y ES LO QUE HAY QUE MIRAR PARA SABER SI ESTÁ BIEN:
 *
 * | Cielo | mag/arcsec² | fracción del núcleo | en pantalla |
 * |---|---:|---:|---:|
 * | La Cumbrecita, lo más oscuro del archivo | 22,43 | 0,489 | 0,88 |
 * | Noche buena en el Roque | 21,60 | 0,308 | 0,55 |
 * | Con la luna en cuarto | 20,00 | 0,093 | 0,17 |
 * | Luna llena | 18,50 | 0,025 | 0,045 |
 * | Crepúsculo civil | 16,00 | 0,003 | 0,005 |
 *
 * De la noche buena a la luna llena hay un factor **12,3**, y ése es el número
 * que decide si esto está bien: cualquiera que haya subido a la cumbre sabe que
 * con luna llena la Vía Láctea no está. Aquí no está porque el fotómetro dice
 * que el cielo son 18,5, no porque alguien haya escrito una regla.
 *
 * EL BRILLO EN PANTALLA SÍ ES REPRESENTACIÓN, igual que el disco de la luna, y
 * por el mismo motivo: 0,31 de fracción luminosa no son 0,31 de blanco en un
 * monitor. `MW_DISPLAY_GAIN` es el único número elegido de este fichero y está
 * marcado como tal — lo que NO es representación es la FORMA: cómo sube y baja
 * con lo que miden los fotómetros, y la extinción que la apaga cerca del suelo.
 */

import { ISLAND_DARK_SKY } from '../stars/skyglow'

/**
 * Cuánto sube el fondo de cielo la Vía Láctea en sus regiones más brillantes,
 * mag/arcsec². La cifra publicada, y el ancla de todo lo demás.
 */
export const MW_PEAK_DELTA_MAG = 0.4

/**
 * Brillo superficial del nivel más alto del mapa, mag/arcsec². DERIVADO de
 * `MW_PEAK_DELTA_MAG` contra `ISLAND_DARK_SKY`; ver la cabecera.
 */
export const MW_PEAK_MAG =
  ISLAND_DARK_SKY + 2.5 * Math.log10(1 / (Math.pow(10, 0.4 * MW_PEAK_DELTA_MAG) - 1))

/**
 * El valor del mapa que corresponde a ese nivel.
 *
 * Son los cinco contornos anidados de `prepare-vialactea.ts` a 40 cada uno: el
 * núcleo recibe la suma de los cinco. **Tiene que coincidir con `LEVEL_STEP` ×
 * niveles de aquel script**, y hay una prueba que abre el PNG y lo comprueba,
 * porque un desajuste aquí no daría un error sino una Vía Láctea del brillo
 * equivocado.
 */
export const MW_PEAK_VALUE = 200

/**
 * Ganancia de pantalla. **ELEGIDA, no medida**, y es la única de este fichero.
 *
 * Lleva la fracción luminosa a una opacidad que se lee en un monitor: con 1,8,
 * la noche buena del Roque —fracción 0,308— sale a 0,55 de blanco sumado, que
 * es un brazo galáctico claro sin que parezca una nube. La luna llena, con su
 * 0,025, queda en 0,045: presente si se busca, invisible si no.
 */
export const MW_DISPLAY_GAIN = 1.8

/**
 * El índice B−V de la luz integrada de la Vía Láctea.
 *
 * Se pasa por `starColor`, el mismo cuerpo negro con el que se colorean las
 * 8920 estrellas del catálogo, y por el mismo motivo que los planetas: para que
 * el color no sea una paleta. Es luz de miles de millones de estrellas
 * promediadas, y sale del crema pálido que promedian.
 */
export const MW_COLOR_INDEX = 0.75

/**
 * Brillo superficial de un valor del mapa, mag/arcsec².
 *
 * El mapa es LINEAL EN LUMINANCIA —cinco contornos de peso igual—, así que un
 * valor a la mitad es la mitad de luz, que son 0,75 magnitudes más flojo.
 * Devuelve `Infinity` para el cero: donde no hay Vía Láctea no hay brillo, y
 * eso no es «muy débil», es nada.
 */
export function milkyWayMagArcsec2(value: number): number {
  const v = Math.max(0, Math.min(1, value / MW_PEAK_VALUE))
  if (v <= 0) return Infinity
  return MW_PEAK_MAG - 2.5 * Math.log10(v)
}

/**
 * La fracción de la luz de esa dirección que pone la Vía Láctea, de 0 a 1.
 *
 * `airMass` y `extinctionK` la apagan cerca del horizonte igual que apagan una
 * estrella, con la misma k medida del sitio: la banda que se hunde por el oeste
 * se pone naranja y se va, y eso no es un efecto, es la misma atmósfera.
 */
export function milkyWayFraction(
  value: number,
  skyMagArcsec2: number,
  airMass = 1,
  extinctionK = 0,
): number {
  const v = Math.max(0, Math.min(1, value / MW_PEAK_VALUE))
  if (v <= 0) return 0
  const magnitude = MW_PEAK_MAG - 2.5 * Math.log10(v) + extinctionK * airMass
  const ratio = Math.pow(10, -0.4 * (magnitude - skyMagArcsec2))
  return ratio / (1 + ratio)
}

/**
 * Lo que la capa dibuja: la fracción por la ganancia, recortada a 1.
 *
 * Va aquí y no en el sombreador para que una prueba pueda comprobar las cifras
 * de la tabla de la cabecera sin abrir un navegador. El sombreador hace la
 * misma cuenta por píxel, y `vialactea.test.ts` no deja que se separen.
 */
export function milkyWayAlpha(
  value: number,
  skyMagArcsec2: number,
  airMass = 1,
  extinctionK = 0,
): number {
  return Math.min(1, MW_DISPLAY_GAIN * milkyWayFraction(value, skyMagArcsec2, airMass, extinctionK))
}
