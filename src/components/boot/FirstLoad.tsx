/**
 * La barra de la primera carga: una pastilla arriba a la derecha que dice
 * cuántas capas van de las que la aplicación descarga al estrenarse.
 *
 * Va en la MISMA esquina en el teléfono y en el escritorio, y no es pereza: es
 * la única esquina libre en los dos. Abajo a la derecha están el zoom y la
 * atribución, abajo a la izquierda la escala, arriba a la izquierda el título
 * —o la barra lateral—, y abajo del todo, en el teléfono, la hoja asomando.
 *
 * No se puede tocar (`pointer-events: none`): tapa un trozo de mapa durante unos
 * segundos y lo que hay debajo se sigue pudiendo arrastrar.
 *
 * Quién decide si sale y con qué números: `hooks/useFirstLoad.ts`.
 */

import { t } from '../../i18n'

interface Props {
  done: number
  total: number
}

export function FirstLoad({ done, total }: Props) {
  const pct = total ? (done / total) * 100 : 0
  return (
    <div className="firstload" role="status" aria-live="polite">
      <p>{t.firstLoad.label(done, total)}</p>
      <div className="firstload-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
