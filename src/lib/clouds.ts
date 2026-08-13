/**
 * El mar de nubes: dónde está la manta, y qué queda por encima.
 *
 * QUÉ AÑADE ESTE FICHERO. La inversión del alisio ya la localiza
 * `profile.ts` —gradiente ≥ −0,2 K/100 m y caída de humedad de más de 20
 * puntos, criterio de Torres, Cuevas, Guerra y Carreño (2002)—, y el motor la
 * usa por dentro desde hace tiempo para no extrapolar a través de ella. Lo que
 * no hacía nadie era CONTARLO, y contarlo bien exige dos cosas que la
 * inversión sola no da:
 *
 * 1. **Que la inversión tenga nubes debajo.** Una inversión seca es una capa
 *    estable con el cielo raso, y son frecuentes. Comprobado contra la API el
 *    13 ago 2026 sobre el centro de la isla: inversión de manual entre 1081 y
 *    1573 m —la temperatura SUBE de 19,8 a 21,2 °C y la humedad cae del 71 al
 *    21 %— con `cloud_cover_low` a cero. Anunciar «niebla en Tijarafe» ese día
 *    habría sido inventárselo. Por eso `present` exige las dos cosas.
 *
 * 2. **Admitir la resolución.** Los niveles de presión que encierran la banda
 *    crítica (900 y 850 hPa) están a ~493 m el uno del otro, más separados que
 *    el espesor del propio fenómeno. La cota que sale de aquí es una BANDA, no
 *    una línea, y todo lo que se publica lleva su `resolutionM` al lado.
 *    Medirla de verdad pediría un radiosondeo, que se lanza en Güímar y no
 *    aquí.
 *
 * Este módulo no descarga nada ni dibuja nada: recibe los perfiles que el
 * motor ya tiene y devuelve un diagnóstico. Quien lo pinta es `cloudMask.ts`
 * en el mapa y `CloudSea.tsx` en el panel.
 */

import type { VerticalProfile } from './profile'

/**
 * Nubosidad baja a partir de la cual se acepta que hay manta.
 *
 * 40 % no es un umbral publicado: es la línea que separa «nubes sueltas» de
 * «capa», y está puesta baja a propósito porque el error de decir que no hay
 * mar de nubes cuando sí lo hay es peor que el contrario —quien sube a la
 * cumbre y se la encuentra tapada pierde la excursión; quien no sube porque la
 * app dijo que había manta, también, pero además no se entera—. La interfaz
 * enseña siempre el porcentaje crudo al lado, para que se pueda juzgar.
 */
export const DECK_COVER_THRESHOLD = 40

export type DeckZone = 'below' | 'within' | 'above'

export interface CloudDeck {
  /** Hay inversión Y nubosidad baja suficiente. Lo demás es informativo. */
  present: boolean
  /** Cota inferior de la banda, m. Es el techo del aire húmedo. */
  base: number
  /** Cota superior de la banda, m. Por encima empieza el aire seco. */
  top: number
  /** ± de `base` y `top`: media distancia entre los niveles que la encierran. */
  resolutionM: number
  /** Salto térmico entre base y cima, K. Positivo = la temperatura sube. */
  deltaT: number
  /** Caída de humedad relativa entre base y cima, en puntos. Negativa. */
  deltaRh: number
  /** Nubosidad baja del modelo, %. `null` si la respuesta no la trajo. */
  coverage: number | null
  /** Instante de la pasada del modelo (epoch ms, UTC). */
  observedAt: number
  /** Cuántas columnas del sondeo vieron inversión, de cuántas se miraron. */
  agreement: { withInversion: number; total: number }
}

/**
 * Resume en un solo diagnóstico las columnas del sondeo.
 *
 * POR QUÉ UNA SOLA CIFRA PARA TODA LA ISLA. La tentación es dar una cota por
 * ladera, y sería más bonito; pero las columnas que el motor pide son cuatro y
 * están elegidas por altitud, no por vertiente, así que un mapa hecho con
 * ellas fingiría un detalle que no hay. La inversión del alisio es además un
 * rasgo sinóptico: su cota varía poco en 40 km, mucho menos que los ~493 m de
 * resolución vertical con los que se mide. Se da una banda insular y se dice
 * cuántas columnas la ven, que es la información honesta.
 *
 * La MEDIANA, no la media: con cuatro columnas, una que se desvíe arrastra la
 * media medio kilómetro y la mediana ni se entera.
 */
export function summarizeDeck(profiles: readonly VerticalProfile[]): CloudDeck | null {
  const withInversion = profiles.filter((p) => p.inversion !== null)
  if (!withInversion.length) return null

  const base = median(withInversion.map((p) => p.inversion!.base))
  const top = median(withInversion.map((p) => p.inversion!.top))
  const resolutionM = median(withInversion.map((p) => p.inversion!.resolutionM))
  const deltaT = median(withInversion.map((p) => p.inversion!.deltaT))
  const deltaRh = median(withInversion.map((p) => p.inversion!.deltaRh))

  const covers = profiles
    .map((p) => p.cloudCoverLow)
    .filter((c): c is number => c !== null)
  const coverage = covers.length ? median(covers) : null

  return {
    present: coverage !== null && coverage >= DECK_COVER_THRESHOLD,
    base,
    top,
    resolutionM,
    deltaT,
    deltaRh,
    coverage,
    // El diagnóstico no es más fresco que la más vieja de sus columnas.
    observedAt: Math.min(...withInversion.map((p) => p.observedAt)),
    agreement: { withInversion: withInversion.length, total: profiles.length },
  }
}

/**
 * En qué lado de la manta cae una altitud.
 *
 * `within` no significa «está nublado»: significa que la banda de
 * incertidumbre lo alcanza y NO se puede afirmar de qué lado está. Es la
 * respuesta correcta para una cota que cae dentro de los ±493 m, y la interfaz
 * la dice con esas palabras en vez de elegir una de las dos a cara o cruz.
 */
export function zoneAt(deck: CloudDeck, elevationM: number): DeckZone {
  if (elevationM < deck.base - deck.resolutionM) return 'below'
  if (elevationM > deck.top + deck.resolutionM) return 'above'
  return 'within'
}

/**
 * La cota a partir de la cual se puede prometer sol, redondeada a 50 m.
 *
 * Se redondea HACIA ARRIBA y desde el techo de la banda más su incertidumbre:
 * la cifra que se enseña es la primera altitud en la que la afirmación se
 * sostiene entera, no el centro de una probabilidad. Un número redondo también
 * comunica mejor que es una estimación — «por encima de 1.700 m» se lee como
 * lo que es, y «por encima de 1.683 m» promete una precisión que no existe.
 */
export function sunlightAbove(deck: CloudDeck): number {
  return Math.ceil((deck.top + deck.resolutionM) / 50) * 50
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
