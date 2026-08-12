/**
 * Pantalla «Fuentes de datos». Cada dato que sale en la app aparece aquí con
 * su origen y su licencia.
 */

import { t } from '../i18n'

interface Props {
  onClose: () => void
}

interface Entry {
  title: string
  body: string
  license?: string
  href?: string
  hrefLabel?: string
}

const ENTRIES: Entry[] = [
  {
    title: t.sources.dataTitle,
    body: t.sources.dataBody,
    license: t.sources.dataLicense,
    href: 'https://www.opendatalapalma.es',
    hrefLabel: 'opendatalapalma.es',
  },
  {
    title: t.sources.boundariesTitle,
    body: t.sources.boundariesBody,
    license: t.sources.boundariesLicense,
    href: 'https://lapalmasmart-open.lapalma.es/datosabiertos/catalogo/',
    hrefLabel: 'Catálogo de datos abiertos',
  },
  {
    title: t.sources.co2Title,
    body: t.sources.co2Body,
    href: 'https://www.cabildodelapalma.es/',
    hrefLabel: 'Cabildo Insular de La Palma',
  },
  {
    title: t.sources.anchorsTitle,
    body: t.sources.anchorsBody,
    license: t.sources.anchorsLicense,
    href: 'https://open-meteo.com/',
    hrefLabel: 'open-meteo.com',
  },
  {
    title: t.sources.guaguaTitle,
    body: t.sources.guaguaBody,
    license: t.sources.guaguaLicense,
    href: 'https://www.tilp.es/',
    hrefLabel: 'tilp.es',
  },
  {
    title: t.sources.placesTitle,
    body: t.sources.placesBody,
    license: t.sources.placesLicense,
    href: 'https://www.opendatalapalma.es/search?groupIds=c27000c1d7a84444bf4321b87e8d2223',
    hrefLabel: 'Catálogo del Cabildo en opendatalapalma.es',
  },
  {
    title: t.sources.toponymsTitle,
    body: t.sources.toponymsBody,
    license: t.sources.toponymsLicense,
    href: 'https://www.openstreetmap.org/copyright',
    hrefLabel: 'openstreetmap.org/copyright',
  },
  {
    title: t.sources.demTitle,
    body: t.sources.demBody,
    license: t.sources.demLicense,
    href: 'https://registry.opendata.aws/terrain-tiles/',
    hrefLabel: 'registry.opendata.aws/terrain-tiles',
  },
  {
    title: t.sources.codeTitle,
    body: t.sources.codeBody,
    license: 'MIT',
    href: 'https://github.com/andreapianidev/tiempo-palmero',
    hrefLabel: 'github.com/andreapianidev/tiempo-palmero',
  },
  {
    title: t.sources.noTrackingTitle,
    body: t.sources.noTrackingBody,
  },
]

export function SourcesScreen({ onClose }: Props) {
  return (
    <div className="sources-screen" role="dialog" aria-label={t.sources.title}>
      <div className="sources-inner">
        <header>
          <h2>{t.sources.title}</h2>
          <button className="panel-close" onClick={onClose} aria-label={t.point.close}>
            ×
          </button>
        </header>
        <p className="dim">{t.sources.intro}</p>

        <ul className="sources-list">
          {ENTRIES.map((e) => (
            <li key={e.title}>
              <h3>
                {e.title}
                {e.license && <span className="license">{e.license}</span>}
              </h3>
              <p>{e.body}</p>
              {e.href && (
                <a href={e.href} target="_blank" rel="noreferrer">
                  {e.hrefLabel ?? e.href} →
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
