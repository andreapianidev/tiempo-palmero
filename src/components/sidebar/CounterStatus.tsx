/**
 * Estado de la red de aforos: el denominador honesto.
 *
 * La misma regla que en el resto de la aplicación —«37 de 52 estaciones», no
 * «52 estaciones»— aplicada a una red donde la diferencia es mayor todavía: la
 * mayoría de los contadores dados de alta lleva más de una semana callada, y
 * los que hablan lo hacen todos los días. Sin las tres cifras juntas, esta red
 * parece perfecta o parece rota según cuál se enseñe.
 */

import type { CounterCensus } from '../../lib/counters/model'
import { t } from '../../i18n'

interface Props {
  census: CounterCensus | null
  loading: boolean
  error: boolean
}

export function CounterStatus({ census, loading, error }: Props) {
  if (error && !census) return <p className="warn small">{t.counters.error}</p>
  if (!census) return <p className="dim small">{loading ? t.counters.loading : '—'}</p>

  return (
    <>
      <table className="kv">
        <tbody>
          <tr>
            <td>Publicando hoy</td>
            <td className="mono">
              {census.liveSites} <span className="dim">emplazamientos · {census.liveChannels} contadores</span>
            </td>
          </tr>
          <tr>
            <td>Con datos esta semana</td>
            <td className="mono">
              {census.weekSites} <span className="dim">· {census.weekChannels}</span>
            </td>
          </tr>
          <tr>
            <td>Registrados</td>
            <td className="mono">
              {census.registeredSites} <span className="dim">· {census.registeredChannels}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="note small">
        {t.counters.censusHint(census.registeredChannels, census.registeredSites)}
      </p>
    </>
  )
}
