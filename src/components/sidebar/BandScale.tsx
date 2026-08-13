/**
 * Escala por tramos, para las variables que no admiten degradado.
 *
 * Existe aparte de la rampa porque dice otra cosa. Una rampa afirma que entre
 * dos colores hay un continuo; estos cuatro tramos afirman lo contrario: que
 * 999 y 1001 ppm caen a distinto lado de un umbral de decisión y que el color
 * tiene que saltar ahí, no disolverse.
 *
 * Las etiquetas son las de `palette.ts` y ninguna dice «seguro»: quien decide
 * si un sitio es seguro es el Cabildo, no esta pantalla.
 */

import type { Co2Band } from '../../lib/palette'
import { n0 } from '../../i18n'

interface Props {
  bands: Co2Band[]
  unit: string
}

export function BandScale({ bands, unit }: Props) {
  return (
    <ul className="band-scale">
      {bands.map((b, i) => {
        const next = bands[i + 1]
        const range =
          i === 0 && next
            ? `< ${n0(next.from)}`
            : next
              ? `${n0(b.from)}–${n0(next.from)}`
              : `> ${n0(b.from)}`
        return (
          <li key={b.from}>
            <span className="band-swatch" style={{ background: b.color }} aria-hidden />
            <span className="mono band-range">
              {range} {unit}
            </span>
            <span className="dim band-label">{b.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
