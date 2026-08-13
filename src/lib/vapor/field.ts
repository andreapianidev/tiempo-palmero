/**
 * De dónde sale vapor, cuánto, y hasta dónde puede subir.
 *
 * LA CAPA DE VAPOR NO SE INVENTA SU INTENSIDAD. Todo lo que decide dónde se ve
 * bruma y dónde no sale de cosas que la aplicación ya calcula con las
 * estaciones del Cabildo:
 *
 *  1. **Cuánto evapora un sitio** lo manda el déficit de presión de vapor
 *     (`psychro.ts`), que es exactamente la variable física que mide la sed del
 *     aire: la diferencia entre el vapor que el aire podría contener a su
 *     temperatura y el que contiene. Con VPD alto la ladera suelta agua; con el
 *     aire ya saturado no suelta nada, por mucho que haga calor. Es la misma
 *     cifra que la aplicación enseña como variable del mapa.
 *
 *  2. **Hasta dónde sube** lo manda el nivel de condensación. Si hay mar de
 *     nubes diagnosticado (`clouds.ts`), el techo es su base: ahí es donde el
 *     vapor deja de ser invisible y pasa a ser la manta. Sin manta, el techo es
 *     el nivel de condensación por ascenso —la fórmula de Espy, sobre la
 *     temperatura y el rocío de la superficie—, que es la cota a la que ese
 *     aire, si sube, se satura.
 *
 * POR QUÉ UNA REJILLA GRUESA Y NO UN CÁLCULO POR PARTÍCULA. Estimar el paquete
 * higrotérmico completo cuesta un IDW sobre las estaciones vivas; hacerlo para
 * cada una de varios miles de partículas y en cada fotograma no cabe en el
 * presupuesto de una animación. La demanda evaporativa varía despacio en el
 * espacio —es una propiedad del aire y de la altitud, no del píxel—, así que se
 * muestrea una vez por refresco del modelo y se interpola bilinealmente.
 */

import { estimateBundle, type InterpolableVariable, type Model } from '../interpolate'
import { elevationAt, SEA_LEVEL_M, type Dem } from '../dem'
import { ISLAND_BBOX, pixelXToLon, pixelYToLat } from '../geo'
import type { CloudDeck } from '../clouds'

/**
 * Lado de la rejilla de demanda. 48 × 48 sobre los 42 km de isla son celdas de
 * ~1 km, más finas que la separación media entre estaciones del Cabildo: por
 * debajo de eso no se estaría muestreando el campo sino el interpolador.
 */
export const FIELD_SIDE = 48

/**
 * VPD, en kPa, a partir del cual una ladera se dibuja «evaporando a tope».
 *
 * MEDIDO, y medido sobre datos que nadie ha interpolado: las 3.707 lecturas de
 * temperatura y humedad que las 37 estaciones del Cabildo publicaron el 12 de
 * agosto de 2026, día completo (`__fixtures__/history-day.json`). Lo repite
 * `scripts/checks/vapor-scale.ts`.
 *
 *   mín 0,00 · p50 0,59 · p95 **1,94** · p99 2,67 · máx 3,51 kPa
 *
 * El techo va justo por encima del p95, y las dos orillas están medidas:
 *
 *   | techo   | satura   | casi invisible |
 *   |---------|----------|----------------|
 *   | 1,0 kPa | 17,2 %   |  9,6 %         |
 *   | 1,5 kPa |  9,0 %   | 13,4 %         |
 *   | **2,0** | **4,7 %**| **17,8 %**     |
 *   | 3,0 kPa |  0,2 %   | 31,0 %         |
 *
 * A 1,0 kPa se satura una lectura de cada seis y las tardes de sotavento salen
 * todas iguales de intensas: el mapa deja de distinguir justo en las horas que
 * tienen algo que contar. A 3,0 casi un tercio de la isla queda por debajo del
 * umbral de visibilidad y la capa se apaga sola. A 2,0 solo saturan las
 * lecturas de verdad extremas —las medianías de sotavento a mediodía, que en
 * ese día llegaron a 3,51— y lo que queda «casi invisible» es la cumbre por
 * encima de la inversión, donde el aire está de hecho casi saturado. Que ahí no
 * se dibuje bruma no es un defecto de la escala: es el dato.
 *
 * OJO CON MEDIR ESTO SOBRE EL CAMPO INTERPOLADO. Se probó, y sale otra cosa: a
 * las 09:00 de ese mismo día el campo estimado sobre las 9.886 celdas de tierra
 * emergida va de 0,00 a 0,79 kPa, mientras las estaciones medían hasta 2,98 esa
 * misma hora. La interpolación suaviza los extremos —es su trabajo—, así que
 * una escala calibrada contra ella se quedaría corta en cuanto la capa se
 * dibujara sobre un episodio de verdad.
 */
export const VPD_FULL_KPA = 2.0

/**
 * Gradiente adiabático seco y su prima, la caída del punto de rocío.
 *
 * La fórmula de Espy sale de que al ascender sin condensar la temperatura baja
 * a 9,8 K/km y el punto de rocío a ~1,8 K/km: se juntan a 8 K/km, así que la
 * saturación llega a `125 × (T − Td)` metros. Es la aproximación de manual, y
 * es honesta mientras el aire no esté ya casi saturado.
 */
export const ESPY_M_PER_K = 125

/** Techo por si no hay ni manta ni datos: la cota máxima de la isla, redondeada. */
export const DEFAULT_CEILING_M = 2400

export interface VaporField {
  /** `[oeste, sur, este, norte]`. */
  bounds: [number, number, number, number]
  width: number
  height: number
  /**
   * Demanda evaporativa por celda, de 0 a 1. Fila 0 = norte, como una imagen.
   * Vale 0 sobre el mar: aquí no se dibuja evaporación oceánica, que existe pero
   * no es lo que estas estaciones miden.
   */
  demand: Float32Array
  /** Cota de condensación, en metros. El vapor no se dibuja por encima. */
  ceilingM: number
  /** De dónde salió el techo, para poder decirlo en la interfaz. */
  ceilingFrom: 'deck' | 'lcl' | 'default'
  /** Qué fracción de la isla tiene demanda por encima de la mitad de la escala. */
  activeShare: number
}

/** Muestreo bilineal de la demanda. Fuera del campo, cero. */
export function demandAt(field: VaporField, lon: number, lat: number): number {
  const [w, s, e, n] = field.bounds
  const fx = ((lon - w) / (e - w)) * (field.width - 1)
  const fy = ((n - lat) / (n - s)) * (field.height - 1)
  if (!(fx >= 0 && fy >= 0 && fx <= field.width - 1 && fy <= field.height - 1)) return 0
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(field.width - 1, x0 + 1)
  const y1 = Math.min(field.height - 1, y0 + 1)
  const dx = fx - x0
  const dy = fy - y0
  const g = (x: number, y: number) => field.demand[y * field.width + x]
  return (
    g(x0, y0) * (1 - dx) * (1 - dy) +
    g(x1, y0) * dx * (1 - dy) +
    g(x0, y1) * (1 - dx) * dy +
    g(x1, y1) * dx * dy
  )
}

/**
 * El techo de condensación, y de dónde sale.
 *
 * Con manta diagnosticada manda la manta, y manda por su BASE menos la
 * resolución: la banda de incertidumbre de `clouds.ts` es de ~493 m, y hacer
 * que el vapor llegue hasta el centro de esa banda sería dibujar bruma dentro
 * de una franja donde no se puede afirmar que la haya. Se corta por abajo, que
 * es el lado en el que equivocarse se ve menos y afirma menos.
 */
export function condensationCeiling(
  deck: CloudDeck | null,
  surfaceTempC: number | null,
  surfaceDewC: number | null,
): { ceilingM: number; from: VaporField['ceilingFrom'] } {
  if (deck?.present) {
    return { ceilingM: Math.max(200, deck.base - deck.resolutionM), from: 'deck' }
  }
  if (surfaceTempC !== null && surfaceDewC !== null && surfaceTempC > surfaceDewC) {
    const lcl = ESPY_M_PER_K * (surfaceTempC - surfaceDewC)
    return { ceilingM: Math.min(DEFAULT_CEILING_M, Math.max(150, lcl)), from: 'lcl' }
  }
  return { ceilingM: DEFAULT_CEILING_M, from: 'default' }
}

/**
 * Construye el campo. Una vez por refresco del modelo, no por fotograma.
 *
 * Devuelve `null` sin modelo de temperatura: sin él no hay VPD que calcular, y
 * una capa de vapor con intensidad inventada sería justo lo que esta aplicación
 * no hace. Mejor no dibujar nada.
 */
export function buildVaporField(
  dem: Dem | null,
  models: Record<InterpolableVariable, Model | null>,
  deck: CloudDeck | null,
): VaporField | null {
  if (!dem || !models.temperature) return null

  const { west, south, east, north } = ISLAND_BBOX
  const demand = new Float32Array(FIELD_SIDE * FIELD_SIDE)
  let land = 0
  let active = 0
  // La superficie de referencia para el nivel de condensación: la media de la
  // isla emergida, no un punto elegido. Un solo punto haría que el techo del
  // vapor de toda la isla dependiera de la estación que le tocara al lado.
  let tempSum = 0
  let dewSum = 0
  let counted = 0

  for (let j = 0; j < FIELD_SIDE; j++) {
    const lat = north - ((north - south) * j) / (FIELD_SIDE - 1)
    for (let i = 0; i < FIELD_SIDE; i++) {
      const lon = west + ((east - west) * i) / (FIELD_SIDE - 1)
      const elevation = elevationAt(dem, lon, lat)
      // El mar no evapora aquí. No porque no evapore —evapora, y mucho— sino
      // porque estas estaciones no lo miden y dibujarlo sería adorno.
      if (elevation === null || elevation <= SEA_LEVEL_M) continue
      land++

      // El VPD ya viene derivado en el paquete: recomponerlo aquí a partir de
      // T y humedad sería tener la misma fórmula en dos sitios que pueden
      // separarse.
      const bundle = estimateBundle(models, lon, lat, elevation)
      const vpd = bundle.vpd?.value ?? null
      const t = bundle.temperature?.value ?? null
      if (vpd === null || t === null) continue

      const value = Math.max(0, Math.min(1, vpd / VPD_FULL_KPA))
      demand[j * FIELD_SIDE + i] = value
      if (value > 0.5) active++

      tempSum += t
      dewSum += bundle.dewpoint?.value ?? t
      counted++
    }
  }

  const ceiling = condensationCeiling(
    deck,
    counted ? tempSum / counted : null,
    counted ? dewSum / counted : null,
  )

  return {
    bounds: [west, south, east, north],
    width: FIELD_SIDE,
    height: FIELD_SIDE,
    demand,
    ceilingM: ceiling.ceilingM,
    ceilingFrom: ceiling.from,
    activeShare: land ? active / land : 0,
  }
}

/** Solo para pruebas y para el trazado de la rejilla: el centro de una celda. */
export function cellCenter(
  field: VaporField,
  i: number,
  j: number,
): { lon: number; lat: number } {
  const [w, s, e, n] = field.bounds
  return {
    lon: w + ((e - w) * i) / (field.width - 1),
    lat: n - ((n - s) * j) / (field.height - 1),
  }
}

/** Lo usa `particles.ts` para no volver a escribir la conversión de píxel. */
export { pixelXToLon, pixelYToLat }
