/**
 * Ficha de un sitio del Cabildo: mirador, museo, recinto histórico, zona
 * recreativa o punto de recarga.
 *
 * Enseña TODOS los campos que publica la capa, en el orden en que llegan, igual
 * que la de los puntos de senderos: son fuentes muy desiguales —una trae web y
 * teléfono, otra solo un nombre y una superficie— y listar a mano las que hoy
 * conocemos garantiza perder las que el Cabildo añada mañana.
 */

import {
  isPlaceDataProp,
  placeIconDataUrl,
  PLACE_BY_KIND,
  type PlaceRecord,
} from '../../lib/places'
import { n, n0, t } from '../../i18n'

/** El sitio del mapa más lo que la app sabe del lugar. */
export interface PlaceSelection extends PlaceRecord {
  elevation: number | null
  municipality: string | null
}

interface Props {
  place: PlaceSelection
  onWeather: (lon: number, lat: number, label: string) => void
}

/** Enlaces: la fuente los publica con varios nombres según la capa. */
const LINK_KEYS = new Set(['web', 'web_externa', 'url_ficha', 'url_imagen'])

export function PlaceDetail({ place, onWeather }: Props) {
  const spec = PLACE_BY_KIND[place.kind]
  const fields = Object.entries(place.props).filter(
    ([k, v]) => isPlaceDataProp(k) && v !== null && v !== undefined && String(v).trim() !== '',
  )

  return (
    <>
      <header className="point-head poi-head">
        <img src={placeIconDataUrl(place.kind, 34)} alt="" width={34} height={34} />
        <div>
          <h2>{place.name}</h2>
          <p className="mono dim">
            <span className="chip" style={{ background: spec.color, color: '#141311' }}>
              {t.places.kinds[place.kind]}
            </span>
          </p>
          <p className="mono dim small">
            {place.municipality ?? t.point.outsideIsland}
            {place.elevation !== null && (
              <>
                {' '}
                · {n0(place.elevation)} {t.units.metres}
              </>
            )}
          </p>
        </div>
      </header>

      <button
        className="link-btn poi-weather"
        onClick={() => onWeather(place.lon, place.lat, place.name)}
      >
        {t.poi.weatherHere} →
      </button>

      <h3>{t.poi.allFields}</h3>
      <table className="kv">
        <tbody>
          {fields.map(([k, v]) => (
            <tr key={k}>
              <td>{t.places.fields[k] ?? k}</td>
              <td className="mono">
                {LINK_KEYS.has(k) && /^https?:/i.test(String(v)) ? (
                  <a href={String(v)} target="_blank" rel="noreferrer">
                    {t.places.openLink} →
                  </a>
                ) : (
                  String(v)
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td>{t.poi.coords}</td>
            <td className="mono">
              {n(place.lat, 5)}, {n(place.lon, 5)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="note small">{t.poi.rawNote}</p>
      <p className="note small">{t.places.source}</p>
    </>
  )
}
