/**
 * Panel de control: variable activa, capas, buscador de topónimos y estado del
 * modelo.
 *
 * El bloque de estado es la parte que no se puede quitar. Enseña el
 * denominador honesto —«X de 52 estaciones activas», no «52 estaciones»—, el
 * gradiente REAL medido ahora mismo, el R² del ajuste y el RMSE de validación.
 */

import { useMemo, useState } from 'react'
import type { DisplayVariable, InterpolableVariable, Model } from '../lib/interpolate'
import type { NetworkCensus } from '../lib/quality'
import type { GazetteerEntry } from '../lib/api'
import type { LayerVisibility } from './MapView'
import { rampCss, type RgbStop } from '../lib/palette'
import { n, n0, t, humanAge } from '../i18n'

interface Props {
  variable: DisplayVariable
  onVariable: (v: DisplayVariable) => void
  visible: LayerVisibility
  onToggle: (key: keyof LayerVisibility) => void
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  stops: RgbStop[]
  gazetteer: GazetteerEntry[]
  onSearch: (entry: GazetteerEntry) => void
  lastUpdate: number | null
  now: number
  onSources: () => void
}

const VARIABLES: { id: DisplayVariable; label: string; derived?: boolean }[] = [
  { id: 'temperature', label: t.variables.temperature },
  { id: 'relativehumidity', label: t.variables.relativehumidity },
  { id: 'dewpoint', label: t.variables.dewpoint, derived: true },
]

const LAYERS: { id: keyof LayerVisibility; label: string }[] = [
  { id: 'grid', label: t.layers.grid },
  { id: 'stations', label: t.layers.stations },
  { id: 'air', label: t.layers.air },
  { id: 'co2', label: t.layers.co2 },
  { id: 'sky', label: t.layers.sky },
  { id: 'trails', label: t.layers.trails },
  { id: 'fire', label: t.layers.fire },
]

/** Normaliza acentos para que «Garafia» encuentre «Garafía». */
const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Sidebar(props: Props) {
  const { models, census, validation, stops } = props
  // El bloque de estado describe SIEMPRE el ajuste de temperatura: es el que
  // marca el gradiente de la isla y el que valida el RMSE. Enseñar el ajuste de
  // la humedad bajo la etiqueta «gradiente medido» confundiría dos cosas.
  const model = models.temperature
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = fold(query.trim())
    if (q.length < 2) return []
    return props.gazetteer
      .filter((e) => fold(e.name).includes(q))
      .slice(0, 8)
  }, [query, props.gazetteer])

  const lapsePerKm = model ? -model.b * 1000 : null

  // Dos relojes distintos, y la diferencia importa: se puede haber consultado
  // hace 10 segundos una red cuya lectura más reciente es de hace hora y media.
  const newestObservation = model?.used.length
    ? Math.max(...model.used.map((u) => u.observedAt))
    : null

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? '×' : '≡'}
      </button>

      <div className="sidebar-scroll">
        <header className="brand">
          <h1>{t.app.name}</h1>
          <p className="mono dim">{t.app.subtitle}</p>
        </header>

        <div className="search">
          <input
            type="search"
            value={query}
            placeholder={t.point.searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.point.searchPlaceholder}
          />
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((r) => (
                <li key={`${r.name}-${r.lon}-${r.lat}`}>
                  <button
                    onClick={() => {
                      props.onSearch(r)
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    <span>{r.name}</span>
                    <em className="dim">{r.municipality}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && results.length === 0 && (
            <p className="dim small pad">{t.point.noResults}</p>
          )}
        </div>

        <section className="block">
          <h2 className="lbl">{t.variables.title}</h2>
          <div className="chips">
            {VARIABLES.map((v) => (
              <button
                key={v.id}
                className="chip-btn"
                aria-pressed={props.variable === v.id}
                onClick={() => props.onVariable(v.id)}
                title={v.derived ? t.variables.derivedHint : undefined}
              >
                {v.label}
                {v.derived && <em className="derived-mark" aria-hidden> ƒ</em>}
              </button>
            ))}
          </div>
          <div className="ramp" style={{ background: rampCss(stops) }} />
          <div className="ramp-ends mono dim">
            <span>
              {n0(stops[0][0])}
              {props.variable === 'relativehumidity' ? ' %' : ' °C'}
            </span>
            <span>
              {n0(stops[stops.length - 1][0])}
              {props.variable === 'relativehumidity' ? ' %' : ' °C'}
            </span>
          </div>
        </section>

        <section className="block">
          <h2 className="lbl">{t.layers.title}</h2>
          <ul className="switches">
            {LAYERS.map((l) => (
              <li key={l.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={props.visible[l.id]}
                    onChange={() => props.onToggle(l.id)}
                  />
                  <span>{l.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="block status">
          <h2 className="lbl">{t.model.title}</h2>
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

          <details className="explain">
            <summary>{t.model.explainTitle}</summary>
            <p className="small">{t.model.explain}</p>
          </details>
        </section>

        <footer className="side-footer">
          <button className="link-btn" onClick={props.onSources}>
            {t.sources.open} →
          </button>
          <p className="dim small">{t.point.tapHint}</p>
        </footer>
      </div>
    </aside>
  )
}
