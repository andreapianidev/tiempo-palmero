/**
 * Qué sitios se ven en el mapa, uno a uno.
 *
 * Antes esto no existía: las capas de miradores, patrimonio, zonas recreativas
 * y recarga solo asomaban dentro de «cerca de aquí», es decir, había que tocar
 * un punto para descubrir que a 300 m hay algo. Con estos interruptores se
 * pueden BUSCAR en el mapa, que es lo que uno espera poder hacer con ellas.
 *
 * Cada línea lleva su propio icono, el mismo que se va a dibujar: la leyenda es
 * el propio interruptor y no hace falta una tabla aparte que explique colores.
 */

import { PLACES, placeIconDataUrl } from '../../lib/places'
import type { PlaceVisibility } from '../../hooks/usePlaces'
import { t } from '../../i18n'

interface Props {
  visible: PlaceVisibility
  onToggle: (kind: keyof PlaceVisibility) => void
}

export function PlaceSwitches({ visible, onToggle }: Props) {
  return (
    <>
      <ul className="switches switches-icon">
        {PLACES.map(({ kind }) => (
          <li key={kind}>
            <label>
              <input
                type="checkbox"
                checked={visible[kind]}
                onChange={() => onToggle(kind)}
              />
              <img src={placeIconDataUrl(kind, 18)} alt="" width={18} height={18} />
              <span>{t.places.kinds[kind]}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="dim small">{t.places.hint}</p>
    </>
  )
}

export function activePlaceCount(visible: PlaceVisibility): number {
  return PLACES.filter((p) => visible[p.kind]).length
}

export const PLACE_COUNT = PLACES.length
