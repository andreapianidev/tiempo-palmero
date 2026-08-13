/**
 * El índice de incendio de un punto, y por qué sale ese y no otro.
 *
 * ES UN BLOQUE APARTE Y NO CIEN LÍNEAS MÁS EN `PointPanel`, por la regla del
 * repositorio y porque además dice otra cosa: el resto del panel enseña
 * medidas y estimaciones del tiempo, y esto enseña la salida de un modelo
 * experimental. Mezclarlos en el mismo bloque los igualaría.
 *
 * QUÉ SE ENSEÑA, Y EN QUÉ ORDEN. Primero el índice. Debajo, **los dos factores
 * por separado** —el sitio y el día— porque el producto solo se entiende
 * viéndolos: un 20 puede ser una ladera que arde siempre en un día tranquilo o
 * un sitio que no arde nunca en un día terrible, y no son la misma noticia.
 * Después, qué rasgo del sitio está moviendo la cifra. Y al final, lo que la
 * cifra no es.
 */

import { t } from '../i18n'
import { n } from '../i18n'
import { fuelDetail, fuelLabel } from '../lib/fire/fuel'
import { fireBand } from '../lib/palette'
import { contributions } from '../lib/fire/model'
import { sampleFire, type FireFieldInput } from '../lib/fire/field'

interface Props {
  input: FireFieldInput
  lon: number
  lat: number
}

export function FireBlock({ input, lon, lat }: Props) {
  const sample = sampleFire(input, lon, lat)
  if (!sample) {
    return (
      <section className="block">
        <h3 className="lbl">{t.fireRisk.layer}</h3>
        <p className="dim small">{t.fireRisk.unknownFuel}</p>
      </section>
    )
  }

  const index = sample.index * 100
  const band = fireBand(index)
  const why = contributions(input.statics.spec, sample.inputs).slice(0, 4)

  return (
    <section className="block">
      <h3 className="lbl">{t.fireRisk.layer}</h3>

      <p className="fire-index mono" style={{ color: band.color }}>
        {Math.round(index)}
        <span className="dim small"> · {band.label}</span>
      </p>
      <p className="warn small">{t.fireRisk.disclaimer}</p>

      <table className="kv">
        <tbody>
          <tr>
            <th>{t.fireRisk.site}</th>
            <td className="mono">{Math.round(sample.susceptibility * 100)}</td>
          </tr>
          <tr>
            <th>{t.fireRisk.today}</th>
            <td className="mono">
              percentil {Math.round(sample.danger.value * 100)}
            </td>
          </tr>
          <tr>
            <th>{t.fireRisk.fuel}</th>
            <td>{fuelLabel(sample.inputs.fuel)}</td>
          </tr>
          <tr>
            <th>{t.fireRisk.slope}</th>
            <td className="mono">{Math.round(sample.inputs.slopeDeg)}°</td>
          </tr>
          <tr>
            <th>{t.fireRisk.distance}</th>
            <td className="mono">{n(sample.inputs.distanceM, 0)} m</td>
          </tr>
          <tr>
            <th>{t.fireRisk.fosberg}</th>
            <td className="mono">
              {n(sample.fosberg, 0)} · p{Math.round(sample.danger.fosbergPercentile * 100)}
            </td>
          </tr>
          <tr>
            <th>{t.fireRisk.dryness}</th>
            <td className="mono">
              {sample.daysSinceRain === null
                ? '—'
                : `${sample.daysSinceRain} días${
                    sample.danger.drynessPercentile !== null
                      ? ` · p${Math.round(sample.danger.drynessPercentile * 100)}`
                      : ''
                  }`}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="dim small">{fuelDetail(sample.inputs.fuel)}</p>

      {/*
        El viento entra en el índice de Fosberg, y en esta isla solo 24 de 37
        estaciones lo publican. Cuánto de la cifra es medido y cuánto lo pone el
        modelo se declara aquí, igual que en la sección de senderos.
      */}
      {sample.windFromStations < 0.99 && (
        <p className="dim small">
          El viento de este punto lo pone en un{' '}
          {Math.round((1 - sample.windFromStations) * 100)} % el modelo, no las estaciones.
        </p>
      )}

      {why.length > 0 && (
        <>
          <h4 className="lbl">{t.fireRisk.why}</h4>
          <table className="kv">
            <tbody>
              {why.map((w) => (
                <tr key={w.name}>
                  <th>{predictorLabel(w.name)}</th>
                  <td className="mono">
                    {w.delta > 0 ? '+' : '−'}
                    {Math.abs(Math.round(w.delta * 100))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dim small">{t.fireRisk.whyHint}</p>
        </>
      )}

      {sample.daysSinceRain === null && <p className="dim small">{t.fireRisk.noDrought}</p>}
    </section>
  )
}

/** El nombre interno de un predictor, en castellano. */
function predictorLabel(name: string): string {
  if (name.startsWith('fuel')) return fuelLabel(Number(name.slice(4)))
  switch (name) {
    case 'elevation_km':
      return 'La altitud'
    case 'slope':
      return 'La pendiente'
    case 'southness':
      return 'Mirar al sur'
    case 'westness':
      return 'Mirar al oeste'
    case 'log_distance':
      return 'La distancia a una vía'
    default:
      return name
  }
}
