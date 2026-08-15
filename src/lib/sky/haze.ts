/**
 * El aire que hay ENTRE la cámara y lo que se mira.
 *
 * QUÉ FALTABA. MapLibre aplica su bruma —`fog-*`— a las capas que drapea sobre
 * el terreno, y no a las personalizadas. O sea que el relieve lejano se
 * desvanecía correctamente y las nubes, la lluvia y el mar no: una nube a 40 km
 * se dibujaba tan nítida y tan oscura como la que está encima de la cabeza. La
 * perspectiva aérea es de los indicios de profundidad más fuertes que hay —es
 * lo que hace que una sierra lejana se vea azulada y desvaída— y sin ella la
 * escena se lee plana por mucho volumen que tengan las nubes.
 *
 * EL COEFICIENTE NO ES UN AJUSTE: ES DISPERSIÓN DE RAYLEIGH. La atmósfera tiene
 * un espesor óptico vertical de ~0,10 a 550 nm, y con una altura de escala de
 * 8 km eso son 1,25·10⁻⁵ por metro a nivel del mar. Es el mismo fenómeno que
 * enrojece el sol al ponerse y que hace azul el cielo: aquí solo se está mirando
 * de lado en vez de hacia arriba.
 *
 * Lo que da, para tenerlo escrito donde se pueda comprobar —fracción de la nube
 * que se pierde en el aire, con aire limpio—:
 *
 *      5 km   6 %        30 km   31 %
 *     10 km  12 %        45 km   43 %   (la isla entera, de punta a punta)
 *     20 km  22 %       100 km   71 %
 *
 * LA CALIMA MULTIPLICA. El polvo sahariano no es un velo que se suma: es
 * material en suspensión que dispersa muchísimo más que el aire limpio, y con un
 * episodio cerrado el horizonte desaparece a pocos kilómetros. El multiplicador
 * va con `light.calima`, que es el PM10 MEDIDO por las estaciones traducido en
 * `ocean/light.ts`, y no con `light.haze` —que arranca en 0,15 aun con el aire
 * limpio, porque ahí significa otra cosa: cuánto se difumina el reflejo del sol
 * sobre el agua—. Con calima llena la extinción se hace ocho veces la del aire
 * limpio y deja la isla entera al 97 % de bruma, que es exactamente lo que se ve
 * un día de calima desde la Cumbre.
 *
 * EL COLOR ES EL DEL HORIZONTE, por lo mismo que la bruma del relieve: la
 * perspectiva aérea converge a la radiancia del cielo en la dirección en que se
 * mira. Que las nubes y el terreno se desvanezcan al MISMO color es lo que hace
 * que estén en la misma escena y no en dos capas superpuestas.
 */

import type { OceanLight } from '../ocean/light'

/**
 * Extinción del aire limpio a nivel del mar, por metro.
 *
 * Rayleigh a 550 nm: espesor óptico vertical 0,10 repartido en 8 km de altura de
 * escala. No se separa por canal a propósito —la dispersión real tiñe de azul, y
 * eso ya lo trae el COLOR al que se desvanece, que es el del horizonte.
 */
export const RAYLEIGH_PER_M = 1.25e-5

/**
 * Cuánto multiplica la calima. Ocho, en el episodio cerrado.
 *
 * No sale de una medida propia: sale de la definición del propio índice, que ya
 * está calibrado en `ocean/light.ts` entre 40 y 300 µg/m³ de PM10 —el umbral
 * donde el cielo empieza a verse lechoso y aquel en el que ya no se ve el
 * horizonte—. «No se ve el horizonte» es justamente lo que este ocho produce: a
 * 45 km deja el 97 % de bruma.
 */
export const HAZE_FACTOR = 8

/** Extinción de ahora mismo, por metro. */
export function hazeExtinction(light: OceanLight): number {
  return RAYLEIGH_PER_M * (1 + (HAZE_FACTOR - 1) * light.calima)
}

/**
 * Qué fracción de lo que hay a `meters` de distancia se ha comido el aire.
 *
 * 0 pegado a la cámara, 1 cuando ya no se ve nada. Es `1 − e^(−βd)`, la ley de
 * Beer, la misma que usa la autosombra de las nubes para atravesarlas.
 */
export function hazeFraction(light: OceanLight, meters: number): number {
  return 1 - Math.exp(-hazeExtinction(light) * Math.max(0, meters))
}
