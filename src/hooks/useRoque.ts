/**
 * El parte de la cumbre, con su propio reloj.
 *
 * Va aparte de `useIslandData` por lo mismo que el viento: es otra fuente, con
 * otro ritmo y otra forma de fallar. El TNG publica cada ~30 s y el proxy
 * cachea 5 minutos, así que pedirlo con más frecuencia sólo gastaría batería
 * para releer lo mismo.
 *
 * FALLA EN ABIERTO. Sin respuesta, `status` es `null` y la sección
 * desaparece; nada más de la aplicación se entera. Es un extra, no un dato de
 * seguridad como el CO₂.
 */

import { useEffect, useState } from 'react'
import { fetchRoque, type RoqueStatus } from '../lib/roque'

/** Cada 5 minutos, que es lo que cachea el proxy. Pedir más es tirar red. */
const REFRESH_MS = 5 * 60 * 1000

export function useRoque(enabled: boolean): RoqueStatus | null {
  const [status, setStatus] = useState<RoqueStatus | null>(null)

  useEffect(() => {
    // Sin la sección abierta no se pide nada: el TNG es un observatorio de
    // investigación y no tiene por qué pagar el tráfico de una sección que
    // nadie está mirando.
    if (!enabled) return

    const controller = new AbortController()
    let alive = true

    const load = async () => {
      const next = await fetchRoque(controller.signal)
      // Una respuesta fallida NO borra la anterior: una temperatura de cumbre
      // de hace diez minutos sigue diciendo algo, y cada campo lleva su hora
      // para que se vea cuánto tiene.
      if (alive && next) setStatus(next)
    }

    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      controller.abort()
      clearInterval(id)
    }
  }, [enabled])

  return status
}
