/**
 * Interruptores de capa.
 *
 * El orden es el de la lista, no el de pintado: se lee de arriba abajo como un
 * índice de lo que hay en la isla.
 */

import type { LayerVisibility } from '../MapView'
import { poiIconDataUrl, type PoiFamily } from '../../lib/poi'
import { t } from '../../i18n'

const LAYERS: { id: keyof LayerVisibility; label: string }[] = [
  { id: 'grid', label: t.layers.grid },
  { id: 'wind', label: t.layers.wind },
  { id: 'stations', label: t.layers.stations },
  { id: 'air', label: t.layers.air },
  { id: 'co2', label: t.layers.co2 },
  { id: 'sky', label: t.layers.sky },
  { id: 'trails', label: t.layers.trails },
  { id: 'fire', label: t.layers.fire },
]

/** Un icono representativo por familia, para la leyenda. */
const LEGEND_ICON: Record<PoiFamily, string> = {
  servicios: 'refugio',
  cultural: 'arquitectura',
  natural: 'arbol',
}

interface Props {
  visible: LayerVisibility
  onToggle: (key: keyof LayerVisibility) => void
}

export function LayerSwitches({ visible, onToggle }: Props) {
  return (
    <>
      <ul className="switches">
        {LAYERS.map((l) => (
          <li key={l.id}>
            <label>
              <input
                type="checkbox"
                checked={visible[l.id]}
                onChange={() => onToggle(l.id)}
              />
              <span>{l.label}</span>
            </label>
          </li>
        ))}
      </ul>
      {/* Leyenda de los puntos de interés. Solo cuando la capa está encendida:
          si no, describiría algo que no se ve. */}
      {visible.trails && (
        <div className="poi-legend">
          <ul>
            {(['servicios', 'cultural', 'natural'] as const).map((f) => (
              <li key={f}>
                <img src={poiIconDataUrl(LEGEND_ICON[f], 18)} alt="" width={18} height={18} />
                <span>{t.poi.families[f]}</span>
              </li>
            ))}
          </ul>
          <p className="dim small">{t.poi.legend}</p>
        </div>
      )}
    </>
  )
}

/** Cuántas capas están encendidas — se enseña en la pestaña aun plegada. */
export function activeLayerCount(visible: LayerVisibility): number {
  return LAYERS.filter((l) => visible[l.id]).length
}

export const LAYER_COUNT = LAYERS.length
