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
import type { FireRiskState } from '../../hooks/useFireRisk'
import type { NetworkCensus, Station } from '../../lib/quality'
import type { SensorHealth } from '../../hooks/useSensorHealth'
import type { GazetteerEntry } from '../../lib/api'
import type { LayerVisibility } from '../MapView'
import { landShareAbove, type Dem } from '../../lib/dem'
import { t } from '../../i18n'

import type { SunEvents } from '../../lib/sky/sun-path'
import { Section } from './Section'
import { PlaceSearch } from './PlaceSearch'
import { VariablePicker } from './VariablePicker'
import { FireRisk } from './FireRisk'
import { Sky3D } from './Sky3D'
import { WindAnimation } from './WindAnimation'
import { SeaMotion } from './SeaMotion'
import { SunLight } from './sun'
import type { SkyPosition } from '../../lib/sun'
import type { SkyState } from '../../hooks/useSky'
import { LayerSwitches, LAYER_COUNT, activeLayerCount } from './LayerSwitches'
import { PlaceSwitches, PLACE_COUNT, activePlaceCount } from './PlaceSwitches'
import type { PlaceVisibility } from '../../hooks/usePlaces'
import { ModelStatus } from './ModelStatus'
import { NetworkHealth, faultyOf } from './NetworkHealth'
import { HiddenStations } from './HiddenStations'
import { WindStatus } from './WindStatus'
import { CounterStatus } from './CounterStatus'
import { WebcamStatus } from './WebcamStatus'
import { WEBCAM_SITES } from '../../lib/webcams/catalog'
import { GuaguaHint } from './GuaguaHint'
import { OsmRoadsHint } from './OsmRoadsHint'
import { TdtHint } from './TdtHint'
import { CloudSea } from './CloudSea'
import { RoqueStatus } from './RoqueStatus'
import { TrailAlerts } from './TrailAlerts'
import { AgroStatus } from './AgroStatus'
import { Co2Status } from './Co2Status'
import { CoverageStatus } from './CoverageStatus'
import { BasemapPicker } from './BasemapPicker'
import { Scene3D } from './Scene3D'
import { Ocean } from './Ocean'
import { OceanStatus } from './OceanStatus'
import type { OceanQuality } from '../../lib/ocean/quality'
import type { OceanData } from '../../hooks/useOcean'
import { VaporControls } from './VaporControls'
import type { VaporField } from '../../lib/vapor/field'
import type { Breath } from '../../lib/vapor/breath'
import { BASEMAPS, type BasemapId } from '../../lib/basemaps'
import { exaggerationLabel, type Exaggeration } from '../../lib/terrain'
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
  /** La capa experimental de incendios: su modelo y qué le falta. */
  fire: FireRiskState
  /** La escena atmosférica experimental: la rejilla del cielo y sus cifras. */
  sky: SkyState
  sky3dOn: boolean
  onSky3d: () => void
  /** La luz solar sobre el relieve: otra función experimental. */
  sunLight: {
    on: boolean
    shadows: boolean
    /** El disco del sol dibujado en el cielo. Ver `sky/SunLayer.ts`. */
    disc: boolean
    /** El camino que recorre el sol hoy. Ver `sky/SunPathLayer.ts`. */
    path: boolean
    sun: SkyPosition
    moon: SkyPosition | null
    moonPhase: number
    /** Orto, ocaso y mediodía de hoy, para escribirlos con hora y rumbo. */
    day: SunEvents
    /**
     * Hasta qué altura del cielo llega la pantalla con el fondo puesto. Negativo
     * con los fondos de GRAFCAN, donde la cámara solo se inclina 65° y el
     * horizonte no llega a entrar en cuadro.
     */
    ceilingDeg: number
    /**
     * Cuándo baja el sol, por la tarde, de ese techo. Es lo que permite decir a
     * qué hora vuelve a verse el disco en vez de dejar una casilla encendida que
     * no dibuja nada.
     */
    ceilingMs: number | null
  }
  onSunLight: () => void
  onSunShadows: () => void
  onSunDisc: () => void
  onSunPath: () => void
  /**
   * Poner la vista en condiciones de ver el cielo: 3D, fondo que deje inclinar,
   * luz real y cámara arriba. Lo ofrece el propio aviso del panel cuando algo
   * de eso falta, que es cuando la casilla está marcada y no dibuja nada.
   */
  onPrepareSky: () => void
  basemap: BasemapId
  onBasemap: (id: BasemapId) => void
  /** La vista 3D. No es una capa: cambia la cámara, no lo que se dibuja. */
  terrain: { on: boolean; exaggeration: Exaggeration }
  onTerrain: () => void
  onExaggeration: (x: Exaggeration) => void
  /** El mar. Tampoco es una capa: ver `MapView`. */
  ocean: { on: boolean; seamarks: boolean; depth: boolean; quality: OceanQuality }
  oceanData: OceanData
  onOcean: () => void
  onOceanSeamarks: () => void
  onOceanDepth: () => void
  onOceanQuality: (q: OceanQuality) => void
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
  /** Y para la cobertura de TDT, que se descarga y se decodifica a píxeles. */
  tdt: { loading: boolean; failed: boolean }
  deck: CloudDeck | null
  /** La respiración de la isla: el campo, la fase y el reloj acelerado. */
  vapor: {
    field: VaporField | null
    breath: Breath
    playing: boolean
    onPlay: () => void
    clock: Date
    progress: number
  }
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

  /**
   * La capa de incendio se está VIENDO, que no es lo mismo que estar elegida.
   *
   * El índice no tiene dibujo propio: sale por la malla interpolada, igual que
   * la temperatura. Con la malla apagada la casilla decía «encendida» sobre un
   * mapa donde no había ni un color de incendio.
   */
  const fireOn = props.variable === 'fire' && props.visible.grid

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

          {/*
            «Experimental» va DESPUÉS de las capas y no entre las variables, y
            plegada por defecto. Es la sección donde entrarán las funciones que
            todavía no se sostienen como el resto de la aplicación, y ponerla
            arriba las igualaría con lo que sí está medido.
          */}
          {/*
            El marcador dice cuántas de las funciones experimentales están
            encendidas, no cuántas hay. Antes decía «1» —el número de funciones—
            y con dos ya no significaba nada: lo que interesa saber sin abrir la
            sección es si hay algo experimental actuando sobre lo que se ve.
          */}
          <Section
            title={t.fireRisk.title}
            badge={`${
              (fireOn ? 1 : 0) +
              (props.sky3dOn ? 1 : 0) +
              (props.visible.wind ? 1 : 0) +
              (props.ocean.on ? 1 : 0) +
              (props.sunLight.on ||
              props.sunLight.shadows ||
              props.sunLight.disc ||
              props.sunLight.path
                ? 1
                : 0)
            }/5`}
          >
            <Sky3D sky={props.sky} on={props.sky3dOn} onToggle={props.onSky3d} />
            <hr className="sep" />
            <SunLight
              on={props.sunLight.on}
              onToggle={props.onSunLight}
              shadows={props.sunLight.shadows}
              onToggleShadows={props.onSunShadows}
              disc={props.sunLight.disc}
              onToggleDisc={props.onSunDisc}
              path={props.sunLight.path}
              onTogglePath={props.onSunPath}
              sun={props.sunLight.sun}
              moon={props.sunLight.moon}
              moonPhase={props.sunLight.moonPhase}
              day={props.sunLight.day}
              ceilingDeg={props.sunLight.ceilingDeg}
              ceilingMs={props.sunLight.ceilingMs}
              basemap={props.basemap}
              view3d={props.terrain.on}
              clouds={props.sky3dOn}
              onPrepareSky={props.onPrepareSky}
            />
            <hr className="sep" />
            <WindAnimation
              on={props.visible.wind}
              onToggle={() => props.onToggle('wind')}
              wind={props.wind}
            />
            <hr className="sep" />
            <SeaMotion
              on={props.ocean.on}
              onToggle={props.onOcean}
              basemap={props.basemap}
              quality={props.ocean.quality}
              onQuality={props.onOceanQuality}
              ready={
                !!props.oceanData.field &&
                !!props.oceanData.bathymetry &&
                !!props.oceanData.shoreline
              }
              loading={props.oceanData.loading}
              failed={props.oceanData.failed}
            />
            <hr className="sep" />
            <FireRisk
              fire={props.fire}
              active={fireOn}
              /*
                Encender pide la variable y `onVariable` se encarga de la malla;
                apagar devuelve a la temperatura y deja la malla encendida, que
                es lo que enseña el selector de arriba.

                El caso raro —variable de incendio elegida pero malla apagada a
                mano— cae del lado de encender, porque la casilla está sin
                marcar: hace lo que dice.
              */
              onActivate={() => props.onVariable(fireOn ? 'temperature' : 'fire')}
            />
          </Section>

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
            <TdtHint
              loading={props.tdt.loading}
              failed={props.tdt.failed}
              on={props.visible.tdt}
            />
          </Section>

          <Section
            title={t.places.title}
            badge={`${activePlaceCount(props.places)}/${PLACE_COUNT}`}
          >
            <PlaceSwitches visible={props.places} onToggle={props.onTogglePlace} />
          </Section>

          {/* Debajo de las capas porque es lo que hay debajo de las capas.
              El fondo y la vista 3D comparten pestaña a propósito: son la misma
              pregunta en dos mitades —de qué está hecha la superficie que se
              mira, y desde dónde se la mira— y en dos pestañas separadas la 3D
              quedaba escondida detrás de un título que nadie abría.

              Plegada, la pestaña dice las dos cosas: qué carta se está viendo
              y si la cámara está inclinada. Es la única forma de saber, sin
              abrirla, si lo que hay en pantalla es cálculo de casa o carta
              ajena, y si está en plano o en relieve. */}
          <Section
            title="Fondo y vista"
            badge={
              BASEMAPS[props.basemap].label +
              (props.terrain.on
                ? ` · 3D ${exaggerationLabel(props.terrain.exaggeration)}`
                : ' · plana')
            }
          >
            <BasemapPicker
              basemap={props.basemap}
              onBasemap={props.onBasemap}
              gridOn={props.visible.grid}
              onToggleGrid={() => props.onToggle('grid')}
            />
            <Scene3D
              basemap={props.basemap}
              on={props.terrain.on}
              onToggle={props.onTerrain}
              exaggeration={props.terrain.exaggeration}
              onExaggeration={props.onExaggeration}
              windOn={props.visible.wind}
            />
          </Section>

          {/* El mar va justo detrás del fondo y la vista, porque es la tercera
              mitad de la misma pregunta: de qué está hecha la superficie que se
              mira. Los otros dos dicen cómo se dibuja la tierra; este, cómo se
              dibuja el agua, que en una isla es casi toda la pantalla.

              Aquí quedan las CARTAS —balizamiento y profundidad, cartografía
              publicada por otros— y el estado del mar. El interruptor del mar
              simulado se ha ido a «Experimental»: dibuja una superficie
              calculada, no una carta, y esa diferencia se pierde si comparte
              lista con dos capas que sí son dato ajeno.

              Plegada, la pestaña sigue diciendo la altura de ola de ahora
              mismo: es lo único de esta sección que hace falta saber sin
              abrirla, y se mide esté el mar dibujado o no. */}
          <Section
            title="Océano"
            badge={
              props.ocean.on
                ? props.oceanData.marine.length
                  ? `${props.oceanData.marine[0].significantHeightM.toFixed(1).replace('.', ',')} m`
                  : '…'
                : undefined
            }
          >
            <Ocean
              seamarks={props.ocean.seamarks}
              onSeamarks={props.onOceanSeamarks}
              depth={props.ocean.depth}
              onDepth={props.onOceanDepth}
              seaOn={props.ocean.on}
            />
            {props.ocean.on && props.oceanData.marine.length > 0 && (
              <OceanStatus
                ocean={props.oceanData}
                here={
                  props.here
                    ? { lon: props.here.lon, lat: props.here.lat, label: props.here.label }
                    : null
                }
                now={props.now}
              />
            )}
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

          {props.visible.webcams && (
            <Section title={t.layers.webcams} defaultOpen badge={`${WEBCAM_SITES.length}`}>
              <WebcamStatus />
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

          {/* Va pegada al mar de nubes a propósito: son el mismo fenómeno por
              sus dos extremos. Lo que sube de las laderas es lo que acaba
              siendo la manta, y el techo de esta capa es la base de aquella. */}
          <Section
            title="La isla respira"
            badge={props.vapor.breath.phase === 'up' ? 'inspira' : 'espira'}
          >
            <VaporControls
              on={props.visible.vapor}
              onToggle={() => props.onToggle('vapor')}
              terrainOn={props.terrain.on}
              field={props.vapor.field}
              breath={props.vapor.breath}
              playing={props.vapor.playing}
              onPlay={props.vapor.onPlay}
              clock={props.vapor.clock}
              progress={props.vapor.progress}
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
