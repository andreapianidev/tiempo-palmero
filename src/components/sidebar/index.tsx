/**
 * Panel de control: armazón y nada más.
 *
 * Cada bloque vive en su propio archivo y se pliega por su cuenta
 * (`Section`). El panel va a seguir creciendo —ambiente, agricultura, aforos—
 * y la regla del repositorio es que crecer signifique un archivo nuevo, no una
 * columna más larga en este.
 */

import { useMemo, useState } from 'react'
import type { InterpolableVariable, Model } from '../../lib/interpolate'
import type { MapVariable } from '../../lib/variables'
import type { Co2Field } from '../../lib/co2/field'
import type { CoverageState } from '../../hooks/useCoverage'
import type { NetworkCensus, Station } from '../../lib/quality'
import type { SensorHealth } from '../../hooks/useSensorHealth'
import type { GazetteerEntry } from '../../lib/api'
import type { LayerVisibility } from '../MapView'
import { landShareAbove, type Dem } from '../../lib/dem'
import { t } from '../../i18n'

import { Section } from './Section'
import { PlaceSearch } from './PlaceSearch'
import { VariablePicker } from './VariablePicker'
import { LayerSwitches, LAYER_COUNT, activeLayerCount } from './LayerSwitches'
import { PlaceSwitches, PLACE_COUNT, activePlaceCount } from './PlaceSwitches'
import type { PlaceVisibility } from '../../hooks/usePlaces'
import { ModelStatus } from './ModelStatus'
import { NetworkHealth, faultyOf } from './NetworkHealth'
import { HiddenStations } from './HiddenStations'
import { WindStatus } from './WindStatus'
import { CounterStatus } from './CounterStatus'
import { GuaguaHint } from './GuaguaHint'
import { OsmRoadsHint } from './OsmRoadsHint'
import { CloudSea } from './CloudSea'
import { RoqueStatus } from './RoqueStatus'
import { TrailAlerts } from './TrailAlerts'
import { AgroStatus } from './AgroStatus'
import { Co2Status } from './Co2Status'
import { CoverageStatus } from './CoverageStatus'
import { BasemapPicker } from './BasemapPicker'
import { BASEMAPS, type BasemapId } from '../../lib/basemaps'
import type { WindState } from '../../hooks/useWindField'
import type { CountersData } from '../../hooks/useCounters'
import type { AgroState } from '../../hooks/useAgro'
import type { RoqueStatus as RoqueData } from '../../lib/roque'
import type { SummitLayer } from '../../lib/summit'
import type { TrailReport } from '../../lib/trails/alerts'
import { zoneAt, type CloudDeck } from '../../lib/clouds'

interface Props {
  variable: MapVariable
  onVariable: (v: MapVariable) => void
  /** El campo de CO₂ que sostiene el mapa, o `null` si la red no da para uno. */
  co2Field: Co2Field | null
  /** El sondeo de cobertura de 2013. Solo se descarga si se elige. */
  coverage: CoverageState
  basemap: BasemapId
  onBasemap: (id: BasemapId) => void
  visible: LayerVisibility
  onToggle: (key: keyof LayerVisibility) => void
  places: PlaceVisibility
  onTogglePlace: (kind: keyof PlaceVisibility) => void
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  health: SensorHealth
  /** Todas las del mapa, averiadas incluidas: el bloque de salud las nombra. */
  stations: Station[]
  validation: { rmse: number; mae: number; n: number } | null
  gazetteer: GazetteerEntry[]
  onSearch: (entry: GazetteerEntry) => void
  dem: Dem | null
  wind: WindState
  counters: CountersData
  /** Estado de la red de guaguas: descarga en curso y zoom alcanzado. */
  guagua: { loading: boolean; stopsZoomReached: boolean }
  /** Lo mismo para el viario de OSM, que además puede fallar al descargarse. */
  viario: { loading: boolean; failed: boolean; tracksZoomReached: boolean }
  deck: CloudDeck | null
  roque: RoqueData | null
  /** La vertical medida entre el techo de la red y la cumbre. Ver `summit.ts`. */
  summitLayer: SummitLayer | null
  agro: AgroState
  trailReports: TrailReport[]
  /** Punto elegido en el mapa. Lo usan el mar de nubes y la agricultura. */
  here: { lon: number; lat: number; elevationM: number; label: string | null } | null
  onSectionToggle: (key: 'roque' | 'agro' | 'trails', open: boolean) => void
  lastUpdate: number | null
  now: number
  onSources: () => void
  /**
   * Desplegado o no, mandado desde fuera.
   *
   * En el escritorio no se pasa y el panel se abre solo, con su propio botón:
   * es una columna fija y «abierto» no significa nada. En el móvil es una hoja
   * que tapa el mapa entero y quien la abre es un botón redondo que vive en
   * otro componente, así que el estado tiene que estar por encima de los dos.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Sidebar(props: Props) {
  const [selfOpen, setSelfOpen] = useState(false)
  const open = props.open ?? selfOpen
  const setOpen = (next: boolean) => (props.onOpenChange ?? setSelfOpen)(next)

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

  const faultyCount = useMemo(
    () => faultyOf(props.health, props.stations).length,
    [props.health, props.stations],
  )

  const shareAboveCeiling = useMemo(
    () => (props.dem && ceiling !== null ? landShareAbove(props.dem, ceiling) : null),
    [props.dem, ceiling],
  )

  return (
    <>
      {/* Lo que queda fuera de la hoja se toca para cerrarla. Solo se ve en el
          móvil —en el escritorio el panel es una columna y no tapa nada—, y sin
          él la única salida era acertar en la × de la esquina.

          Va FUERA del panel a propósito: dentro, su `position: fixed` se mide
          contra el panel (que está desplazado con `transform`) en vez de contra
          la pantalla, y el velo se quedaba justo debajo de la hoja, que es el
          único sitio donde no hace falta. */}
      <button
        className={`sidebar-scrim${open ? ' open' : ''}`}
        tabIndex={-1}
        aria-hidden
        onClick={() => setOpen(false)}
      />

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setOpen(!open)}
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
              gridOn={props.visible.grid}
              onToggleGrid={() => props.onToggle('grid')}
            />
          </Section>

          {/* Solo con el CO₂ elegido: es el único sitio donde hace falta contar
              de qué red sale el color y hasta dónde llega. */}
          {props.variable === 'co2' && (
            <Section
              title={t.variables.co2}
              defaultOpen
              badge={props.co2Field ? `${props.co2Field.nodes.length}` : '—'}
            >
              <Co2Status field={props.co2Field} now={props.now} />
            </Section>
          )}

          {props.variable === 'coverage' && (
            <Section
              title={t.variables.coverage}
              defaultOpen
              badge={props.coverage.field ? `${props.coverage.field.count}` : '…'}
            >
              <CoverageStatus state={props.coverage} />
            </Section>
          )}

          <Section
            title={t.layers.title}
            defaultOpen
            badge={`${activeLayerCount(props.visible)}/${LAYER_COUNT}`}
          >
            <LayerSwitches visible={props.visible} onToggle={props.onToggle} />
            <GuaguaHint
              loading={props.guagua.loading}
              stopsZoomReached={props.guagua.stopsZoomReached}
              on={props.visible.guagua}
            />
            <OsmRoadsHint
              loading={props.viario.loading}
              failed={props.viario.failed}
              tracksZoomReached={props.viario.tracksZoomReached}
              on={props.visible.osmRoads}
            />
          </Section>

          <Section
            title={t.places.title}
            badge={`${activePlaceCount(props.places)}/${PLACE_COUNT}`}
          >
            <PlaceSwitches visible={props.places} onToggle={props.onTogglePlace} />
          </Section>

          {/* Debajo de las capas porque es lo que hay debajo de las capas. La
              pestaña dice cuál está puesto: plegada, es la única forma de saber
              si lo que se está viendo es cálculo de casa o carta ajena. */}
          <Section title="Fondo del mapa" badge={BASEMAPS[props.basemap].label}>
            <BasemapPicker
              basemap={props.basemap}
              onBasemap={props.onBasemap}
              gridOn={props.visible.grid}
              onToggleGrid={() => props.onToggle('grid')}
            />
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

          {props.visible.counters && (
            <Section
              title={t.layers.counters}
              defaultOpen
              badge={props.counters.census ? `${props.counters.census.liveSites}` : '…'}
            >
              <CounterStatus
                census={props.counters.census}
                loading={props.counters.loading}
                error={props.counters.error}
              />
            </Section>
          )}

          {/* El mar de nubes va justo detrás del viento porque es la otra cosa
              que decide si merece la pena subir hoy. No cuesta ninguna petición:
              sale de los perfiles que el motor ya descarga. */}
          <Section
            title="Mar de nubes"
            badge={props.deck?.present ? `${Math.round(props.deck.base)} m` : undefined}
          >
            <CloudSea
              deck={props.deck}
              hereM={props.here?.elevationM ?? null}
              hereLabel={props.here?.label ?? null}
              now={props.now}
            />
          </Section>

          <Section
            title="Roque de los Muchachos"
            badge="2.387 m"
            onOpenChange={(open) => props.onSectionToggle('roque', open)}
          >
            <RoqueStatus
              status={props.roque}
              aboveDeck={
                props.deck ? zoneAt(props.deck, 2387) === 'above' : null
              }
              layer={props.summitLayer}
              now={props.now}
            />
          </Section>

          <Section
            title="Senderos"
            badge={
              props.trailReports.length
                ? `${props.trailReports.filter((r) => r.worst).length}/${props.trailReports.length}`
                : undefined
            }
            onOpenChange={(open) => props.onSectionToggle('trails', open)}
          >
            <TrailAlerts reports={props.trailReports} />
          </Section>

          <Section
            title="Agricultura"
            onOpenChange={(open) => props.onSectionToggle('agro', open)}
          >
            <AgroStatus agro={props.agro} here={props.here} />
          </Section>

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

          {/* Se abre solo si hay algo que contar. Un bloque de averías abierto
              para decir que no hay ninguna es ruido en el sitio de un aviso. */}
          <Section
            title={t.health.title}
            defaultOpen={faultyCount > 0}
            badge={faultyCount > 0 ? `⚠ ${faultyCount}` : '✓'}
          >
            <NetworkHealth health={props.health} stations={props.stations} />
          </Section>

          {props.census && props.census.dropped.length > 0 && (
            <Section title={t.hidden.title} badge={`${props.census.dropped.length}`}>
              <HiddenStations census={props.census} />
            </Section>
          )}

          <footer className="side-footer">
            <button className="link-btn" onClick={props.onSources}>
              {t.sources.open} →
            </button>
            <p className="dim small">{t.point.tapHint}</p>
          </footer>
        </div>
      </aside>
    </>
  )
}
