/**
 * Los botones redondos del móvil: capas, mi ubicación y volver a ver la isla.
 *
 * Los trazados son los del prototipo de iOS, y el de capas lleva un contador
 * cuando hay alguna encendida: sin él, cerrar el panel deja el mapa lleno de
 * senderos y guaguas sin nada que recuerde de dónde salieron ni dónde se
 * apagan.
 *
 * El de ubicación parpadea mientras el navegador pregunta. Es la única señal
 * de que está pasando algo, porque el diálogo de permiso lo pinta el sistema y
 * puede tardar lo que quiera en aparecer.
 */

import { t } from '../../i18n'

interface Props {
  locating: boolean
  /** Capas superpuestas encendidas. 0 = sin distintivo. */
  layerCount: number
  onLayers: () => void
  onLocate: () => void
  onReset: () => void
}

export function Fabs({ locating, layerCount, onLayers, onLocate, onReset }: Props) {
  return (
    <div className="mfabs">
      <button className="mfab" onClick={onLayers} aria-label={t.mobile.layers}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3l9 5-9 5-9-5 9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
        {layerCount > 0 && <em className="mono">{layerCount}</em>}
      </button>

      <button
        className={`mfab${locating ? ' mfab-busy' : ''}`}
        onClick={onLocate}
        aria-label={t.mobile.locate}
        aria-busy={locating}
      >
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>

      <button className="mfab" onClick={onReset} aria-label={t.mobile.island}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 9V5a1 1 0 011-1h4M20 9V5a1 1 0 00-1-1h-4M4 15v4a1 1 0 001 1h4M20 15v4a1 1 0 01-1 1h-4" />
        </svg>
      </button>
    </div>
  )
}
