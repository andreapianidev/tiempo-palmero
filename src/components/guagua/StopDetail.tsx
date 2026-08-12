/**
 * Ficha de una parada de guagua.
 *
 * Responde a las tres preguntas que se hace quien pincha una parada, en este
 * orden: qué líneas paran aquí, cuánto servicio tenía —con la fecha de
 * caducidad delante— y si se puede subir en silla de ruedas. Lo que nunca
 * responde es «a qué hora pasa»: eso lo tiene TILP, y la ficha enlaza allí.
 */

import { BusIcon } from './BusIcon'
import { ServiceTable } from './ServiceTable'
import {
  compareLines,
  serviceLevel,
  type GuaguaNetwork,
  type GuaguaStopPoint,
} from '../../lib/guagua/network'
import { n, n0, t } from '../../i18n'

/** La parada del mapa más lo que la app sabe del sitio. */
export interface GuaguaStopSelection extends GuaguaStopPoint {
  elevation: number | null
  municipality: string | null
}

interface Props {
  stop: GuaguaStopSelection
  net: GuaguaNetwork | null
  onRoute: (routeId: string) => void
  onWeather: (lon: number, lat: number, label: string) => void
}

export function StopDetail({ stop, net, onRoute, onWeather }: Props) {
  const service = net?.stops[stop.stopId] ?? null
  const routes = [...(service?.routes ?? [])].sort((a, b) => compareLines(net, a, b))
  const level = service ? serviceLevel(service.departures) : null

  return (
    <>
      <header className="point-head poi-head">
        <BusIcon />
        <div>
          <h2>{stop.name}</h2>
          <p className="mono dim">
            {t.guagua.stopTitle}
            {stop.code && <> · {t.guagua.stopCode} {stop.code}</>}
          </p>
          <p className="mono dim small">
            {stop.municipality ?? t.point.outsideIsland}
            {stop.elevation !== null && (
              <>
                {' '}
                · {n0(stop.elevation)} {t.units.metres}
              </>
            )}
          </p>
        </div>
      </header>

      <button className="link-btn poi-weather" onClick={() => onWeather(stop.lon, stop.lat, stop.name)}>
        {t.guagua.weatherHere} →
      </button>

      <h3>{t.guagua.linesHere}</h3>
      {routes.length ? (
        <ul className="guagua-lines">
          {routes.map((id) => {
            const r = net?.routes[id]
            return (
              <li key={id}>
                <button
                  className="guagua-line"
                  onClick={() => onRoute(id)}
                  title={t.guagua.showRoute}
                >
                  <span className="guagua-line-no">{r?.name ?? id}</span>
                  <span className="guagua-line-name">{r?.longName ?? ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="note small">{t.guagua.noLines}</p>
      )}

      {service && (
        <>
          {level && (
            <p className="chips">
              <span className={`chip chip-guagua-${level}`}>{t.guagua.levels[level]}</span>
            </p>
          )}
          <ServiceTable
            label={t.guagua.departures}
            counts={service.departures}
            first={service.first}
            last={service.last}
            net={net}
          />
        </>
      )}

      <h3>{t.guagua.wheelchair}</h3>
      <p className="mono">{t.guagua.wheelchairStates[stop.wheelchair]}</p>
      <p className="note small">{t.guagua.wheelchairNote}</p>

      <table className="kv">
        <tbody>
          <tr>
            <td>{t.poi.coords}</td>
            <td className="mono">
              {n(stop.lat, 5)}, {n(stop.lon, 5)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="note small">{t.guagua.source}</p>
    </>
  )
}
