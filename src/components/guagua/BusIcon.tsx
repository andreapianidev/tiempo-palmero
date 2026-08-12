/**
 * El icono de la red de guaguas. Trazo, no relleno: a tamaño de ficha un
 * relleno se convierte en una mancha, igual que en los iconos de los senderos.
 */

import { COLORS } from '../../lib/mapStyle'

export function BusIcon({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.2" fill="rgba(14,13,11,0.86)" stroke={COLORS.guaguaBright} strokeWidth="1.4" />
      <g fill="none" stroke={COLORS.guaguaBright} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7.4 6.8h9.2v8.4H7.4zM7.4 10.6h9.2" />
        <path d="M9 15.2v1.4M15 15.2v1.4" />
        <circle cx="9.5" cy="13" r=".6" fill={COLORS.guaguaBright} stroke="none" />
        <circle cx="14.5" cy="13" r=".6" fill={COLORS.guaguaBright} stroke="none" />
      </g>
    </svg>
  )
}
