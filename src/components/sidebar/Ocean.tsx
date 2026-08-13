/**
 * Los mandos del océano: encenderlo, ponerle las cartas y elegir cuánto pide.
 *
 * Lo que este archivo NO hace es contar cómo está el mar; eso es otra cosa y
 * está en `OceanStatus`. Aquí solo hay decisiones.
 */

import { OCEAN_QUALITIES, QUALITY, type OceanQuality } from '../../lib/ocean/quality'

interface Props {
  on: boolean
  onToggle: () => void
  charts: boolean
  onCharts: () => void
  quality: OceanQuality
  onQuality: (q: OceanQuality) => void
  /** El mar ya tiene con qué dibujarse: batimetría y oleaje en memoria. */
  ready: boolean
  loading: boolean
  failed: boolean
}

export function Ocean({
  on,
  onToggle,
  charts,
  onCharts,
  quality,
  onQuality,
  ready,
  loading,
  failed,
}: Props) {
  return (
    <>
      <ul className="switches">
        <li>
          <label>
            <input type="checkbox" checked={on} onChange={onToggle} />
            <span>Mar en movimiento</span>
          </label>
        </li>
        <li>
          <label>
            <input type="checkbox" checked={charts} onChange={onCharts} disabled={!on} />
            <span>Cartas náuticas</span>
          </label>
        </li>
      </ul>

      <p className="dim small">
        La superficie se calcula con el oleaje del momento: dos trenes de olas
        —el mar de fondo del Atlántico y la marejadilla que levanta el viento de
        aquí— sobre la batimetría real, con la marea puesta a su altura. Donde
        el fondo sube, la ola crece y rompe; donde la isla abriga, se aplana.
      </p>

      {on && !ready && !failed && (
        <p className="dim small">
          {loading ? 'Pidiendo el estado del mar…' : 'Preparando la costa y el fondo…'}
        </p>
      )}

      {failed && (
        <p className="warn small">
          No se ha podido traer el oleaje. El mar se queda quieto en vez de
          inventarse uno.
        </p>
      )}

      {on && charts && (
        <p className="dim small">
          Isóbatas y color de profundidad de EMODnet, y el balizamiento de
          OpenSeaMap: faros, boyas y puertos. Se piden mientras se miran y
          cubren toda la pantalla, no solo el recuadro de la isla.
        </p>
      )}

      {on && (
        <>
          <p className="mono dim small" style={{ marginBottom: 4 }}>
            CALIDAD
          </p>
          <div className="chips">
            {OCEAN_QUALITIES.map((q) => (
              <button
                key={q}
                className="chip-btn"
                aria-pressed={quality === q}
                onClick={() => onQuality(q)}
              >
                {QUALITY[q].label}
              </button>
            ))}
          </div>
          <p className="dim small">{QUALITY[quality].note}</p>
        </>
      )}
    </>
  )
}
