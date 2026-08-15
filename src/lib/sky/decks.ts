/**
 * A qué altura se dibuja cada estrato de nube.
 *
 * LAS BANDAS SON LAS DE OPEN-METEO, NO LAS DE LA OMM, y la diferencia importa.
 * La clasificación clásica pone el piso medio entre 2 y 7 km; Open-Meteo define
 * sus tres variables por otro corte —bajo hasta **3 km**, medio de **3 a 8 km**,
 * alto **por encima de 8 km**— y las cifras que llegan son suyas. Dibujar el
 * `cloud_cover_mid` de Open-Meteo a la altura que la OMM llama media pondría la
 * nube 1000 m por debajo de donde el número dice que está. Se usa la definición
 * de quien da el dato, aunque no sea la del libro.
 *
 * DENTRO DE LA BANDA BAJA, MANDA LA MEDIDA. Los 3 km de Open-Meteo son un techo
 * de clasificación, no una altura: una nube de alisio no está a 3000 m, está
 * pegada a la inversión, que en esta isla anda por los 1000-1600 m. Esa cota sí
 * está medida —`clouds.ts` la saca de los sondeos, y con su banda de error—, así
 * que cuando hay manta diagnosticada el estrato bajo se dibuja EN ELLA y no en
 * una altura de catálogo. Es la diferencia entre una nube que corta la cumbre
 * por donde de verdad la corta y una que flota mil metros por encima.
 *
 * Sin manta diagnosticada queda el nivel de condensación por ascenso (Espy),
 * que es lo que ya usa la capa de vapor para saber dónde dejar de subir. Y si
 * tampoco hay, se dibuja con un valor por defecto DECLARADO como tal: quien
 * mire el panel ve de dónde sale la cota de lo que está viendo.
 */

import type { CloudDeck } from '../clouds'

export type Etage = 'low' | 'mid' | 'high'

export interface Deck {
  /** Cota de la base, m. */
  base: number
  /** Cota de la cima, m. */
  top: number
}

/** De dónde sale la cota del estrato bajo. Se enseña en el panel. */
export type LowDeckSource = 'deck' | 'lcl' | 'default'

/**
 * Techo de la banda baja de Open-Meteo. Nada que se llame `low` sube de aquí,
 * pase lo que pase con la medida: si la inversión saliera más alta que esto, lo
 * que hay arriba ya lo está contando `cloud_cover_mid`.
 */
export const LOW_BAND_TOP_M = 3000

/**
 * Espesor de la capa baja cuando no hay una cima medida.
 *
 * 500 m. Los estratocúmulos del alisio son una capa fina —la manta de La Palma
 * se cruza en coche subiendo a la Cumbre en un par de minutos—, y la propia
 * `clouds.ts` mide bandas de inversión de ese orden. Solo se usa cuando la cima
 * no viene de un sondeo; cuando viene, manda el sondeo.
 */
const LOW_THICKNESS_M = 500

/**
 * Espesor mínimo de la capa baja, m.
 *
 * Una banda de espesor cero no es una nube: es un plano, y en pantalla sale
 * como una lámina sin volumen. 150 m es lo justo para que la cúpula de las
 * motas tenga dónde desarrollarse. Se aplica cuando el sondeo devuelve una
 * inversión muy fina o cuando el recorte al techo de la banda la aplasta.
 */
const MIN_THICKNESS_M = 150

/**
 * Cota por defecto de la base baja, cuando no hay ni sondeo ni superficie.
 *
 * 1200 m: el centro del intervalo en el que `clouds.ts` viene encontrando la
 * inversión del alisio en esta isla. No es una medida de hoy —por eso se
 * etiqueta `default` y el panel lo dice—, es el sitio menos equivocado donde
 * poner una nube cuando no se sabe nada más de hoy.
 */
const DEFAULT_LOW_BASE_M = 1200

/**
 * Banda media, dentro de los 3–8 km de Open-Meteo.
 *
 * No se centra en la banda: se pone en su tercio bajo, 3500-4700 m. El
 * altocúmulo, que es lo que de verdad ocupa este piso en subtrópico marítimo,
 * vive cerca del suelo de la banda; y a 8 km una capa dibujada sobre una isla
 * de 45 km llena la pantalla entera desde cualquier cámara inclinada, tapando
 * justo lo que se ha venido a ver.
 */
export const MID_DECK: Deck = { base: 3500, top: 4700 }

/**
 * Banda alta. El cirro real anda entre 8 y 12 km; se dibuja en la parte baja
 * del rango por lo mismo que la media, y muy fino: 400 m. Un cirro es un velo,
 * y darle espesor de cúmulo lo convierte en una losa que no se parece a nada.
 */
export const HIGH_DECK: Deck = { base: 8200, top: 8600 }

/**
 * Dónde va el estrato bajo hoy, y de dónde sale esa cota.
 *
 * `lclM` es el nivel de condensación por ascenso en metros, si se ha podido
 * calcular con la temperatura y el punto de rocío de superficie. Es la misma
 * cifra que ya gobierna el techo de la capa de vapor, así que la bruma que sube
 * y la nube que se forma con ella coinciden en la cota en vez de contradecirse.
 */
export function lowDeck(
  deck: CloudDeck | null,
  lclM: number | null,
): Deck & { source: LowDeckSource } {
  if (deck?.present) {
    // La banda medida, recortada al techo de la clasificación. `clouds.ts` da
    // base y cima de la INVERSIÓN, que es lo que encierra la manta.
    //
    // La base se recorta dejando sitio para el espesor mínimo, no pegada al
    // techo. Recortándola a `TOP − 100` y pidiendo después `base + 150` de
    // espesor, una inversión alta —base 2900, cima 3400— salía con la cima en
    // 3050: cien metros POR ENCIMA del techo de la banda, o sea dibujando como
    // nube baja algo que `cloud_cover_mid` ya está contando. Lo cazó la prueba;
    // a ojo no se ve, porque las dos líneas son correctas por separado.
    const base = Math.max(100, Math.min(deck.base, LOW_BAND_TOP_M - MIN_THICKNESS_M))
    const top = Math.max(base + MIN_THICKNESS_M, Math.min(deck.top, LOW_BAND_TOP_M))
    return { base, top, source: 'deck' }
  }
  if (lclM !== null && Number.isFinite(lclM) && lclM > 0) {
    const base = Math.min(lclM, LOW_BAND_TOP_M - LOW_THICKNESS_M)
    return { base, top: base + LOW_THICKNESS_M, source: 'lcl' }
  }
  return {
    base: DEFAULT_LOW_BASE_M,
    top: DEFAULT_LOW_BASE_M + LOW_THICKNESS_M,
    source: 'default',
  }
}

/** La banda de un estrato, con la baja ya resuelta. */
export function deckFor(etage: Etage, low: Deck): Deck {
  if (etage === 'low') return low
  return etage === 'mid' ? MID_DECK : HIGH_DECK
}
