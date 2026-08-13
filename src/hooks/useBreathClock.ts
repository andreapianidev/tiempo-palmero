/**
 * El reloj de la respiración: normalmente el de verdad, y a ratos el acelerado.
 *
 * Vive en un hook y no dentro de la capa de WebGL a propósito: el panel lateral
 * y el mapa tienen que estar enseñando la MISMA hora. Si cada uno llevara su
 * reloj, la barra diría las 14:20 mientras la isla dibuja las 14:22, y la
 * diferencia se vería justo en el momento en el que la brisa se da la vuelta,
 * que es lo único que esta reproducción existe para enseñar.
 *
 * En reposo no hace nada: sin reproducción en marcha no hay temporizador, y el
 * componente solo se vuelve a pintar cuando el minuto real cambia.
 */

import { useEffect, useRef, useState } from 'react'
import { cycleProgress, startOfDayUtc, virtualTime } from '../lib/vapor/clock'

export interface BreathClock {
  /** La hora que se está dibujando. Igual a la real si no hay reproducción. */
  at: Date
  playing: boolean
  /** Del 0 al 1 dentro del ciclo de 24 h. Cero cuando no corre. */
  progress: number
  toggle: () => void
}

/**
 * Cada cuánto se refresca la hora en reposo, en ms.
 *
 * Un minuto. La posición del sol cambia ~0,25° por minuto y la respiración se
 * mueve todavía más despacio: refrescar más a menudo sería volver a pintar el
 * panel para enseñar exactamente lo mismo.
 */
const IDLE_TICK_MS = 60_000

export function useBreathClock(enabled: boolean): BreathClock {
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(() => new Date())
  const [progress, setProgress] = useState(0)
  const startedAt = useRef(0)

  useEffect(() => {
    // Apagar la capa para la reproducción: dejarla corriendo sin nada que
    // enseñar sería un temporizador a 60 Hz alimentando una pantalla vacía.
    if (!enabled && playing) setPlaying(false)
  }, [enabled, playing])

  useEffect(() => {
    if (!enabled) return

    if (!playing) {
      setAt(new Date())
      setProgress(0)
      const id = setInterval(() => setAt(new Date()), IDLE_TICK_MS)
      return () => clearInterval(id)
    }

    // El día que se reproduce es el de HOY, no uno cualquiera: el sol de agosto
    // y el de diciembre no se parecen en nada en esta isla, y enseñar el ciclo
    // de otra fecha sería enseñar el ciclo de otro sitio.
    const dayStart = startOfDayUtc(new Date())
    startedAt.current = performance.now()
    let raf = 0
    const tick = () => {
      const elapsed = performance.now() - startedAt.current
      setAt(virtualTime(dayStart, elapsed))
      setProgress(cycleProgress(elapsed))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, playing])

  return {
    at,
    playing,
    progress,
    toggle: () => setPlaying((p) => !p),
  }
}
