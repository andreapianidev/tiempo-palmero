/**
 * Los iconos del mapa, generados una vez por arranque.
 *
 * Va detrás de un `setTimeout(0)` por el mismo motivo que la malla: son 40 y
 * pico bitmaps rasterizados en fila, y hacerlo dentro del render deja la
 * pantalla congelada antes de que el mapa llegue a aparecer. Mientras tanto las
 * capas de símbolos no se montan; en cuanto están, entran.
 */

import { useEffect, useState } from 'react'
import { buildMapIcons } from '../map/icons'

export function useMapIcons(): Record<string, string> | null {
  const [icons, setIcons] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = setTimeout(() => {
      try {
        const built = buildMapIcons()
        if (!cancelled) setIcons(built)
      } catch {
        // Sin iconos el mapa sigue teniendo relieve, malla, pins y fichas. Lo
        // que no se monta es la capa de símbolos, y eso ya lo decide quien la
        // consume al ver que esto devuelve `null`.
        if (!cancelled) setIcons(null)
      }
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [])

  return icons
}
