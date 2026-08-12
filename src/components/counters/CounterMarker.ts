/**
 * El pin de un aforo: la cifra del día, no un punto de color.
 *
 * Son diecisiete emplazamientos, así que caben como marcadores del DOM y con la
 * cifra dentro —igual que las estaciones meteorológicas, y por el mismo motivo:
 * un número sobre el mapa se lee sin abrir nada—. Lo que cuenta es que la cifra
 * es del DÍA (de `count_historic`, que incluye el día en curso), y no del pulso
 * de cinco minutos que devuelve `count_today`.
 *
 * Un aforo que hoy no ha publicado nada sale igual, en hueco: la red tiene tres
 * emplazamientos que han enmudecido esta misma mañana, y esconderlos haría
 * parecer que la isla se ha quedado sin tráfico justo ahí.
 */

import type { CounterSite } from '../../lib/counters/model'
import { n, n0 } from '../../i18n'

/** Miles abreviados: en la entrada de Santa Cruz caben 20.000 pasos al día. */
export function compactCount(value: number): string {
  if (value < 1000) return n0(value)
  if (value < 10_000) return `${n(value / 1000, 1)} k`
  return `${n0(value / 1000)} k`
}

const COLOR = {
  road: '#c98f5a',
  trail: '#7fa86a',
} as const

interface Options {
  onClick: (site: CounterSite) => void
  label: (site: CounterSite) => string
}

export function counterMarkerElement(site: CounterSite, { onClick, label }: Options): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'mk-pill mk-aforo'
  if (site.todayTotal === null) {
    el.classList.add('mk-aforo-silent')
    el.textContent = '—'
  } else {
    el.textContent = compactCount(site.todayTotal)
    el.style.background = COLOR[site.kind]
    el.style.color = '#141311'
  }
  el.setAttribute('aria-label', label(site))
  el.title = label(site)
  el.addEventListener('click', (ev) => {
    ev.stopPropagation()
    onClick(site)
  })
  return el
}
