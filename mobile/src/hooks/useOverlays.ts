/**
 * El estado de las capas superpuestas y sus datos, en un solo sitio.
 *
 * Los tres hooks que hay debajo —guaguas, sitios y aforos— son exactamente los
 * de la web, sin una copia móvil: se piden a demanda, cada uno cuando su
 * interruptor se enciende, y apagar no tira lo descargado. Lo único que añade
 * este envoltorio es guardar los interruptores y no obligar a la pantalla del
 * mapa a conocer tres hooks para enseñar una hoja de casillas.
 *
 * Los senderos y las cámaras de incendios no aparecen aquí porque no se piden:
 * vienen dentro de `useIslandData()` desde que arranca la app, igual que en la
 * web. Encender su casilla no descarga nada, solo los dibuja.
 */

import { useCallback, useState } from 'react'
import { useGuagua, type GuaguaData } from '@core/hooks/useGuagua'
import { usePlaces, NO_PLACES, type PlaceVisibility, type PlacesData } from '@core/hooks/usePlaces'
import { useCounters, type CountersData } from '@core/hooks/useCounters'
import type { PlaceKind } from '@core/lib/places'
import { NO_OVERLAYS, type OverlayId, type OverlayVisibility } from '../overlays'

export interface Overlays {
  visible: OverlayVisibility
  places: PlaceVisibility
  toggle: (id: OverlayId) => void
  togglePlace: (kind: PlaceKind) => void
  /** Cuántas casillas hay encendidas, para el distintivo del botón. */
  count: number
  guagua: GuaguaData
  placesData: PlacesData
  counters: CountersData
}

export function useOverlays(): Overlays {
  const [visible, setVisible] = useState<OverlayVisibility>(NO_OVERLAYS)
  const [places, setPlaces] = useState<PlaceVisibility>(NO_PLACES)

  const guagua = useGuagua(visible.guagua)
  const placesData = usePlaces(places, visible.roads)
  const counters = useCounters(visible.counters)

  const toggle = useCallback((id: OverlayId) => {
    setVisible((v) => ({ ...v, [id]: !v[id] }))
  }, [])

  const togglePlace = useCallback((kind: PlaceKind) => {
    setPlaces((p) => ({ ...p, [kind]: !p[kind] }))
  }, [])

  const count =
    Object.values(visible).filter(Boolean).length + Object.values(places).filter(Boolean).length

  return { visible, places, toggle, togglePlace, count, guagua, placesData, counters }
}
