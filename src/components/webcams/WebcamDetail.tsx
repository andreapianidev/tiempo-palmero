/**
 * La ficha de una webcam: la foto, de cuándo es, y de quién.
 *
 * LO DELICADO AQUÍ ES LA HORA, y por eso hay tres casos distintos en vez de un
 * «actualizado hace un momento» para todos:
 *
 *  1. **El origen manda `Last-Modified`** (observatorio, ayuntamiento). Se
 *     enseña esa hora, que es la de la foto. Es la buena.
 *  2. **El origen no lo manda pero la imagen lleva el reloj impreso** (todas
 *     las del Cabildo: la fecha y la hora van quemadas en un rótulo dentro del
 *     JPEG). La ficha remite a ese rótulo en vez de fingir una hora.
 *  3. **Ninguna de las dos cosas.** Se dice solo cuándo la hemos descargado
 *     nosotros, etiquetado como tal.
 *
 * Lo que NUNCA se hace es presentar la hora de descarga como hora de la
 * imagen. Una panorámica de una torre de vigilancia puede llevar dos horas
 * congelada y descargarse ahora mismo; son cosas distintas y la diferencia
 * importa justo cuando importa la cámara.
 *
 * LAS IMÁGENES SE PIDEN AL ABRIR, no al encender la capa: son JPEG de hasta
 * 1,2 MB y hay 27. `loading="lazy"` no bastaría —la ficha está en pantalla— así
 * que lo que decide es que este componente solo existe cuando hay una
 * seleccionada.
 */

import { useMemo, useState } from 'react'
import { formatIslandTime } from '../../lib/cabildo'
import type { WebcamSite } from '../../lib/webcams/catalog'
import { useWebcamAge } from './useWebcamAge'
import { humanAge, n, t } from '../../i18n'

interface Props {
  site: WebcamSite
  now: number
  onWeather: (lon: number, lat: number, label: string) => void
}

/**
 * Añade un valor que cambia para saltarse la caché al recargar a mano.
 *
 * Con `URL` y no concatenando un `?`: el TNG sirve su imagen desde
 * `get.html?resolution=640x480`, y pegarle otro `?` da un URL inválido que el
 * navegador pide tal cual y el servidor no entiende.
 */
function bust(url: string, nonce: number): string {
  const u = new URL(url)
  u.searchParams.set('_', String(nonce))
  return u.toString()
}

export function WebcamDetail({ site, now, onWeather }: Props) {
  const urls = useMemo(() => site.views.map((v) => v.url), [site])
  const ages = useWebcamAge(urls, true)
  /** Cambia al pulsar «actualizar»: fuerza a volver a pedir las imágenes. */
  const [nonce, setNonce] = useState(() => Date.now())
  /**
   * Las que no han cargado. Son cámaras de terceros —un ayuntamiento, un
   * telescopio— que se apagan, se reinician o cambian de certificado sin
   * avisar a nadie, y el icono roto del navegador no explica nada. El caso ya
   * conocido es el GTC, que sirve una cadena TLS incompleta; ver el catálogo.
   */
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  return (
    <>
      <header className="point-head">
        <h2>{site.name}</h2>
        <p className="mono dim">
          <span className={`chip chip-cam chip-cam-${site.operator}`}>{t.webcams.title}</span>
        </p>
        <p className="mono dim small">{site.municipality}</p>
      </header>

      <div className="cam-shots">
        {site.views.map((view) => {
          const age = ages[view.url]
          const stamp = age?.lastModified ?? null
          return (
            <figure className="cam-shot" key={view.id}>
              {view.label && <figcaption className="lbl">{view.label}</figcaption>}
              {failed[view.id] ? (
                <p className="cam-failed note small">{t.webcams.unreachable}</p>
              ) : (
                <img
                  src={bust(view.url, nonce)}
                  alt={t.webcams.imageAlt(site.name, view.label)}
                  loading="lazy"
                  decoding="async"
                  // Sin `crossOrigin`: no hace falta leer los píxeles y ninguna
                  // de estas cámaras manda CORS. Pedirlo rompería la carga.
                  onError={() => setFailed((f) => ({ ...f, [view.id]: true }))}
                />
              )}
              <p className="cam-when mono small">
                {failed[view.id] ? null : stamp !== null ? (
                  <>
                    {t.webcams.shotAt} <strong>{formatIslandTime(stamp)}</strong>
                    <span className="dim"> · {humanAge(now - stamp)}</span>
                  </>
                ) : site.stampedClock ? (
                  <span className="dim">{t.webcams.stampedClock}</span>
                ) : (
                  <span className="dim">
                    {t.webcams.downloadedAt} {formatIslandTime(nonce)}
                  </span>
                )}
              </p>
            </figure>
          )
        })}
      </div>

      {/* Vacía también la lista de fallidas: si no, una cámara que se cayó un
          momento se quedaría marcada como rota para siempre y el botón de
          actualizar no serviría justo cuando hace falta. */}
      <button
        className="link-btn"
        onClick={() => {
          setFailed({})
          setNonce(Date.now())
        }}
      >
        {t.webcams.reload} ↻
      </button>

      <table className="kv">
        <tbody>
          <tr>
            <td>{t.webcams.operator}</td>
            <td>{site.owner}</td>
          </tr>
          <tr>
            <td>{t.webcams.views}</td>
            <td className="mono">{site.views.length}</td>
          </tr>
          <tr>
            <td>{t.poi.coords}</td>
            <td className="mono">
              {n(site.lat, 5)}, {n(site.lon, 5)}
            </td>
          </tr>
        </tbody>
      </table>

      <button className="link-btn" onClick={() => onWeather(site.lon, site.lat, site.name)}>
        {t.poi.weatherHere} →
      </button>

      <p className="note small">
        {site.operator === 'cabildo' ? t.webcams.licenceCabildo : t.webcams.licenceThirdParty}
      </p>
    </>
  )
}
