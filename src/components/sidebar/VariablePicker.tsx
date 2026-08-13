/**
 * Selector de variable y escala de color.
 *
 * La marca «ƒ» del rocío y del VPD no es decorativa: distingue lo que la red
 * mide de lo que la app calcula, y esa distinción se sostiene en toda la
 * interfaz (pines, panel de punto, tabla de valores crudos).
 *
 * La lista de variables NO vive aquí: está en `lib/variables.ts`, que es la
 * misma tabla que consume la app nativa. Este fichero solo la dibuja.
 */

import type { DisplayVariable } from '../../lib/interpolate'
import { rampCss, type RgbStop } from '../../lib/palette'
import { VARIABLES, VARIABLE_ORDER } from '../../lib/variables'
import { n0 } from '../../i18n'

interface Props {
  variable: DisplayVariable
  onVariable: (v: DisplayVariable) => void
  stops: RgbStop[]
}

export function VariablePicker({ variable, onVariable, stops }: Props) {
  const spec = VARIABLES[variable]
  const unit = ` ${spec.unit}`

  return (
    <>
      <div className="chips">
        {VARIABLE_ORDER.map((id) => VARIABLES[id]).map((v) => (
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
      <div className="ramp" style={{ background: rampCss(stops) }} />
      <div className="ramp-ends mono dim">
        <span>
          {n0(stops[0][0])}
          {unit}
        </span>
        <span>
          {n0(stops[stops.length - 1][0])}
          {unit}
        </span>
      </div>
    </>
  )
}
