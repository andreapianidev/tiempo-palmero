/**
 * Sección plegable del panel lateral.
 *
 * El panel va a crecer —ambiente, agricultura, energía, aforos— y una lista
 * plana de todo eso obliga a bajar treinta centímetros para llegar al bloque
 * del modelo. Cada bloque se pliega, y el que no interesa ocupa una línea.
 *
 * Es un `<details>` de verdad, no un div con estado: el navegador ya sabe
 * anunciarlo (`role=group`, expandido o no), buscar dentro de él con Ctrl+F
 * aunque esté cerrado, y abrirlo al saltar a un ancla. Reimplementarlo con
 * `useState` cuesta accesibilidad a cambio de nada.
 */

import type { ReactNode } from 'react'

interface Props {
  title: string
  /** Cifra o etiqueta corta a la derecha del título, visible aun plegado. */
  badge?: ReactNode
  /** Los bloques centrales abren; los accesorios se piden. */
  defaultOpen?: boolean
  children: ReactNode
}

export function Section({ title, badge, defaultOpen = false, children }: Props) {
  return (
    <details className="block section" open={defaultOpen}>
      <summary className="lbl section-summary">
        <span>{title}</span>
        {badge != null && <span className="section-badge mono">{badge}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}
