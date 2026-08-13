/**
 * Las estaciones que existen pero no llegan al mapa.
 *
 * POR QUÉ ES UN BLOQUE Y NO UNA CIFRA. El panel del modelo dice «35 de 52
 * estaciones activas», y ese denominador honesto era ya mejor que presumir de
 * 52. Pero seguía sin contestar la pregunta siguiente, que es la que se hace
 * cualquiera que mire el mapa: ¿y las otras diecisiete, dónde están? Aquí se
 * dicen sus nombres y por qué no se dibujan — una lleva parada desde mayo de
 * 2023, y eso no es un fallo de la aplicación aunque lo parezca.
 */

import type { DropReason, NetworkCensus } from '../../lib/quality'
import { MAX_AGE_H } from '../../lib/quality'
import { t } from '../../i18n'

interface Props {
  census: NetworkCensus | null
}

/** Orden de aparición: primero lo que más gente se pregunta. */
const ORDER: DropReason[] = ['stale', 'noMetric', 'implausible', 'offIsland']

const LINE: Record<DropReason, (n: number) => string> = {
  stale: (n) => t.hidden.stale(n, MAX_AGE_H),
  noMetric: (n) => t.hidden.noMetric(n),
  implausible: (n) => t.hidden.implausible(n),
  offIsland: (n) => t.hidden.offIsland(n),
}

/** «hace 3 meses» es más legible que «hace 2160 h» cuando lleva parada un año. */
function since(ageHours: number | null): string {
  if (ageHours === null) return 'sin fecha legible'
  if (ageHours < 48) return `${Math.round(ageHours)} h`
  const days = ageHours / 24
  if (days < 60) return `${Math.round(days)} días`
  return `${Math.round(days / 30)} meses`
}

export function HiddenStations({ census }: Props) {
  if (!census || !census.dropped.length) return null

  const groups = ORDER.map((reason) => ({
    reason,
    rows: census.dropped.filter((d) => d.reason === reason),
  })).filter((g) => g.rows.length)

  return (
    <>
      <p className="headline-stat">{t.hidden.summary(census.dropped.length)}</p>

      {groups.map(({ reason, rows }) => (
        <section key={reason} className="hidden-group">
          <p className="small">{LINE[reason](rows.length)}</p>
          <ul className="hidden-list mono small dim">
            {/* Ordenadas por antigüedad: las que llevan años paradas al final,
                que son las que menos dicen sobre el estado de hoy. */}
            {[...rows]
              .sort((a, b) => (a.ageHours ?? Infinity) - (b.ageHours ?? Infinity))
              .map((row) => (
                <li key={row.entityId}>
                  {row.name}
                  {reason === 'stale' && <span className="dim"> · {since(row.ageHours)}</span>}
                </li>
              ))}
          </ul>
        </section>
      ))}

      <p className="dim small">{t.hidden.note}</p>
    </>
  )
}
