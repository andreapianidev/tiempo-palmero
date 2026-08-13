/**
 * Los modelos de combustible, que es la forma en que un incendio ve el suelo.
 *
 * NO ES UN MAPA DE VEGETACIÓN. Un mapa de vegetación dice «pinar canario»; un
 * modelo de combustible dice «hojarasca ligera y esponjosa bajo arbolado», que
 * es lo que decide cómo corre el fuego. La diferencia importa porque un
 * castañar abandonado y un pinar joven pueden arder igual siendo especies
 * distintas, y dos pinares con distinta densidad de sotobosque no.
 *
 * DE DÓNDE SALE. De la cartografía de **modelos de combustible de Canarias**
 * que publica el Gobierno de Canarias, recortada a La Palma: 14.153 polígonos a
 * 25 m con la clasificación estándar de **Anderson (1982)**, «Aids to
 * determining fuel models for estimating fire behavior», USDA Forest Service
 * (los trece modelos NFFL). En esta isla aparecen nueve de los trece.
 *
 * Esa cartografía cubre 53.935 de las 70.666 ha de la isla — lo forestal. El
 * 24 % restante es agricultura, y ahí el hueco lo rellena en compilación el
 * mapa de cultivos del Cabildo traducido a estos mismos modelos
 * (`scripts/ml/crops.py`, donde está escrita la equivalencia y por qué).
 *
 * EL PELIGRO DE CADA MODELO NO ESTÁ AQUÍ. Este fichero solo nombra y describe.
 * Cuánto pesa cada modelo lo aprende el clasificador de los cinco incendios que
 * de verdad ha habido, y vive en `public/fire/model.json`. Escribir aquí que el
 * 7 arde más que el 5 sería la corazonada que este repositorio no admite: el
 * manual dice el orden, no dice cuánto.
 */

/** El número de modelo NFFL. 0 es «sin combustible», no «sin dato». */
export type FuelModel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/**
 * Sin clasificar por ninguna de las dos fuentes.
 *
 * Se guarda como 255 y no como 0 a propósito. «No lo sé» y «no hay
 * combustible» son cosas distintas, y confundirlas pintaría de tranquilo todo
 * lo que la cartografía no llegó a mirar — que es el error que más caro sale en
 * una capa de incendios.
 */
export const FUEL_UNKNOWN = 255

/** Cómo se llama cada modelo, en corto, para una ficha. */
export const FUEL_LABEL: Readonly<Record<number, string>> = {
  0: 'Sin combustible',
  1: 'Pasto fino y bajo',
  2: 'Pasto con matorral disperso',
  3: 'Pasto alto',
  4: 'Matorral alto y denso',
  5: 'Matorral bajo',
  6: 'Matorral con hojarasca',
  7: 'Matorral bajo arbolado',
  8: 'Hojarasca compacta',
  9: 'Hojarasca de pinar',
  [FUEL_UNKNOWN]: 'Sin clasificar',
}

/**
 * Qué es cada modelo con algo más de detalle, para el panel del punto.
 *
 * Descripciones de Anderson (1982) resumidas, con lo que cada una es en esta
 * isla cuando se puede decir sin inventar. El pinar canario es el caso más
 * claro: su hojarasca de acículas largas es el ejemplo de manual del modelo 9.
 */
export const FUEL_DETAIL: Readonly<Record<number, string>> = {
  0: 'Roca, agua, suelo desnudo o urbano. No hay nada que arda.',
  1: 'Herbáceas finas y curadas, menos de un tercio de metro. El fuego corre rápido y se apaga solo al llegar a cualquier otra cosa.',
  2: 'Pasto continuo con matorral o arbolado disperso encima. El pasto lleva el fuego y lo que hay encima lo alimenta.',
  3: 'Pasto alto y denso, por encima de un metro. No aparece en la cartografía de La Palma.',
  4: 'Matorral alto y continuo con mucho material muerto en pie. Es el modelo de fuego más intenso de la escala.',
  5: 'Matorral bajo y verde, con poca carga muerta. Arde con dificultad salvo con viento.',
  6: 'Matorral de porte medio que ya ha perdido hoja. Necesita viento para propagar, y con él corre.',
  7: 'Matorral inflamable bajo arbolado, capaz de arder aun con el combustible húmedo.',
  8: 'Hojarasca compacta bajo arbolado denso. Arde despacio y por el suelo.',
  9: 'Hojarasca ligera y esponjosa bajo arbolado. En La Palma es la pinocha del pinar canario.',
  [FUEL_UNKNOWN]: 'La cartografía de combustible no llega a este punto.',
}

/**
 * Los modelos que la cartografía de La Palma contiene de verdad, y cuánta isla
 * ocupa cada uno.
 *
 * Medido el 13 ago 2026 sobre la tabla de valores del ráster de 25 m que
 * acompaña a la cartografía (superficie = píxeles × 625 m²):
 *
 *   | modelo | ha | qué es en La Palma |
 *   |---|---:|---|
 *   | 7 | 18.794 | matorral bajo arbolado — la mayor extensión de la isla |
 *   | 0 | 9.272 | sin combustible |
 *   | 2 | 8.803 | pasto con matorral |
 *   | 9 | 7.549 | pinar canario |
 *   | 1 | 6.062 | pasto |
 *   | 6 | 1.577 | matorral con hojarasca |
 *   | 4 | 1.025 | matorral alto |
 *   | 8 | 806 | hojarasca compacta |
 *   | 5 | 45 | matorral bajo |
 *
 * El 3 no aparece, y por eso la lista no es de 1 a 9.
 */
export const FUEL_MODELS_PRESENT: readonly number[] = [0, 1, 2, 4, 5, 6, 7, 8, 9]

/** Etiqueta de un valor cualquiera del ráster, incluido el que no reconoce. */
export function fuelLabel(model: number): string {
  return FUEL_LABEL[model] ?? FUEL_LABEL[FUEL_UNKNOWN]
}

/** La descripción larga, con la misma tolerancia. */
export function fuelDetail(model: number): string {
  return FUEL_DETAIL[model] ?? FUEL_DETAIL[FUEL_UNKNOWN]
}
