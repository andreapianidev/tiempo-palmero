/**
 * La tira de variables del móvil, más el conmutador de la malla.
 *
 * Es la mitad de arriba del `VariablePicker` de la barra lateral, con dos
 * diferencias que vienen del sitio donde vive: se desplaza en horizontal
 * porque no caben cinco chips en 393 px, y usa `short` en vez de `label`
 * porque «Humedad relativa» partido en dos líneas dentro de una pastilla se
 * lee peor que «Humedad».
 *
 * La malla va en ámbar, al final y separada: no es una variable más, es el
 * interruptor de lo que colorea el mapa con la variable elegida. La escala de
 * color no está aquí —está en la barra lateral, a un botón— porque sobre el
 * mapa taparía justo lo que explica.
 */

import { PICKER_VARIABLE_ORDER, VARIABLES, type MapVariable } from '../../lib/variables'
import { t } from '../../i18n'

interface Props {
  variable: MapVariable
  onVariable: (v: MapVariable) => void
  gridOn: boolean
  onToggleGrid: () => void
}

export function VariableChips({ variable, onVariable, gridOn, onToggleGrid }: Props) {
  return (
    <div className="mchips">
      {PICKER_VARIABLE_ORDER.map((id) => VARIABLES[id]).map((v) => (
        <button
          key={v.id}
          className="mchip"
          aria-pressed={variable === v.id}
          onClick={() => onVariable(v.id)}
        >
          {v.short}
          {v.derived && (
            <em className="derived-mark" aria-hidden>
              {' '}
              ƒ
            </em>
          )}
        </button>
      ))}
      <button
        className="mchip mchip-accent"
        aria-pressed={gridOn}
        onClick={onToggleGrid}
        title={t.layers.grid}
      >
        {t.mobile.grid}
      </button>
    </div>
  )
}
