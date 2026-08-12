/**
 * Ficha de una línea de guagua.
 *
 * Se abre desde el trazado o desde la ficha de una parada, y mientras está
 * abierta el mapa resalta el recorrido entero y las paradas de esa línea: la
 * ficha y el mapa cuentan lo mismo a la vez. Al cerrarla, el resaltado se va.
 */

import { BusIcon } from './BusIcon'
import { ServiceTable } from './ServiceTable'
import type { GuaguaNetwork } from '../../lib/guagua/network'
import { n, n0, t } from '../../i18n'

interface Props {
  routeId: string
  net: GuaguaNetwork | null
}

export function RouteDetail({ routeId, net }: Props) {
  const route = net?.routes[routeId]

  if (!route) {
    return (
      <>
        <header className="point-head poi-head">
          <BusIcon />
          <div>
            <h2>{routeId}</h2>
            <p className="mono dim">{t.guagua.routeTitle}</p>
          </div>
        </header>
        <p className="note small">{t.guagua.noLines}</p>
      </>
    )
  }

  return (
    <>
      <header className="point-head poi-head">
        <BusIcon />
        <div>
          <h2>
            {t.guagua.routeTitle} {route.name}
          </h2>
          <p className="mono dim">{route.longName}</p>
          <p className="mono dim small">{t.guagua.operator}</p>
        </div>
      </header>

      {route.destinations.length > 0 && (
        <>
          <h3>{t.guagua.destinations}</h3>
          <p className="chips">
            {route.destinations.map((d) => (
              <span className="chip chip-ghost" key={d}>
                {d}
              </span>
            ))}
          </p>
        </>
      )}

      <table className="kv">
        <tbody>
          <tr>
            <td>{t.guagua.stopsCount}</td>
            <td className="mono">{n0(route.stops)}</td>
          </tr>
          {route.lengthKm > 0 && (
            <tr>
              <td>{t.guagua.length}</td>
              <td className="mono">
                {n(route.lengthKm, 1)} {t.units.km}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="note small">{t.guagua.lengthHint}</p>

      <ServiceTable
        label={t.guagua.trips}
        counts={route.trips}
        first={route.first}
        last={route.last}
        net={net}
      />

      <p className="note small">{t.guagua.source}</p>
    </>
  )
}
