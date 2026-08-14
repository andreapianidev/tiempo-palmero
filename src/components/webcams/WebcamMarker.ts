/**
 * El pin de una webcam: un objetivo de cámara, no una pastilla con cifra.
 *
 * Las pastillas del mapa llevan dentro el dato (los grados de una estación, los
 * pasos de un aforo). Una webcam no tiene ningún número que enseñar sin abrirla
 * —lo que da es una foto de medio megabyte— así que su marcador es un icono, y
 * pequeño: son 18 emplazamientos y hasta que alguien pincha uno no cuestan ni
 * un byte de red.
 *
 * Se distingue del triángulo de las cámaras de incendios a propósito, aunque
 * dos de estos sitios sean la misma torre: aquélla dice si hay alerta, ésta
 * enseña el paisaje. Confundirlas haría creer que una panorámica del pueblo de
 * Puntagorda vigila algo.
 */

import type { WebcamSite } from '../../lib/webcams/catalog'

interface Options {
  onClick: (site: WebcamSite) => void
  label: (site: WebcamSite) => string
}

export function webcamMarkerElement(site: WebcamSite, { onClick, label }: Options): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `mk-cam mk-cam-${site.operator}`
  // Un objetivo: círculo dentro de un cuerpo redondeado. Va en el CSS; aquí
  // solo el punto central, que es lo único que necesita ser un hijo.
  const lens = document.createElement('span')
  lens.className = 'mk-cam-lens'
  el.append(lens)
  // Cuando el sitio tiene más de un ángulo se marca, porque cambia lo que pasa
  // al pincharlo: en vez de una foto salen dos o tres.
  if (site.views.length > 1) {
    const badge = document.createElement('span')
    badge.className = 'mk-cam-count'
    badge.textContent = String(site.views.length)
    el.append(badge)
  }
  const text = label(site)
  el.setAttribute('aria-label', text)
  el.title = text
  el.addEventListener('click', (ev) => {
    ev.stopPropagation()
    onClick(site)
  })
  return el
}
