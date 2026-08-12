/**
 * Ficha de un tramo de carretera.
 *
 * Al revés que la de los sitios, esta no vuelca los campos crudos: son seis,
 * dos de ellos son la misma longitud medida de dos maneras, y esa diferencia es
 * justo lo interesante que hay aquí. La longitud oficial es la del inventario
 * de carreteras; la GIS es la del trazado dibujado. Cuando no coinciden, lo que
 * hay debajo es un trazado redibujado o un inventario viejo, y esconderlo
 * detrás de una sola cifra sería fingir una precisión que el dato no tiene.
 */

import type { RoadRecord } from '../../lib/roads'
import { n, n0, t } from '../../i18n'

/** El tramo del mapa más el punto exacto donde se ha pinchado. */
export interface RoadSelection extends RoadRecord {
  lon: number
  lat: number
}

interface Props {
  road: RoadSelection
  onWeather: (lon: number, lat: number, label: string) => void
}

/** Metros a la unidad que se lee de un vistazo. */
function length(m: number): string {
  return m >= 1000 ? `${n(m / 1000, 1)} km` : `${n0(m)} ${t.units.metres}`
}

export function RoadDetail({ road, onWeather }: Props) {
  const drift =
    road.officialM !== null && road.gisM !== null ? road.gisM - road.officialM : null

  return (
    <>
      <header className="point-head">
        <h2>{road.name}</h2>
        <p className="mono dim">
          {road.code && <span className="chip chip-road">{road.code}</span>}
          {road.owner && (
            <>
              {road.code ? ' · ' : ''}
              {t.roads.ownerLabel(road.owner)}
            </>
          )}
        </p>
        {road.route && <p className="mono dim small">{road.route}</p>}
      </header>

      <button
        className="link-btn poi-weather"
        onClick={() => onWeather(road.lon, road.lat, road.code ?? road.name)}
      >
        {t.roads.weatherHere} →
      </button>

      <table className="kv">
        <tbody>
          {road.officialM !== null && (
            <tr>
              <td>{t.roads.officialLength}</td>
              <td className="mono">{length(road.officialM)}</td>
            </tr>
          )}
          {road.gisM !== null && (
            <tr title={t.roads.gisHint}>
              <td>{t.roads.gisLength}</td>
              <td className="mono">
                {length(road.gisM)}
                {drift !== null && drift !== 0 && (
                  <em className="dim">
                    {' '}
                    {drift > 0 ? '+' : '−'}
                    {n0(Math.abs(drift))} {t.units.metres}
                  </em>
                )}
              </td>
            </tr>
          )}
          {road.cartoColor && (
            <tr title={t.roads.cartoHint}>
              <td>{t.roads.cartoColor}</td>
              <td className="mono">{road.cartoColor.toLowerCase()}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="note small">{t.roads.note}</p>
      <p className="note small">{t.roads.source}</p>
    </>
  )
}
