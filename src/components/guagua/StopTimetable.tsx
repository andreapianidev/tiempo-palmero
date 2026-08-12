/**
 * Las horas de paso de una parada, línea por línea.
 *
 * Esto es lo único de toda la aplicación que sale de un archivo caducado y se
 * enseña igualmente. La razón es de calle, no de datos: TILP no ha renovado el
 * GTFS, pero tampoco ha cambiado el servicio, así que esa tabla es la que está
 * funcionando. Ocultarla del todo dejaba a la aplicación sin responder a la
 * única pregunta que se hace quien está de pie en una parada.
 *
 * Las condiciones para enseñarla, que no se negocian:
 *  - va PLEGADA, detrás de un botón que dice cuántas horas hay;
 *  - lleva encima la fecha de la tabla y el enlace a TILP;
 *  - no se presenta como «próxima guagua» ni se compara con el reloj: eso sería
 *    convertir una referencia en una promesa.
 */

import { formatMinutes, type GuaguaStopService } from '../../lib/guagua/network'
import { t } from '../../i18n'

interface Props {
  service: GuaguaStopService
  net: { routes: Record<string, { name: string }> } | null
}

type DayKey = 'w' | 's' | 'u'

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'w', label: t.guagua.weekday },
  { key: 's', label: t.guagua.saturday },
  { key: 'u', label: t.guagua.sunday },
]

export function countTimes(service: GuaguaStopService): number {
  return Object.values(service.times ?? {})
    .flat()
    .reduce((sum, slot) => sum + slot.w.length + slot.s.length + slot.u.length, 0)
}

export function StopTimetable({ service, net }: Props) {
  const entries = Object.entries(service.times ?? {})
  if (!entries.length) return null

  return (
    <div className="guagua-timetable">
      {entries.map(([routeId, byDestination]) =>
        byDestination.map((slots) => (
          <div key={`${routeId}|${slots.d}`} className="guagua-timetable-line">
            <h4>
              <span className="guagua-line-no">{net?.routes[routeId]?.name ?? routeId}</span>
              {/* El sentido, siempre: en la misma parada y a la misma hora
                  pasan las dos direcciones de la misma línea. */}
              <span className="guagua-line-name">{slots.d}</span>
            </h4>
            {DAYS.map(({ key, label }) =>
              slots[key].length ? (
                <p key={key}>
                  <span className="dim small">{label}</span>
                  <span className="mono guagua-hours">
                    {slots[key].map((m) => formatMinutes(m)).join(' · ')}
                  </span>
                </p>
              ) : null,
            )}
          </div>
        )),
      )}
      <p className="note small">{t.guagua.timetableNote}</p>
    </div>
  )
}
