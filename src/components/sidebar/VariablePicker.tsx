/**
 * Selector de variable y escala de color.
 *
 * La marca «ƒ» del punto de rocío no es decorativa: distingue lo que la red
 * mide de lo que la app calcula, y esa distinción se sostiene en toda la
 * interfaz (pines, panel de punto, tabla de valores crudos).
 */

import type { DisplayVariable } from '../../lib/interpolate'
import { rampCss, type RgbStop } from '../../lib/palette'
import { n0, t } from '../../i18n'

const VARIABLES: { id: DisplayVariable; label: string; derived?: boolean }[] = [
  { id: 'temperature', label: t.variables.temperature },
  { id: 'relativehumidity', label: t.variables.relativehumidity },
  { id: 'dewpoint', label: t.variables.dewpoint, derived: true },
]

interface Props {
  variable: DisplayVariable
  onVariable: (v: DisplayVariable) => void
  stops: RgbStop[]
}

export function VariablePicker({ variable, onVariable, stops }: Props) {
  const unit = variable === 'relativehumidity' ? ' %' : ' °C'

  return (
    <>
      <div className="chips">
        {VARIABLES.map((v) => (
          <button
            key={v.id}
            className="chip-btn"
            aria-pressed={variable === v.id}
            onClick={() => onVariable(v.id)}
            title={v.derived ? t.variables.derivedHint : undefined}
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
