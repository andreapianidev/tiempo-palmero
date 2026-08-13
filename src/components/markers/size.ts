/**
 * Cuánto ocupa en pantalla un marcador, medido UNA vez.
 *
 * EL PROBLEMA QUE RESUELVE. El reparto de solapamientos necesita el rectángulo
 * de cada marcador, y hasta ahora lo pedía en cada pasada: deshacía el encogido
 * —escribir una clase y un estilo— y acto seguido leía `offsetWidth`. Escribir
 * y leer alternándose obliga al navegador a recalcular el diseño de la página
 * ENTERA entre cada par, una vez por marcador. Con 249 marcadores eso es un
 * cálculo de diseño completo 249 veces por pasada, para averiguar un ancho que
 * no ha cambiado desde que el elemento nació.
 *
 * Medido en producción el 13 de agosto de 2026 (MacBook Air M2, Chromium): un
 * arrastre de seis segundos con la 3D encendida gastaba 135 ms solo en esas
 * lecturas. No es lo más caro de la vista inclinada —eso son las lecturas del
 * búfer de profundidad, ver `lib/occlusion.ts`— pero es lo más gratuito de
 * quitar.
 *
 * POR QUÉ VALE MEDIR UNA VEZ. Un marcador no cambia de tamaño: su texto y sus
 * clases se fijan al crearlo, y cuando el dato cambia lo que se hace es
 * construir un elemento nuevo, no reescribir el viejo. El único estado que sí
 * cambia —el encogido a punto— es justamente el que había que deshacer para
 * medir, así que se mide antes de que exista.
 *
 * El mapa es débil a propósito: la clave es el propio elemento, y cuando el
 * marcador se retira del DOM su entrada desaparece sola. Sin eso, cada refresco
 * de datos dejaría 249 entradas muertas detrás.
 */

const sizes = new WeakMap<HTMLElement, { w: number; h: number }>()

/**
 * Los de reserva, para el caso en que se pregunte por un elemento que todavía
 * no está en el documento: `offsetWidth` devuelve entonces 0, y un rectángulo
 * de área cero no chocaría con nada y dejaría pasar todos los solapamientos.
 * Son las medidas de una pastilla de estación con cuatro caracteres.
 */
const FALLBACK = { w: 44, h: 18 }

/**
 * Tamaño del marcador SIN encoger. Se mide la primera vez y se recuerda.
 *
 * Se mide expandido siempre: si se midiera ya encogido, su ancho sería el del
 * punto y no volvería a abrirse nunca al separarse de sus vecinos.
 */
export function markerSize(el: HTMLElement): { w: number; h: number } {
  const known = sizes.get(el)
  if (known) return known

  const collapsed = el.classList.contains('mk-pill-dot')
  const hidden = el.style.visibility === 'hidden'
  if (collapsed) el.classList.remove('mk-pill-dot')
  if (hidden) el.style.visibility = 'visible'

  const w = el.offsetWidth
  const h = el.offsetHeight

  if (collapsed) el.classList.add('mk-pill-dot')
  if (hidden) el.style.visibility = 'hidden'

  // Un elemento todavía sin diseño calculado no se recuerda: se devuelve el de
  // reserva y se vuelve a intentar en la siguiente pasada, cuando ya lo tenga.
  if (!w || !h) return FALLBACK
  const size = { w, h }
  sizes.set(el, size)
  return size
}
