/**
 * El parte de la cumbre, con su propio reloj.
 *
 * El TNG publica cada ~30 s y el proxy cachea 5 minutos, así que pedirlo con
 * más frecuencia sólo gastaría batería para releer lo mismo.
 *
 * SE PIDE SIEMPRE, y antes no. Mientras esto solo alimentaba una sección del
 * panel, tenía sentido no molestar al observatorio por una sección que nadie
 * estaba mirando. Ya no: esta lectura es el ÚNICO termómetro real por encima
 * de 1561 m y entra en el motor (ver `summit.ts`), así que condicionarla a que
 * alguien despliegue un acordeón haría que el mapa de la cumbre cambiara según
 * qué tuviera abierto el panel lateral. El coste de haberlo hecho bien es una
 * petición cada cinco minutos, la misma cadencia que el resto de la aplicación,
 * contra un proxy que cachea exactamente ese tiempo.
 *
 * FALLA EN ABIERTO. Sin respuesta, `status` es `null`, la sección desaparece y
 * el motor vuelve a anclar la cumbre con modelo, que es lo que hacía antes. La
 * disponibilidad del TNG nunca tumba nada.
 */

import { useEffect, useState } from 'react'
import { fetchRoque, type RoqueStatus } from '../lib/roque'

/** Cada 5 minutos, que es lo que cachea el proxy. Pedir más es tirar red. */
const REFRESH_MS = 5 * 60 * 1000

export function useRoque(): RoqueStatus | null {
  const [status, setStatus] = useState<RoqueStatus | null>(null)

  useEffect(() => {
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
  }, [])

  return status
}
