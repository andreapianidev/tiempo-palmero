/**
 * La máscara de cobertura TDT, cargada solo si alguien enciende la capa.
 *
 * El PNG lo descarga MapLibre por su cuenta en cuanto la capa se declara —28 KB,
 * y así aparece sin parpadeo al encenderla—, pero decodificarlo a píxeles para
 * poder preguntarle por un punto es otra cosa: son 424×606 celdas en un canvas,
 * y no hace falta hasta que alguien quiere leer la ficha de un sitio. Como el
 * fichero es el mismo, la segunda petición la sirve la caché del navegador.
 */

import { useEffect, useRef, useState } from 'react'
import { loadTdtMask } from '../lib/tdt/loader'
import type { TdtMask } from '../lib/tdt/mask'
import { TDT_FILE } from '../components/tdt/TdtLayer'

export interface TdtState {
  mask: TdtMask | null
  loading: boolean
  failed: boolean
}

export function useTdt(on: boolean): TdtState {
  const [mask, setMask] = useState<TdtMask | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const asked = useRef(false)

  useEffect(() => {
    if (!on || asked.current) return
    asked.current = true
    setLoading(true)
    setFailed(false)
    let cancelled = false

    loadTdtMask(TDT_FILE)
      .then((m) => {
        if (!cancelled) setMask(m)
      })
      .catch(() => {
        // Un fallo no se queda pegado: apagar y encender reintenta.
        asked.current = false
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [on])

  return { mask, loading, failed }
}
