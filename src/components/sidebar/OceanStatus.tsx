/**
 * Cómo está el mar, en cifras.
 *
 * Es la mitad honesta de la sección: al lado de un océano que se mueve de forma
 * muy convincente hay que poder leer CON QUÉ se está moviendo, de dónde sale y
 * de cuándo es. Un mar así de vistoso sin esta tabla al lado invitaría a
 * creérselo como si fuera una observación, y no lo es: es un modelo.
 *
 * Las cifras salen de la MISMA interpolación que alimenta al sombreador
 * (`seaStateAt`), no de una cuenta parecida hecha aquí. Si el panel dice 1,3 m
 * frente a Tazacorte, ahí es donde el mar está dibujando 1,3 m.
 */

import { useMemo } from 'react'
import type { OceanData } from '../../hooks/useOcean'
import { seaStateAt } from '../../lib/ocean/field'
import {
  beaufort,
  breakingDepth,
  deepWavelength,
  whitecapCover,
} from '../../lib/ocean/sea-state'
import { toDirection } from '../../lib/wind/field'
import { n, n0 } from '../../i18n'

/** De grados a rumbo de ocho puntas, que es como se habla del mar. */
const ROSE = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
const rose = (deg: number) => ROSE[Math.round(((deg % 360) + 360) % 360 / 45) % 8]

/** La dirección de la que VIENE un tren que avanza hacia (x, y). */
const fromDirection = (x: number, y: number) => (toDirection(x, y) + 180) % 360

interface Props {
  ocean: OceanData
  /** Punto elegido en el mapa, si lo hay: ahí es donde se mide. */
  here: { lon: number; lat: number; label: string | null } | null
  now: number
}

export function OceanStatus({ ocean, here, now }: Props) {
  // Sin punto elegido se describe el mar al oeste de la isla, que es el que se
  // ve en la vista de llegada y el que decide si se puede salir de Tazacorte.
  const at = here ?? { lon: -18.02, lat: 28.62, label: 'al oeste de la isla' }

  const state = useMemo(
    () =>
      ocean.marine.length ? seaStateAt(ocean.marine, null, [], at.lon, at.lat) : null,
    [ocean.marine, at.lon, at.lat],
  )

  if (!state) {
    return <p className="dim small">Todavía no hay estado del mar.</p>
  }

  const swellFrom = fromDirection(state.swell.dirX, state.swell.dirY)
  const chopFrom = fromDirection(state.windSea.dirX, state.windSea.dirY)
  const combined = Math.hypot(state.swell.heightM, state.windSea.heightM)
  const breaks = breakingDepth(Math.max(state.swell.heightM, state.windSea.heightM), state.swell.periodS)
  const ageMin = ocean.observedAt ? Math.round((now - ocean.observedAt) / 60000) : null

  return (
    <>
      <table className="kv">
        <tbody>
          <tr>
            <th>Mar de fondo</th>
            <td>
              {n(state.swell.heightM)} m del {rose(swellFrom)} · {n(state.swell.periodS)} s
            </td>
          </tr>
          <tr>
            <th>Mar de viento</th>
            <td>
              {n(state.windSea.heightM)} m del {rose(chopFrom)} · {n(state.windSea.periodS)} s
            </td>
          </tr>
          <tr>
            <th>Altura combinada</th>
            <td>{n(combined)} m</td>
          </tr>
          <tr>
            <th>Longitud de onda</th>
            <td>{n0(deepWavelength(state.swell.periodS))} m</td>
          </tr>
          <tr>
            <th>Rompe a</th>
            <td>{n(breaks)} m de fondo</td>
          </tr>
          {ocean.tideM !== null && (
            <tr>
              <th>Marea</th>
              <td>
                {ocean.tideM >= 0 ? '+' : '−'}
                {n(Math.abs(ocean.tideM))} m sobre el nivel medio
              </td>
            </tr>
          )}
          {ocean.sstC !== null && (
            <tr>
              <th>Agua</th>
              <td>{n(ocean.sstC)} °C</td>
            </tr>
          )}
          <tr>
            <th>Viento sobre el mar</th>
            <td>
              {n(ocean.windMs)} m/s · fuerza {beaufort(ocean.windMs)}
            </td>
          </tr>
          <tr>
            <th>Borreguillos</th>
            <td>
              {whitecapCover(ocean.windMs) < 0.002
                ? 'ninguno'
                : `${n(100 * whitecapCover(ocean.windMs))} % del mar`}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="dim small">
        Medido {at.label ? `en ${at.label}` : 'en el punto elegido'}. Toca el mapa
        para preguntar en otro sitio: alrededor de esta isla el oleaje no es el
        mismo por los cuatro costados.
      </p>

      <p className="dim small">
        Oleaje, marea, temperatura del agua y corriente son <strong>modelo</strong>{' '}
        (Open-Meteo Marine, sobre MFWAM/ECMWF)
        {ageMin !== null && ageMin >= 0 ? `, pasada de hace ${ageMin} min` : ''}. No hay
        boya publicando oleaje en abierto alrededor de La Palma contra la que
        contrastarlo. El viento sí sale de las estaciones del Cabildo donde
        llegan, y la profundidad es batimetría medida (EMODnet, 115 m de celda).
      </p>

      {ocean.pm10 !== null && ocean.pm10 > 40 && (
        <p className="dim small">
          Con {n0(ocean.pm10)} µg/m³ de PM10 el cielo no está azul, y el mar
          refleja lo que hay: por eso el agua se ve metálica y el brillo del sol,
          ancho.
        </p>
      )}
    </>
  )
}
