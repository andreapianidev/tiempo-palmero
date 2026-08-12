/**
 * Estado del modelo. Es el bloque que no se puede quitar.
 *
 * Enseña el denominador honesto —«X de 52 estaciones activas», no «52
 * estaciones»—, el gradiente REAL medido ahora mismo, el R², el RMSE de
 * validación y, desde el audit del 12 ago 2026, **hasta qué altitud llega de
 * verdad la red**. Esto último faltaba y era lo que más se echaba en falta: el
 * mapa pinta la isla entera hasta 2426 m, pero el ajuste se sostiene solo
 * dentro del rango de altitudes que hay medido.
 */

import type { InterpolableVariable, Model } from '../../lib/interpolate'
import type { NetworkCensus } from '../../lib/quality'
import { humanAge, n, t } from '../../i18n'

interface Props {
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  /** % de isla por encima del techo de la red. null si el DEM aún no está. */
  shareAboveCeiling: number | null
  lastUpdate: number | null
  now: number
}

export function ModelStatus(props: Props) {
  const { models, census, validation, shareAboveCeiling } = props
  // El bloque describe SIEMPRE el ajuste de temperatura: es el que marca el
  // gradiente de la isla y el que valida el RMSE. Enseñar el ajuste de la
  // humedad bajo la etiqueta «gradiente medido» confundiría dos cosas.
  const model = models.temperature
  const lapsePerKm = model ? -model.b * 1000 : null

  // Dos relojes distintos, y la diferencia importa: se puede haber consultado
  // hace 10 segundos una red cuya lectura más reciente es de hace hora y media.
  const newestObservation = model?.used.length
    ? Math.max(...model.used.map((u) => u.observedAt))
    : null

  // El techo real del mapa es el más bajo de los dos ajustes: por encima de él
  // ya hay al menos una variable extrapolada, y el punto de rocío las mezcla.
  const ceilings = (['temperature', 'relativehumidity'] as const)
    .map((v) => models[v])
    .filter((m): m is Model => !!m && m.used.length > 0)
    .map((m) => m.elevationRange[1])
  const ceiling = ceilings.length ? Math.min(...ceilings) : null
  // Anclas activas en cualquiera de los dos ajustes: si las hay, el hueco de
  // arriba ya no es una extrapolación a ciegas y el aviso cambia de tono.
  const anchorCount = Math.max(
    ...(['temperature', 'relativehumidity'] as const).map((v) => models[v]?.anchors ?? 0),
  )
  const anchored = anchorCount > 0
  // Ambas cifras describen el ajuste de temperatura, igual que el resto del
  // bloque, así que la unidad es siempre la suya.
  const calibration = model?.calibration ?? null
  const unit = t.units.celsius

  return (
    <>
      {census ? (
        <p className="headline-stat">
          {t.model.stationsUsed(census.usable, census.total)}
        </p>
      ) : (
        <p className="dim">{t.loading.stations}…</p>
      )}

      <table className="kv mono small">
        <tbody>
          {lapsePerKm !== null && (
            <tr>
              <td>{t.model.lapseRate}</td>
              <td>
                {n(lapsePerKm, 2)} {t.model.lapseRateUnit}
              </td>
            </tr>
          )}
          {model && (
            <tr>
              <td>{t.model.r2}</td>
              <td>{n(model.r2, 3)}</td>
            </tr>
          )}
          {validation && (
            <tr>
              <td>{t.model.rmse}</td>
              <td>
                {n(validation.rmse, 2)} {t.units.celsius}
              </td>
            </tr>
          )}
          {calibration && (
            <tr title={t.model.bandHint}>
              <td>{t.model.band}</td>
              <td>
                ±{n(calibration.scale, 2)} {unit}
              </td>
            </tr>
          )}
          {anchorCount > 0 && (
            <tr>
              <td>{t.model.anchorTag}</td>
              <td>{t.model.anchorsActive(anchorCount)}</td>
            </tr>
          )}
          {calibration?.modelBias !== null && calibration?.modelBias !== undefined && (
            <tr title={t.model.modelDeviationHint(calibration.modelN)}>
              <td>{t.model.modelDeviation}</td>
              <td>
                {calibration.modelBias >= 0 ? '+' : '−'}
                {n(Math.abs(calibration.modelBias), 1)} {unit}
              </td>
            </tr>
          )}
          {model && model.used.length > 0 && (
            <tr>
              <td>{t.model.coverage}</td>
              <td>
                {Math.round(model.elevationRange[0])}–{Math.round(model.elevationRange[1])}{' '}
                {t.units.metres}
              </td>
            </tr>
          )}
          {newestObservation && (
            <tr>
              <td>{t.model.dataAge}</td>
              <td>{humanAge(props.now - newestObservation)}</td>
            </tr>
          )}
          {props.lastUpdate && (
            <tr>
              <td>{t.model.fetchAge}</td>
              <td>{humanAge(props.now - props.lastUpdate)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {model && model.rejected.length > 0 && (
        <p className="dim small">{t.model.rejected(model.rejected.length)}</p>
      )}
      {validation && <p className="dim small">{t.model.validationNote}</p>}

      {ceiling !== null && shareAboveCeiling !== null && shareAboveCeiling >= 1 && (
        <p className="warn small">
          {anchored
            ? t.model.ceilingAnchored(Math.round(ceiling), Math.round(shareAboveCeiling))
            : t.model.ceilingWarning(Math.round(ceiling), Math.round(shareAboveCeiling))}
        </p>
      )}

      <details className="explain">
        <summary>{t.model.explainTitle}</summary>
        <p className="small">{t.model.explain}</p>
      </details>
    </>
  )
}
