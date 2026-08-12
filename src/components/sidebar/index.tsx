/**
 * Panel de control: armazón y nada más.
 *
 * Cada bloque vive en su propio archivo y se pliega por su cuenta
 * (`Section`). El panel va a seguir creciendo —ambiente, agricultura, aforos—
 * y la regla del repositorio es que crecer signifique un archivo nuevo, no una
 * columna más larga en este.
 */

import { useMemo, useState } from 'react'
import type { DisplayVariable, InterpolableVariable, Model } from '../../lib/interpolate'
import type { NetworkCensus } from '../../lib/quality'
import type { GazetteerEntry } from '../../lib/api'
import type { LayerVisibility } from '../MapView'
import type { RgbStop } from '../../lib/palette'
import { landShareAbove, type Dem } from '../../lib/dem'
import { t } from '../../i18n'

import { Section } from './Section'
import { PlaceSearch } from './PlaceSearch'
import { VariablePicker } from './VariablePicker'
import { LayerSwitches, LAYER_COUNT, activeLayerCount } from './LayerSwitches'
import { PlaceSwitches, PLACE_COUNT, activePlaceCount } from './PlaceSwitches'
import type { PlaceVisibility } from '../../hooks/usePlaces'
import { ModelStatus } from './ModelStatus'
import { WindStatus } from './WindStatus'
import type { WindState } from '../../hooks/useWindField'

interface Props {
  variable: DisplayVariable
  onVariable: (v: DisplayVariable) => void
  visible: LayerVisibility
  onToggle: (key: keyof LayerVisibility) => void
  places: PlaceVisibility
  onTogglePlace: (kind: keyof PlaceVisibility) => void
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  stops: RgbStop[]
  gazetteer: GazetteerEntry[]
  onSearch: (entry: GazetteerEntry) => void
  dem: Dem | null
  wind: WindState
  lastUpdate: number | null
  now: number
  onSources: () => void
}

export function Sidebar(props: Props) {
  const [open, setOpen] = useState(false)

  // El techo de la red se mueve con cada refresco (una estación alta que se
  // cae, una que vuelve), así que el porcentaje se recalcula con él. Recorrer
  // el DEM entero cuesta ~1,6 M de píxeles: memorizado por cota redondeada,
  // pasa de una vez cada cinco minutos a una vez por cambio real de techo.
  const ceiling = useMemo(() => {
    const tops = (['temperature', 'relativehumidity'] as const)
      .map((v) => props.models[v])
      .filter((m): m is Model => !!m && m.used.length > 0)
      .map((m) => m.elevationRange[1])
    return tops.length ? Math.round(Math.min(...tops)) : null
  }, [props.models])

  const shareAboveCeiling = useMemo(
    () => (props.dem && ceiling !== null ? landShareAbove(props.dem, ceiling) : null),
    [props.dem, ceiling],
  )

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

        <PlaceSearch
          gazetteer={props.gazetteer}
          onSelect={(entry) => {
            props.onSearch(entry)
            setOpen(false)
          }}
        />

        <Section title={t.variables.title} defaultOpen>
          <VariablePicker
            variable={props.variable}
            onVariable={props.onVariable}
            stops={props.stops}
          />
        </Section>

        <Section
          title={t.layers.title}
          defaultOpen
          badge={`${activeLayerCount(props.visible)}/${LAYER_COUNT}`}
        >
          <LayerSwitches visible={props.visible} onToggle={props.onToggle} />
        </Section>

        <Section
          title={t.places.title}
          badge={`${activePlaceCount(props.places)}/${PLACE_COUNT}`}
        >
          <PlaceSwitches visible={props.places} onToggle={props.onTogglePlace} />
        </Section>

        {/* Solo cuando la capa está encendida: si no, describiría con detalle
            algo que no se está viendo. */}
        {props.visible.wind && (
          <Section title="Viento" defaultOpen badge={`${props.wind.measuring}`}>
            <WindStatus
              wind={props.wind}
              usableStations={props.census?.usable ?? null}
              now={props.now}
            />
          </Section>
        )}

        <Section title={t.model.title} defaultOpen>
          <ModelStatus
            models={props.models}
            census={props.census}
            validation={props.validation}
            shareAboveCeiling={shareAboveCeiling}
            lastUpdate={props.lastUpdate}
            now={props.now}
          />
        </Section>

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
