/**
 * El bloque de servicio, común a la ficha de parada y a la de línea.
 *
 * Existe para que el aviso de caducidad y las cifras que describe no puedan
 * separarse nunca: van en el mismo componente, y cualquier sitio que enseñe
 * volumen de servicio arrastra el aviso consigo.
 */

import { formatIsoDate, type DayCounts, type GuaguaNetwork } from '../../lib/guagua/network'
import { n0, t } from '../../i18n'

interface Props {
  /** «Salidas» en una parada, «Viajes» en una línea: no es lo mismo. */
  label: string
  counts: DayCounts
  first: string | null
  last: string | null
  net: GuaguaNetwork | null
}

export function ServiceTable({ label, counts, first, last, net }: Props) {
  const until = formatIsoDate(net?.validUntil)
  return (
    <>
      <h3>{t.guagua.serviceTitle}</h3>
      <table className="kv">
        <tbody>
          <tr>
            <td>{`${label} · ${t.guagua.weekday}`}</td>
            <td className="mono">{n0(counts.weekday)}</td>
          </tr>
          <tr>
            <td>{`${label} · ${t.guagua.saturday}`}</td>
            <td className="mono">{n0(counts.saturday)}</td>
          </tr>
          <tr>
            <td>{`${label} · ${t.guagua.sunday}`}</td>
            <td className="mono">{n0(counts.sunday)}</td>
          </tr>
          <tr>
            <td>{t.guagua.window}</td>
            <td className="mono">
              {first && last ? t.guagua.windowValue(first, last) : t.guagua.noWindow}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="note small">
        {net?.expired === false ? t.guagua.notExpired(until) : t.guagua.expired(until)}{' '}
        <a href={t.guagua.operatorUrl} target="_blank" rel="noreferrer">
          {t.guagua.operatorLink} →
        </a>
      </p>
    </>
  )
}
