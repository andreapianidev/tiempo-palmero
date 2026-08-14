/**
 * Los mandos del océano: encenderlo, ponerle las cartas y elegir cuánto pide.
 *
 * Lo que este archivo NO hace es contar cómo está el mar; eso es otra cosa y
 * está en `OceanStatus`. Aquí solo hay decisiones.
 */

import { BASEMAPS, type BasemapId } from '../../lib/basemaps'
import { OCEAN_QUALITIES, QUALITY, type OceanQuality } from '../../lib/ocean/quality'

interface Props {
  on: boolean
  onToggle: () => void
  /** El fondo puesto: decide si el mar se dibuja y cómo se compone con él. */
  basemap: BasemapId
  /** Faros, boyas y puertos de OpenSeaMap: la carta náutica de verdad. */
  seamarks: boolean
  onSeamarks: () => void
  /** La escala de color de profundidad de EMODnet. Otra cosa, y muy visible. */
  depth: boolean
  onDepth: () => void
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
  basemap,
  seamarks,
  onSeamarks,
  depth,
  onDepth,
  quality,
  onQuality,
  ready,
  loading,
  failed,
}: Props) {
  /** Sobre la carta topográfica no hay mar en movimiento. Ver `basemaps.ts`. */
  const drawsSea = BASEMAPS[basemap].sea !== false
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
            <input type="checkbox" checked={seamarks} onChange={onSeamarks} disabled={!on} />
            <span>Faros, boyas y puertos</span>
          </label>
        </li>
        <li>
          <label>
            <input type="checkbox" checked={depth} onChange={onDepth} disabled={!on} />
            <span>Profundidad en color</span>
          </label>
        </li>
      </ul>

      <p className="dim small">
        La superficie se calcula con el oleaje del momento: dos trenes de olas
        —el mar de fondo del Atlántico y la marejadilla que levanta el viento de
        aquí— sobre la batimetría real, con la marea puesta a su altura. Donde
        el fondo sube, la ola crece y rompe; donde la isla abriga, se aplana.
      </p>

      {on && !drawsSea && (
        <p className="warn small">
          Sobre el <strong>{BASEMAPS[basemap].label}</strong> no se dibuja: esa
          carta ya trae su propio mar, con sus batimetrías y sus rótulos, y el
          agua en movimiento los taparía. En el relieve y en el satélite sigue
          puesto, y el oleaje de aquí abajo se mide igual.
        </p>
      )}

      {on && !ready && !failed && (
        <p className="dim small">
          {loading ? 'Pidiendo el estado del mar…' : 'Preparando la costa y el fondo…'}
        </p>
      )}

      {failed && (
        <p className="warn small">
          No se ha podido preparar el mar —el oleaje, la costa o el fondo—. Se
          queda quieto en vez de inventarse uno. Apagar y volver a encender lo
          reintenta.
        </p>
      )}

      {on && seamarks && (
        <p className="dim small">
          Balizamiento de OpenSeaMap, cartografiado por navegantes: faros con su
          característica, boyas cardinales y laterales, puertos y zonas
          restringidas. Por debajo del zoom 9 no hay balizas que enseñar.
        </p>
      )}

      {on && depth && (
        <p className="dim small">
          La escala de color de EMODnet, la misma batimetría con la que el motor
          decide dónde rompe la ola. <strong>Rojo es somero, azul es hondo:</strong>{' '}
          la franja roja pegada a la costa es lo poco que hay de plataforma antes
          de que el talud caiga, de 0 a 4.000 m en veinte kilómetros. No es una
          carta náutica ni son rutas —es un mapa de profundidad—, y mientras esté
          puesta tapa el agua en movimiento, que es lo que hay debajo.
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
