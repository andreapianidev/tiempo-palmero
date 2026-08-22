/**
 * La primera carga, vista desde React.
 *
 * Junta lo que dicen los ganchos de las capas pesadas —cada uno con su bandera
 * de carga y sus datos— y devuelve dos números y un sí o no: cuántas van, de
 * cuántas, y si hay que enseñar la barra. La aritmética de «cuándo cuenta como
 * hecho» no está aquí sino en `lib/boot/first-load.ts`, que se prueba en Node.
 *
 * LA BARRA SOLO SALE EN LA PRIMERA VISITA. En la segunda las capas se vuelven a
 * pedir —viven en memoria, no en disco—, pero ya están en la caché del service
 * worker y llegan de golpe: una barra ahí sería un parpadeo sin información.
 * Y si el navegador no puede guardar ajustes —Safari en privado—, todas sus
 * visitas son la primera; es el caso raro y el peor que hace es enseñar una
 * barra de verdad, que es lo que está pasando.
 */

import { useEffect, useState } from 'react'
import {
  advance,
  FIRST_LOAD_MAX_MS,
  FIRST_LOAD_MIN_WAIT_MS,
  PENDING,
  progress,
  type Load,
  type Step,
} from '../lib/boot/first-load'
import { isFirstVisit } from '../lib/settings/store'

export interface FirstLoad {
  done: number
  total: number
  /**
   * Si hay que enseñarla: primera visita, algo pendiente, y ni tan pronto que
   * sea un parpadeo ni tan tarde que ya no explique nada.
   */
  show: boolean
}

export function useFirstLoad(loads: readonly Load[]): FirstLoad {
  /**
   * Se pregunta una sola vez, en el primer render y antes de que ningún efecto
   * haya escrito nada. Preguntarlo en cada render daría `false` a partir del
   * segundo, porque para entonces los ajustes ya se han guardado.
   */
  const [first] = useState(isFirstVisit)
  const [steps, setSteps] = useState<Step[]>(() => loads.map(() => PENDING))
  const [expired, setExpired] = useState(false)
  /** Todavía es pronto para molestar: ver `FIRST_LOAD_MIN_WAIT_MS`. */
  const [early, setEarly] = useState(true)

  /**
   * La firma es lo que hace que este efecto no corra en cada render: `loads` es
   * un array nuevo cada vez —lo construye quien nos llama— y como dependencia
   * dispararía siempre. Lo que importa de él son sus dos banderas por paso.
   */
  const signature = loads.map((l) => `${l.loading ? 1 : 0}${l.ready ? 1 : 0}`).join('')

  useEffect(() => {
    if (!first) return
    setSteps((prev) => {
      const next = prev.map((s, i) => advance(s, loads[i] ?? { loading: false, ready: false }))
      // Sin esta comparación, `setSteps` con un array nuevo idéntico provocaría
      // un render por cada cambio de bandera de cualquier capa.
      return next.some((s, i) => s.done !== prev[i].done || s.seen !== prev[i].seen) ? next : prev
    })
    // `loads` queda fuera a propósito: la dependencia real es su firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, first])

  useEffect(() => {
    if (!first) return
    const tarde = setTimeout(() => setExpired(true), FIRST_LOAD_MAX_MS)
    const pronto = setTimeout(() => setEarly(false), FIRST_LOAD_MIN_WAIT_MS)
    return () => {
      clearTimeout(tarde)
      clearTimeout(pronto)
    }
  }, [first])

  const { done, total } = progress(steps)
  return { done, total, show: first && !early && !expired && done < total }
}
