/**
 * De qué color y de qué brillo sale la luna en pantalla.
 *
 * VIVE FUERA DE LA CAPA porque es la única parte de ella que se puede probar sin
 * una tarjeta gráfica: entra una altura y sale un color. Es la misma razón por
 * la que `sun-screen.ts` no está dentro de `SunLayer`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUÉ ES MEDIDA Y QUÉ ES DIBUJO, que en esta función conviven las dos y hay que
 * poder distinguirlas de un vistazo:
 *
 * | | De dónde sale |
 * |---|---|
 * | Enrojecimiento con la altura | **Medido**: extinción del sitio × masa de aire de Kasten y Young, repartida por canal |
 * | Que la luna baja se apague | **Medido**: la misma transmitancia |
 * | Luminancia del disco | **Dibujo**: la luna llena es 18 magnitudes más brillante que el cielo, y eso en una pantalla no cabe |
 * | Luz cenicienta | **Dibujo en la amplitud, medida en la forma** |
 * | Palidez de la luna de día | **Dibujo** |
 *
 * LA LUZ CENICIENTA MERECE LA EXPLICACIÓN ENTERA porque es la que más se parece
 * a una mentira. La parte oscura del disco no está oscura: la ilumina la Tierra,
 * y por eso en una creciente de tres días se ve el círculo completo. Su forma es
 * física y sale gratis —la Tierra vista desde la luna está iluminada justo al
 * revés, así que la ceniza es proporcional a `1 − fracción iluminada`—. Su
 * AMPLITUD no: de verdad son unas diez milésimas del lado iluminado, y a esa
 * escala en una pantalla lineal no la vería nadie. Se dibuja al 2,2 %, que es lo
 * que el ojo saca de esas diez milésimas. Es la misma decisión que ya está
 * escrita para el tamaño de las estrellas: lo que se dibuja es la respuesta del
 * ojo, no el objeto.
 *
 * LA LUNA DE DÍA SE VE, y ésa es la razón de que no se apague sola. Su
 * superficie brilla a 3,4 mag/arcsec² y el cielo azul de mediodía anda por 4 o
 * 5: la luna es MÁS brillante que el cielo, solo que por poco, y por eso se ve
 * pálida en vez de deslumbrante. Aquí eso se hace bajando la luminancia del
 * disco hasta rozar la del cielo dibujado. Apagarla del todo de día habría sido
 * cómodo y falso: media isla la ve por la mañana.
 */

import { airMass } from '../shadow/depth'
import { dayFactor } from '../sun'

export interface MoonLookInput {
  /** Altura aparente de la luna, grados. Con refracción, como se ve. */
  apparentElevationDeg: number
  /** Fracción iluminada del disco, 0 a 1. */
  illumination: number
  /** Coeficiente de extinción del sitio, mag por masa de aire, en la banda V. */
  extinctionK: number
  /** Altura del sol, grados. Decide cuánto cielo hay compitiendo. */
  sunElevationDeg: number
}

export interface MoonLook {
  /** Color del disco iluminado, ya enrojecido por el aire que tiene delante. */
  color: [number, number, number]
  /** Luminancia del lado iluminado, 0 a 1. */
  luminance: number
  /** Luminancia de la parte que ilumina la Tierra. */
  earthshine: number
  /** 0 de noche cerrada, 1 con el sol alto. */
  dayness: number
}

/**
 * Albedo de la luna en sRGB, normalizado al canal rojo.
 *
 * La luna NO es blanca: su índice de color B−V es 0,92, más rojo que el sol
 * (0,65). Es un gris cálido, del color de un asfalto viejo, y solo parece
 * blanca porque de noche es lo único que hay. Dibujarla de blanco puro es el
 * atajo de siempre y se nota justo cuando sale con el cielo todavía azul.
 */
const MOON_ALBEDO: [number, number, number] = [1.0, 0.965, 0.895]

/**
 * Extinción por canal, en múltiplos de la de la banda V.
 *
 * El aire se lleva el azul primero: a nivel del mar los coeficientes típicos son
 * 0,09 en el rojo, 0,15 en el visual y 0,28 en el azul, o sea 0,60 y 1,87 veces
 * el visual. Se escriben como razones y no como valores absolutos porque el
 * coeficiente V ya lo calcula `visibility.ts` con la presión y la altitud
 * MEDIDAS del sitio: desde el Roque es 0,130 y al nivel del mar 0,252, y el
 * reparto entre canales es el mismo en los dos.
 */
const CHANNEL_EXTINCTION: [number, number, number] = [0.6, 1.0, 1.87]

/** Luminancia del disco de noche y con el sol alto. Ver la cabecera. */
const NIGHT_LUMINANCE = 0.97
const DAY_LUMINANCE = 0.78

/**
 * Amplitud de la luz cenicienta con la Tierra llena, contra el 0,97 del lado
 * iluminado: una relación de 44 a 1. Ver la cabecera para por qué no es la
 * relación de verdad, que son 10 000 a 1.
 *
 * MEDIDO A OJO CONTRA EL SOMBREADOR, que es lo único que se puede hacer con una
 * cifra de dibujo, y por las dos orillas: con 0,05 la cara oscura de una luna en
 * cuarto se leía como una bola gris —y en cuarto la ceniza no se ve—; por debajo
 * de 0,015 desaparecía también en la creciente fina, que es justo cuando sí se
 * ve.
 */
const EARTHSHINE = 0.022

export function moonLook(input: MoonLookInput): MoonLook {
  const dayness = dayFactor(input.sunElevationDeg)
  const x = airMass(input.apparentElevationDeg)

  const color: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const magnitudes = input.extinctionK * CHANNEL_EXTINCTION[i] * x
    color[i] = MOON_ALBEDO[i] * Math.pow(10, -0.4 * magnitudes)
  }

  // Se renormaliza al canal más fuerte: si no, la luna del horizonte saldría
  // correctamente enrojecida y, además, casi negra. Lo que la atmósfera hace
  // con una luna baja es CAMBIARLE EL COLOR mucho antes que apagarla, igual que
  // con el sol —y por eso el disco del sol tampoco se atenúa—. El apagado real
  // ocurre por debajo del horizonte, donde no se dibuja nada.
  const peak = Math.max(color[0], color[1], color[2], 1e-6)
  color[0] /= peak
  color[1] /= peak
  color[2] /= peak

  return {
    color,
    luminance: NIGHT_LUMINANCE + (DAY_LUMINANCE - NIGHT_LUMINANCE) * dayness,
    // El exponente es 1 y no un ajuste: la fracción iluminada de la TIERRA
    // vista desde la luna es exactamente `1 − k`, porque su ángulo de fase es el
    // suplementario del lunar. La forma es física; la amplitud, no.
    earthshine: EARTHSHINE * (1 - input.illumination) * (1 - dayness),
    dayness,
  }
}
