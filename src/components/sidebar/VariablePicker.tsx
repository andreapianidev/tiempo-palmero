/**
 * Selector de variable, escala de color e interruptor de la malla.
 *
 * La marca «ƒ» del rocío y del VPD no es decorativa: distingue lo que la red
 * mide de lo que la app calcula, y esa distinción se sostiene en toda la
 * interfaz (pines, panel de punto, tabla de valores crudos).
 *
 * POR QUÉ LA CASILLA DE LA MALLA ESTÁ AQUÍ Y NO EN «CAPAS». Porque no es una
 * capa más: las otras diez se encienden solas y enseñan siempre lo mismo, y
 * ésta enseña la variable que se acaba de elegir tres líneas más arriba.
 * Estaba en la lista de capas, a seis entradas de distancia de los chips que
 * deciden su contenido, y desde allí no se veía que fueran la misma cosa.
 *
 * La lista de variables NO vive aquí: está en `lib/variables.ts`, que es la
 * misma tabla que consume la app nativa. Este fichero solo la dibuja.
 */

import { rampCss } from '../../lib/palette'
import { VARIABLES, MAP_VARIABLE_ORDER, type MapVariable } from '../../lib/variables'
import { BandScale } from './BandScale'
import { n0, t } from '../../i18n'

interface Props {
  variable: MapVariable
  onVariable: (v: MapVariable) => void
  /** La malla está encendida. Es `visible.grid`: sigue siendo una capa. */
  gridOn: boolean
  onToggleGrid: () => void
}

export function VariablePicker({ variable, onVariable, gridOn, onToggleGrid }: Props) {
  const spec = VARIABLES[variable]
  const unit = ` ${spec.unit}`

  return (
    <>
      <div className="chips">
        {MAP_VARIABLE_ORDER.map((id) => VARIABLES[id]).map((v) => (
          <button
            key={v.id}
            className="chip-btn"
            aria-pressed={variable === v.id}
            onClick={() => onVariable(v.id)}
            title={v.hint}
          >
            {v.label}
            {v.derived && (
              <em className="derived-mark" aria-hidden>
                {' '}
                ƒ
              </em>
            )}
          </button>
        ))}
      </div>

      {spec.bands ? (
        <BandScale bands={spec.bands} unit={spec.unit} />
      ) : (
        <>
          <div className="ramp" style={{ background: rampCss(spec.stops) }} />
          <div className="ramp-ends mono dim">
            <span>
              {n0(spec.stops[0][0])}
              {unit}
            </span>
            <span>
              {n0(spec.stops[spec.stops.length - 1][0])}
              {unit}
            </span>
          </div>
        </>
      )}

      <ul className="switches">
        <li>
          <label>
            <input type="checkbox" checked={gridOn} onChange={onToggleGrid} />
            <span>{t.layers.grid}</span>
          </label>
        </li>
      </ul>

      {/* Una variable que no cubre la isla lo dice antes de que nadie busque su
          pueblo en el mapa y no encuentre color. */}
      {spec.local && <p className="dim small">{spec.local}.</p>}
    </>
  )
}
