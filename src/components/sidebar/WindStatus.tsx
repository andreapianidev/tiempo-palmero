/**
 * Procedencia del viento, dicha en números.
 *
 * El mapa de viento es la única capa de esta aplicación donde un modelo pinta
 * encima de la isla, y por eso es la única que lleva este bloque. No basta con
 * que el trazo modelado se vea más tenue: aquí se dice cuántas estaciones lo
 * miden de verdad, qué parte del mapa la sostiene el modelo y de cuándo es la
 * pasada.
 */

import { n0 } from '../../i18n'
import type { WindState } from '../../hooks/useWindField'
import { MODEL_SOURCE_LABEL } from '../../lib/openmeteo'
import { STATION_SCALE_KM } from '../../lib/wind/field'
import { timeAcceleration } from '../../lib/wind/particles'

interface Props {
  wind: WindState
  /** Estaciones que han pasado el control de calidad, para el denominador. */
  usableStations: number | null
  now: number
}

export function WindStatus({ wind, usableStations, now }: Props) {
  const { field, measuring, modelAt, modelFailed } = wind

  if (!field) {
    return (
      <p className="dim small">
        Ninguna estación publica dirección del viento ahora mismo y el modelo no
        responde: no hay campo que dibujar.
      </p>
    )
  }

  const modelPct = Math.round(field.modelShare * 100)
  const ageMin = modelAt ? Math.round((now - modelAt) / 60_000) : null
  // Con la isla entera en pantalla. Se calcula sobre el alto del propio campo
  // en vez de escribir la cifra a mano: si el recuadro cambia, cambia aquí.
  const speedUp = Math.round(timeAcceleration(field.bounds[3] - field.bounds[1]) / 50) * 50

  return (
    <>
      <table className="kv">
        <tbody>
          <tr>
            <td>Estaciones que lo miden</td>
            <td className="mono">
              {measuring}
              {usableStations !== null && <span className="dim"> / {usableStations}</span>}
            </td>
          </tr>
          <tr>
            <td>Mapa sostenido por el modelo</td>
            <td className="mono">{modelPct} %</td>
          </tr>
          {modelAt !== null && (
            <tr>
              <td>Pasada del modelo</td>
              <td className="mono">
                {ageMin !== null && ageMin >= 0 ? `hace ${n0(ageMin)} min` : '—'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {modelFailed && (
        <p className="warn small">
          {MODEL_SOURCE_LABEL} no responde. El campo se dibuja solo con las
          estaciones que miden, así que fuera de su entorno inmediato no hay nada
          que enseñar.
        </p>
      )}

      <p className="note small">
        El color es la <strong>velocidad</strong>; el trazo tenue es lo que
        sostiene el modelo y el trazo nítido lo que miden las estaciones del
        Cabildo. Cada estación manda en unos {STATION_SCALE_KM} km a su
        alrededor: más allá, en esta isla, el alisio y el efecto föhn hacen que
        su viento ya no valga, y ahí es {MODEL_SOURCE_LABEL} quien contesta.
      </p>
      <p className="dim small">
        Las partículas corren a la velocidad medida, con el tiempo acelerado
        unas <strong>{n0(speedUp)} veces</strong> con la isla entera en pantalla
        —a escala real, un alisio de 5 m/s tardaría dos horas y media en
        cruzarla— y proporcionalmente menos al acercarse. La aceleración es la
        misma para todas: <strong>una estela que corre el doble lleva el doble
        de viento</strong>, y su longitud son los últimos 0,6 s de recorrido. La
        cifra exacta en un punto la da su ficha.
      </p>
    </>
  )
}
