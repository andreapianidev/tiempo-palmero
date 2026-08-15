/**
 * El reloj de la red DEMASE viene adelantado, y eso apagaba el filtro de
 * frescura del CO₂.
 *
 * QUÉ PASA. `/datos_actuales` trae dos campos de tiempo: `Fecha`, en formato
 * `DD/MM/YYYY HH:MM:SS`, y `Ts`, en segundos epoch. La aplicación usaba `Ts`
 * —bien: `Fecha` ordena mal como cadena— dándolo por UTC. No lo es: `Ts` es la
 * MISMA hora de `Fecha`, que es hora canaria, emitida como si fuera UTC.
 *
 * MEDIDO EL 13 AGO 2026, sobre las 201 lecturas del lote: 172 caían 57,1
 * minutos en el FUTURO y otras 8 a 42,9 minutos también en el futuro. Un
 * timestamp futuro no es un dato viejo ni un dato nuevo: es un reloj corrido.
 * Y 57,1 = 60 − 2,9 encaja exactamente con «una hora de adelanto sobre una
 * lectura de hace 3 minutos», con Canarias en UTC+1 ese día.
 *
 * POR QUÉ IMPORTA MÁS DE LO QUE PARECE. El umbral de rancio del CO₂ son 15
 * minutos, y con las lecturas fechadas en el futuro `ahora − medida` salía
 * NEGATIVO durante la primera hora: ningún sensor llegaba nunca a marcarse
 * rancio. Un sensor que llevaba 70 minutos callado se pintaba verde con la
 * misma confianza que uno de hace un minuto, justo en la variable donde el
 * repositorio se había prometido fallar en cerrado. En invierno el fallo
 * desaparecía solo, porque Canarias está en UTC y el desfase es cero; de
 * finales de marzo a finales de octubre, no.
 *
 * CUÁNTO CAMBIA HOY: nada. Contado sobre el mismo lote, 28 de 201 lecturas
 * salían rancias antes de corregir y 28 después, porque las 28 llevaban días
 * o meses caídas y ninguna caía en la ventana de 15 a 75 minutos. Esa ventana
 * es justo la del sensor que ACABA de dejar de transmitir —los equipos hablan
 * cada 15 minutos—, o sea el único caso para el que existe el umbral. La
 * corrección no arregla una pantalla que ahora mismo se vea mal; arregla la
 * hora siguiente a que un sensor se caiga.
 *
 * CÓMO SE CORRIGE. No restando una hora fija. Se mira si el lote viene del
 * futuro y, si viene, se resta el desfase que tenía Atlantic/Canary en ese
 * instante —una hora en verano, cero en invierno—. Que la corrección esté
 * condicionada no es un adorno: el día que DEMASE arregle su `Ts`, esto dejará
 * de hacer nada por sí solo, sin que nadie tenga que acordarse de venir aquí.
 */

import { canaryOffsetMs } from '../cabildo'

/** Margen antes de dar por corrido un reloj. Un lote sano no pasa de aquí. */
export const SKEW_TOLERANCE_MS = 5 * 60 * 1000

/**
 * Cuánto hay que restar a los `Ts` de un lote para que sean UTC de verdad.
 *
 * Se decide con la lectura MÁS NUEVA del lote, que es la única que puede
 * delatar el adelanto: una vieja se ve vieja tanto si el reloj está corrido
 * como si no. Si esa no viene del futuro, no hay nada que corregir y devuelve
 * cero.
 */
export function clockSkewMs(readingTimes: readonly number[], fetchedAt: number): number {
  let newest = -Infinity
  for (const t of readingTimes) if (t > newest) newest = t
  if (newest === -Infinity) return 0
  if (newest - fetchedAt <= SKEW_TOLERANCE_MS) return 0
  return canaryOffsetMs(fetchedAt)
}
