/**
 * Cuánto tiempo lleva seco cada trozo de isla.
 *
 * POR QUÉ NO SALE DE LA RED DEL CABILDO. Las 37 estaciones frescas publican
 * `dailyprecipitation` y **las 37 publican cero** —comprobado el 13 ago 2026, y
 * ya está escrito en el README—, así que no hay de dónde sacar una serie de
 * lluvia insular. Sale del archivo de reanálisis de Open-Meteo, y por tanto es
 * **un modelo**, con la misma regla que el mapa de viento: va etiquetado como
 * modelo en todas partes, y no se hace pasar por una medida.
 *
 * Y NO SE INTERPOLA, que en esta aplicación es una norma y no una preferencia.
 * La vertiente noreste recibe múltiplos de la suroeste a igual altitud, así que
 * dibujar una superficie continua de lluvia entre dos puntos sería inventarla.
 * Cada punto de la isla toma **la celda del modelo que le toca**, sin promediar
 * con las vecinas — el mismo trato de `masked-field.ts` que ya reciben el CO₂ y
 * la cobertura móvil.
 *
 * LA RESOLUCIÓN, MEDIDA. Pidiendo diez puntos repartidos por la isla el
 * 13 ago 2026, el archivo devolvió **seis celdas distintas**: es una malla de
 * ~0,1°, o sea unos 11 km, sobre una isla de 42 × 28 km. No resuelve un
 * barranco. Lo que sí resuelve —y por eso vale la pena— es el contraste que
 * manda en el régimen de incendios de La Palma, y ese día lo enseñaba entero:
 *
 *   | zona | última lluvia ≥ 1 mm | días secos | 30 d | 90 d |
 *   |---|---|---|---|---|
 *   | noreste (28,787 N / 17,794 O) | 29 jul 2026 | 15 | 29,1 mm | 77,7 mm |
 *   | noroeste (28,787 N / 17,897 O) | 29 jul 2026 | 15 | 3,2 mm | 31,3 mm |
 *   | centro-cumbre (28,717 N / 17,877 O) | 12 jul 2026 | 32 | 0,0 mm | 27,7 mm |
 *   | este (28,647 N / 17,754 O) | 12 jul 2026 | 32 | 0,0 mm | 16,7 mm |
 *   | sur (28,506 N / 17,816 O) | 12 jun 2026 | **62** | 0,0 mm | **4,7 mm** |
 *
 * El sur lleva dos meses sin una lluvia apreciable y 4,7 mm en tres meses, y el
 * noreste ha recibido dieciséis veces más en la misma ventana. Eso no es ruido
 * de celda: es el alisio, y es la razón de que el mapa de incendios no pueda
 * ser un número para toda la isla.
 *
 * AQUÍ NO HAY UMBRALES DE PELIGRO. Este fichero saca tres números de una serie
 * de lluvia diaria y se para. Cuánto pesa cada uno lo dice el modelo entrenado.
 */

/** Un día de lluvia del archivo. `mm` a `null` cuando el archivo no lo trae. */
export interface RainDay {
  /** `2026-08-13`, día UTC completo, que es como está fechado el archivo. */
  day: string
  mm: number | null
}

/**
 * Cuánta lluvia cuenta como lluvia, en milímetros de un día.
 *
 * Medido sobre las seis celdas de la isla con el archivo entero de 2026, del 1
 * de enero al 13 de agosto. Días secos que sale con cada umbral:
 *
 *   | celda | 0,1 mm | 0,5 mm | **1 mm** | 2 mm | 5 mm |
 *   |---|---|---|---|---|---|
 *   | noreste | 14 | 15 | **15** | 15 | 15 |
 *   | noroeste | 15 | 15 | **15** | 15 | 33 |
 *   | centro-cumbre | 31 | 32 | **32** | 33 | 33 |
 *   | este | 32 | 32 | **32** | 33 | 33 |
 *   | sur | 32 | 32 | **62** | 62 | 91 |
 *
 * Los dos extremos fallan por motivos opuestos, y los dos borran señal:
 *
 *  - **Con 0,1 mm el sur sale igual que el centro** —32 días los dos— porque
 *    un día de julio con dos décimas de reanálisis, que no llega a mojar el
 *    suelo, cancela dos meses de sequía. Ese punto es el más seco de la isla y
 *    el umbral lo estaba escondiendo.
 *  - **Con 5 mm el noroeste salta de 15 días a 33**, tirando una lluvia real
 *    de entre 1 y 5 mm que sí contó.
 *
 * Entre 1 y 2 mm el reparto es idéntico y estable, y separa las tres
 * situaciones que de verdad hay en la isla: 15 días al norte, 32 en el centro
 * y el este, 62 en el sur. Se queda en 1 mm, que además es el escalón con el
 * que la AEMET llama a un día «de precipitación apreciable».
 */
export const RAIN_DAY_MM = 1

/** Ventanas de acumulado, en días. La corta manda en el combustible fino; la larga, en el matorral. */
export const RAIN_WINDOWS = [30, 90] as const

export interface Dryness {
  /**
   * Días **de calendario** desde el último con ≥ `RAIN_DAY_MM`. `null` si en
   * toda la serie no llovió: eso no son «infinitos días secos», es que la
   * ventana no llega, y decirlo importa.
   *
   * De calendario y no de dato: lo que seca el combustible es el tiempo que
   * pasa, no cuántas filas trajo el archivo.
   */
  daysSinceRain: number | null
  /**
   * Cuántos de esos días vinieron **sin dato**.
   *
   * Es la letra pequeña de la cifra de arriba y por eso viaja pegada a ella. Un
   * «62 días sin llover» con 40 días sin dato por medio no es una racha seca,
   * es una racha sin mirar: pudo llover en cualquiera de esos cuarenta. Quien
   * enseñe el número decide qué hacer con esto; lo que no puede es no saberlo.
   */
  gapDays: number
  /** Lluvia acumulada en los últimos 30 días, en mm. */
  rain30: number
  /** Lluvia acumulada en los últimos 90 días, en mm. */
  rain90: number
  /** Días de la serie con dato. Sin esto, una serie a medias parece una isla seca. */
  days: number
}

/**
 * Los números, de una serie ordenada de más antigua a más reciente.
 *
 * Un día sin dato **no suma cero milímetros a los acumulados**: se salta.
 * Tratar un hueco del archivo como un cero es la forma más fácil de inventarse
 * una sequía.
 */
export function dryness(series: readonly RainDay[]): Dryness {
  let daysSinceRain: number | null = null
  let gapDays = 0
  let rain30 = 0
  let rain90 = 0
  let days = 0
  let missingSoFar = 0

  const n = series.length
  for (let i = n - 1; i >= 0; i--) {
    const mm = series[i].mm
    const back = n - 1 - i

    if (mm === null || !Number.isFinite(mm)) {
      if (daysSinceRain === null) missingSoFar++
      continue
    }

    days++
    if (back < 30) rain30 += mm
    if (back < 90) rain90 += mm
    if (daysSinceRain === null && mm >= RAIN_DAY_MM) {
      daysSinceRain = back
      gapDays = missingSoFar
    }
  }

  return { daysSinceRain, gapDays, rain30, rain90, days }
}
