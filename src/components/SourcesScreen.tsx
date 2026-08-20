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
    title: t.sources.countersTitle,
    body: t.sources.countersBody,
    license: t.sources.countersLicense,
    href: 'https://lapalmasmart-open.lapalma.es/datosabiertos/catalogo/',
    hrefLabel: 'Catálogo de datos abiertos',
  },
  {
    title: t.sources.roqueTitle,
    body: t.sources.roqueBody,
    license: t.sources.roqueLicense,
    href: 'https://tngweb.tng.iac.es/weather/current/',
    hrefLabel: 'tngweb.tng.iac.es',
  },
  {
    title: t.sources.agroTitle,
    body: t.sources.agroBody,
    license: t.sources.agroLicense,
    href: 'https://www.opendatalapalma.es',
    hrefLabel: 'Visor ArcGIS del Cabildo',
  },
  {
    title: t.sources.trailsAlertsTitle,
    body: t.sources.trailsAlertsBody,
    license: t.sources.trailsAlertsLicense,
    href: 'https://www.senderosdelapalma.es/senderos/estado-de-los-senderos/',
    hrefLabel: 'Estado de los senderos (Cabildo)',
  },
  {
    title: t.sources.tdtTitle,
    body: t.sources.tdtBody,
    license: t.sources.tdtLicense,
    href: 'https://www.opendatalapalma.es/datasets/television-digital-terrestre-kml',
    hrefLabel: 'Televisión digital terrestre (visor del Cabildo)',
  },
  {
    title: t.sources.viarioTitle,
    body: t.sources.viarioBody,
    license: t.sources.viarioLicense,
    href: 'https://www.openstreetmap.org/copyright',
    hrefLabel: 'openstreetmap.org/copyright',
  },
  {
    title: t.sources.toponymsTitle,
    body: t.sources.toponymsBody,
    license: t.sources.toponymsLicense,
    href: 'https://www.openstreetmap.org/copyright',
    hrefLabel: 'openstreetmap.org/copyright',
  },
  {
    title: t.sources.oceanTitle,
    body: t.sources.oceanBody,
    license: t.sources.oceanLicense,
    href: 'https://open-meteo.com/en/docs/marine-weather-api',
    hrefLabel: 'open-meteo.com · Marine Weather API',
  },
  {
    title: t.sources.bathymetryTitle,
    body: t.sources.bathymetryBody,
    license: t.sources.bathymetryLicense,
    href: 'https://emodnet.ec.europa.eu/en/bathymetry',
    hrefLabel: 'emodnet.ec.europa.eu/bathymetry',
  },
  {
    title: t.sources.seamarksTitle,
    body: t.sources.seamarksBody,
    license: t.sources.seamarksLicense,
    href: 'https://www.openseamap.org',
    hrefLabel: 'openseamap.org',
  },
  {
    title: t.sources.starsTitle,
    body: t.sources.starsBody,
    license: t.sources.starsLicense,
    href: 'https://codeberg.org/astronexus/hyg',
    hrefLabel: 'codeberg.org/astronexus/hyg',
  },
  {
    title: t.sources.figuresTitle,
    body: t.sources.figuresBody,
    license: t.sources.figuresLicense,
    href: 'https://github.com/ofrohn/d3-celestial',
    hrefLabel: 'github.com/ofrohn/d3-celestial',
  },
  {
    title: t.sources.milkyWayTitle,
    body: t.sources.milkyWayBody,
    license: t.sources.milkyWayLicense,
    href: 'https://github.com/ofrohn/d3-celestial',
    hrefLabel: 'github.com/ofrohn/d3-celestial',
  },
  {
    title: t.sources.ephemerisTitle,
    body: t.sources.ephemerisBody,
    license: t.sources.ephemerisLicense,
    href: 'https://github.com/cosinekitty/astronomy',
    hrefLabel: 'github.com/cosinekitty/astronomy',
  },
  {
    title: t.sources.demTitle,
    body: t.sources.demBody,
    license: t.sources.demLicense,
    href: 'https://registry.opendata.aws/terrain-tiles/',
    hrefLabel: 'registry.opendata.aws/terrain-tiles',
  },
  {
    title: t.sources.fireTitle,
    body: t.sources.fireBody,
    license: t.sources.fireLicense,
    href: 'https://forest-fire.emergency.copernicus.eu/',
    hrefLabel: 'forest-fire.emergency.copernicus.eu',
  },
  {
    title: t.sources.codeTitle,
    body: t.sources.codeBody,
    license: 'Apache-2.0',
    href: 'https://github.com/andreapianidev/tiempo-palmero',
    hrefLabel: 'github.com/andreapianidev/tiempo-palmero',
  },
  {
    title: t.sources.noTrackingTitle,
    body: t.sources.noTrackingBody,
  },
  {
    title: t.sources.storageTitle,
    body: t.sources.storageBody,
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
