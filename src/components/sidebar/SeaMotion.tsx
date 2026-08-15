/**
 * El mar en movimiento, dentro de «Experimental».
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN «OCÉANO». La sección del océano tiene ahora dos
 * clases de cosa muy distintas, y mezclarlas confundía qué se está mirando:
 *
 *   - **Las cartas** —balizamiento de OpenSeaMap, profundidad de EMODnet— son
 *     cartografía ajena, publicada, que se pide y se dibuja tal cual.
 *   - **Esto** es una SUPERFICIE CALCULADA. La altura de ola y el periodo son
 *     dato del modelo marino, y la batimetría y la marea son reales; pero la
 *     ola concreta que se ve romper en un punto concreto la pone un sombreador,
 *     no un sensor. Es exactamente la misma distinción que separa a las nubes
 *     3D de una observación, y merece el mismo sitio y el mismo aviso.
 *
 * Y ENCENDERLO CAMBIA EL FONDO. Sobre la carta topográfica no se dibuja —esa
 * carta ya trae su propio mar, con sus batimetrías y sus rótulos, y el agua en
 * movimiento los taparía—, así que el interruptor se lleva el fondo al satélite.
 * Es la misma regla de siempre: un interruptor que no hace nada es peor que uno
 * que hace de más.
 *
 * LAS CARTAS YA NO DEPENDEN DE ESTO. Estaban deshabilitadas mientras el mar
 * estuviera apagado, con el argumento de que sin agua debajo serían dos capas
 * sueltas sobre el color de fondo. Era falso: se dibujan sobre cualquier fondo,
 * y la de profundidad es de las capas más útiles que tiene la aplicación por sí
 * sola —enseña que la isla es la punta de un cono de 6,4 km—. Obligar a
 * encender una simulación para poder ver cartografía publicada era pedir lo de
 * más para conseguir lo de menos.
 */

import { BASEMAPS, type BasemapId } from '../../lib/basemaps'
import { OCEAN_QUALITIES, QUALITY, type OceanQuality } from '../../lib/ocean/quality'

interface Props {
  on: boolean
  onToggle: () => void
  /** El fondo puesto: decide si el mar se dibuja y cómo se compone con él. */
  basemap: BasemapId
  quality: OceanQuality
  onQuality: (q: OceanQuality) => void
  /** El mar ya tiene con qué dibujarse: batimetría y oleaje en memoria. */
  ready: boolean
  loading: boolean
  failed: boolean
}

export function SeaMotion({
  on,
  onToggle,
  basemap,
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
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>Mar en movimiento</span>
        </label>
      </div>

      <p className="dim small">
        La superficie se calcula con el oleaje del momento: dos trenes de olas
        —el mar de fondo del Atlántico y la marejadilla que levanta el viento de
        aquí— sobre la batimetría real, con la marea puesta a su altura. Donde
        el fondo sube, la ola crece y rompe; donde la isla abriga, se aplana.
      </p>

      <p className="dim small">
        Lo medido es la altura, el periodo y la dirección de esas dos mares, más
        la marea y la profundidad. La ola que se ve romper en un sitio concreto
        la dibuja un sombreador a partir de esas cifras: no es una observación de
        ese punto, igual que una nube de la escena 3D no es una nube que alguien
        haya visto.
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
