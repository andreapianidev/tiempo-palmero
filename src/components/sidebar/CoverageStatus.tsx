/**
 * De qué está hecho el mapa de cobertura, empezando por cuándo se midió.
 *
 * La fecha va primero y va sola. Es un sondeo de 2013 y todo lo demás —cuántas
 * medidas, qué niveles, qué colores— se lee distinto según se sepa eso o no.
 */

import { coverageBand } from '../../lib/palette'
import type { CoverageState } from '../../hooks/useCoverage'
import { n0, t } from '../../i18n'

interface Props {
  state: CoverageState
}

export function CoverageStatus({ state }: Props) {
  if (state.failed) return <p className="warn small">{t.coverage.failed}</p>
  if (!state.field) {
    return (
      <p className="dim small history-loading">
        <span className="spinner" aria-hidden /> {t.coverage.loading}
      </p>
    )
  }

  const { count, range } = state.field
  return (
    <>
      <p className="warn small">{t.coverage.age}</p>
      <table className="kv">
        <tbody>
          <tr>
            <td>Medidas del sondeo</td>
            <td className="mono">{count}</td>
          </tr>
          <tr>
            <td>Mejor nivel medido</td>
            <td className="mono">
              {n0(range[1])} {t.units.dbm}{' '}
              <span className="dim">{coverageBand(range[1]).label.toLowerCase()}</span>
            </td>
          </tr>
          <tr>
            <td>Peor nivel medido</td>
            <td className="mono">
              {n0(range[0])} {t.units.dbm}{' '}
              <span className="dim">{coverageBand(range[0]).label.toLowerCase()}</span>
            </td>
          </tr>
          <tr>
            <td>Alcance de cada medida</td>
            <td className="mono">600 m</td>
          </tr>
        </tbody>
      </table>
      <p className="note small">{t.variables.coverageScope}</p>
    </>
  )
}
