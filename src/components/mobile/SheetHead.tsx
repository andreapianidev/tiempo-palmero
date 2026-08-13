/**
 * El asa y la fila que asoma siempre: la cifra, el nombre y la línea de
 * contexto.
 *
 * Es lo único que se ve con la hoja en reposo, así que tiene que responder
 * solo: qué se está mirando, cuánto marca y con qué margen. Es también la zona
 * de arrastre, y toda ella se puede tocar para subir un escalón.
 *
 * Aquí no se calcula nada: el contenido lo arma `head.ts`. Este fichero es la
 * fila y sus tamaños, nada más.
 */

import type { PointerEvent as ReactPointerEvent } from 'react'

export interface HeadContent {
  /** La cifra grande, o un glifo cuando lo elegido no es una temperatura. */
  lead: string
  leadColor: string
  title: string
  meta: string
}

interface Props extends HeadContent {
  /** Qué pasa al tocarla: subir un escalón (o volver abajo desde arriba). */
  onCycle: () => void
  onPointerDown: (e: ReactPointerEvent) => void
  label: string
}

export function SheetHead({ lead, leadColor, title, meta, onCycle, onPointerDown, label }: Props) {
  return (
    <div className="msheet-handle" onPointerDown={onPointerDown}>
      <div className="msheet-grab" aria-hidden />
      <button className="msheet-head" onClick={onCycle} aria-label={label}>
        <span className="msheet-lead mono" style={{ color: leadColor }}>
          {lead}
        </span>
        <span className="msheet-who">
          <b>{title}</b>
          <span className="mono">{meta}</span>
        </span>
      </button>
    </div>
  )
}
