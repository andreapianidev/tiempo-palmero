/**
 * Si la app se está viendo en una pantalla estrecha.
 *
 * El umbral es 720 px y es el MISMO que usa la hoja de estilos: si los dos
 * números se separan, hay una franja de anchos en la que JavaScript monta la
 * hoja del móvil y el CSS la pinta como si fuera un panel de escritorio. Por
 * eso el valor está aquí una sola vez y `mobile.css` no vuelve a escribirlo:
 * cuelga todo de la clase `.app-mobile`, que la pone este hook.
 *
 * Es el ancho y no el táctil: un iPad y un portátil con pantalla táctil tienen
 * sitio de sobra para la barra lateral, y un teléfono no lo tiene aunque se le
 * enchufe un ratón.
 */

import { useEffect, useState } from 'react'

export const MOBILE_QUERY = '(max-width: 720px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
