/**
 * La línea de estado de la cabecera del móvil, en trozos.
 *
 * En el escritorio esto son tres bloques de la barra lateral —el modelo, la
 * salud de la red y el aviso de caída—; en una pantalla estrecha no cabe nada
 * de eso encima del mapa, así que se reduce a una sola línea que contesta lo
 * único imprescindible: si lo que se está viendo sale de sensores vivos.
 *
 * Es una función pura y separada del componente porque decide QUÉ se dice, que
 * es lo que se puede equivocar; el componente solo lo pinta.
 */

import type { InterpolableVariable, Model } from '../../lib/interpolate'
import type { NetworkCensus } from '../../lib/quality'
import { t } from '../../i18n'

export interface StatusPart {
  text: string
  /** En ámbar: lo que hay que mirar primero. */
  strong?: boolean
}

interface Input {
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  loading: boolean
  upstreamError: string | null
  /** Ubicación pedida y todavía sin respuesta del navegador. */
  locating: boolean
  /** El navegador dijo que no, o no contestó a tiempo. */
  locationDenied: boolean
}

export function buildStatus({
  models,
  census,
  loading,
  upstreamError,
  locating,
  locationDenied,
}: Input): StatusPart[] {
  // Una caída del origen tapa cualquier otra cosa: con el servicio caído, el
  // recuento de estaciones de hace cinco minutos no dice nada útil.
  if (upstreamError) {
    return [{ text: t.errors.upstreamDown, strong: true }]
  }
  if (loading && !models.temperature) return [{ text: t.loading.stations }]

  /**
   * El recuento sale del CENSO, no del modelo, y es el mismo par que enseña
   * `ModelStatus` en el escritorio.
   *
   * Esta línea decía «N de M estaciones activas» con `models.temperature.used`
   * de numerador, y ese número es otra cosa: son las que sobreviven al rechazo
   * de anomalías MÁS todo lo que sostiene el mapa por encima del techo de la
   * red —las anclas de Open-Meteo y la cumbre del TNG—, que no son estaciones
   * activas del Cabildo y dos de las tres ni siquiera son estaciones. Sobre el
   * fixture del 13 ago 2026 daban 36 de 52 en el escritorio y 32 de 52 aquí, y
   * en producción, con las cuatro anclas vivas y la cumbre, el móvil podía
   * enseñar un numerador MAYOR que las que de verdad publicaban.
   *
   * La misma cadena en dos pantallas tiene que ser el mismo número. Si algún
   * día hace falta enseñar cuántas sostienen el ajuste —que es legítimo y es
   * otra cifra— hay que cambiar la CADENA, no el numerador.
   */
  if (!census) return [{ text: t.loading.stations }]

  const out: StatusPart[] = [
    { text: t.model.stationsUsed(census.usable, census.total), strong: true },
    { text: t.mobile.live },
  ]
  // El estado del GPS va al final y solo cuando hay algo que decir: mientras
  // busca, para que el botón parpadeando tenga explicación, y cuando el
  // navegador ha dicho que no, porque si no la app parecería no haber pedido
  // nunca la ubicación.
  if (locating) out.push({ text: t.mobile.locating })
  else if (locationDenied) out.push({ text: t.mobile.noLocation })
  return out
}
