/**
 * Cabecera del móvil: el nombre y la línea de estado de la red.
 *
 * La línea de abajo es la que dice si lo que se está mirando vale —cuántas
 * estaciones publican de cuántas hay—, y si el Cabildo no responde lo dice ahí
 * y no en un diálogo. Va sobre el mapa, sin fondo propio: lo que la hace
 * legible es el degradado de `TopFade`.
 */

import { t } from '../../i18n'
import type { StatusPart } from './status'

interface Props {
  status: StatusPart[]
}

export function MobileHeader({ status }: Props) {
  return (
    <header className="mhead">
      <h1>{t.app.name}</h1>
      <p className="mono">
        {status.map((part, i) => (
          <span key={i} className={part.strong ? 'strong' : undefined}>
            {i > 0 ? ' · ' : ''}
            {part.text}
          </span>
        ))}
      </p>
    </header>
  )
}
