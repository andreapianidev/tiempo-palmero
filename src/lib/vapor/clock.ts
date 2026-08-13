/**
 * El día entero en cuarenta segundos: la reproducción acelerada de la
 * respiración.
 *
 * POR QUÉ HACE FALTA. La isla respira una vez al día. Con el reloj de verdad,
 * la brisa de ladera se da la vuelta dos veces en veinticuatro horas y nadie va
 * a quedarse mirando la pantalla el rato suficiente para verlo: se ve la foto
 * de una hora, no el ciclo. Esto comprime el día para que el ciclo se pueda
 * VER, que es todo lo que hace.
 *
 * Y ESTÁ ETIQUETADO COMO LO QUE ES. Mientras corre, la interfaz enseña la hora
 * simulada y dice que va acelerada. Es la misma regla que el resto de la
 * aplicación: lo que no es «ahora» no se enseña como si lo fuera.
 *
 * QUÉ SE ACELERA Y QUÉ NO, que es lo que más importa de este fichero. Se
 * acelera **el sol**, no el aire. La posición solar corre 2.160 veces más
 * rápido —de ahí que la brisa invierta dos veces en cuarenta segundos—, pero
 * las partículas siguen moviéndose a una velocidad que se pueda seguir con la
 * vista: acelerarlas otras 2.160 veces las teletransportaría y no se vería un
 * ascenso, se vería ruido. Lo que se comprime es el reloj del ciclo, no la
 * física del ascenso.
 */

/** Cuánto dura un día completo en la reproducción, en segundos reales. */
export const CYCLE_SECONDS = 40

/** 86.400 / 40. Cuántas veces más rápido corre el sol. */
export const SUN_SPEEDUP = 86_400 / CYCLE_SECONDS

/**
 * Cuánto más rápido se mueven las partículas mientras dura la reproducción.
 *
 * Tres veces, no 2.160. Con el factor del sol una mota subiría 2,5 km en un
 * fotograma; con 1× la vuelta de la brisa llegaría antes de que a una columna
 * le hubiera dado tiempo a formarse. Tres es donde una columna todavía se sigue
 * con la vista y aun así alcanza a nacer, subir y deshacerse dentro de los
 * pocos segundos que dura cada fase.
 */
export const PARTICLE_SPEEDUP = 3

/** Medianoche UTC del día de una fecha. El ciclo empieza y acaba ahí. */
export function startOfDayUtc(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

/**
 * Qué hora simulada toca, dados los milisegundos reales transcurridos.
 *
 * Da la vuelta sola: pasado el ciclo vuelve a empezar por la medianoche del
 * mismo día. Se queda en el MISMO día a propósito —no avanza al siguiente—
 * porque lo que se está enseñando es el ciclo diario, y cambiar de fecha en
 * mitad de la reproducción movería el sol por una razón que no es la que se
 * está contando.
 */
export function virtualTime(dayStart: Date, elapsedMs: number): Date {
  const cycleMs = CYCLE_SECONDS * 1000
  const phase = ((elapsedMs % cycleMs) + cycleMs) % cycleMs
  return new Date(dayStart.getTime() + phase * SUN_SPEEDUP)
}

/** Cuánto lleva recorrido del día, de 0 a 1. Para dibujar una barra. */
export function cycleProgress(elapsedMs: number): number {
  const cycleMs = CYCLE_SECONDS * 1000
  return (((elapsedMs % cycleMs) + cycleMs) % cycleMs) / cycleMs
}

/**
 * La hora simulada, escrita como se lee en Canarias.
 *
 * En hora canaria y no UTC: quien mira la pantalla vive en esa hora, y decirle
 * que la isla inspira «a las 14:00» cuando su reloj marca las 15:00 sería
 * exacto y a la vez inútil. La conversión la hace el propio navegador con la
 * zona `Atlantic/Canary`, que sabe de horario de verano; escribir «+1» a mano
 * estaría mal medio año.
 */
export function canaryClockLabel(at: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Atlantic/Canary',
  }).format(at)
}
