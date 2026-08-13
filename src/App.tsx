import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapView, type LayerVisibility, type MapHandle } from './components/MapView'
import { PointPanel, type ProbePoint } from './components/PointPanel'
import { DetailPanel, type Selection } from './components/DetailPanel'
import { Sidebar } from './components/sidebar'
import { SourcesScreen } from './components/SourcesScreen'
import { MobileShell } from './components/mobile/MobileShell'
import { buildStatus } from './components/mobile/status'
import { useIsMobile } from './hooks/useIsMobile'
import { useGeolocation, type GeoFix } from './hooks/useGeolocation'
import { useIslandData, municipalityOf } from './hooks/useIslandData'
import { useWindField } from './hooks/useWindField'
import { useGuagua } from './hooks/useGuagua'
import { usePlaces, NO_PLACES, type PlaceVisibility } from './hooks/usePlaces'
import { useCounters } from './hooks/useCounters'
import { useAgro } from './hooks/useAgro'
import { useTrailReports } from './hooks/useTrailReports'
import { summarizeDeck } from './lib/clouds'
import { elevationAt } from './lib/dem'
import { VARIABLES, isBundleVariable, type MapVariable } from './lib/variables'
import { buildCo2Field } from './lib/co2/field'
import { useCoverage } from './hooks/useCoverage'
import type { DisplayVariable } from './lib/interpolate'
import type { GazetteerEntry } from './lib/api'
import type { BasemapId } from './lib/basemaps'
import { warmNearbyLayers } from './lib/nearby'
import { t } from './i18n'

const INITIAL_LAYERS: LayerVisibility = {
  grid: true,
  stations: true,
  air: false,
  co2: true,
  sky: false,
  trails: false,
  guagua: false,
  roads: false,
  counters: false,
  fire: true,
  wind: false,
}

export default function App() {
  const data = useIslandData()

  /**
   * Las averiadas, como conjunto de ids.
   *
   * Se calcula una sola vez aquí en vez de en cada panel: la reconstrucción del
   * pasado las excluye por la misma razón por la que el modelo de ahora las
   * excluye, y conviene que las dos exclusiones salgan de la misma línea.
   */
  const faultyIds = useMemo(
    () =>
      new Set(
        [...data.health.diagnoses.values()].filter((d) => d.faulty).map((d) => d.entityId),
      ),
    [data.health.diagnoses],
  )
  // El viento se calcula siempre, esté la capa encendida o no: el panel enseña
  // cuántas estaciones lo miden aunque el mapa no lo dibuje, y el coste es una
  // petición al modelo cada refresco.
  const wind = useWindField(data.dem, data.stations, data.lastUpdate)
  const [visible, setVisible] = useState<LayerVisibility>(INITIAL_LAYERS)
  // Al revés que el viento: la red de guaguas son 1,5 MB y no alimenta ningún
  // cálculo, así que no se pide hasta que alguien enciende la capa.
  const guagua = useGuagua(visible.guagua)
  // Los sitios se encienden uno a uno; la capa del mapa está siempre viva y lo
  // que cambia es qué puntos entran en ella.
  const [placesOn, setPlacesOn] = useState<PlaceVisibility>(NO_PLACES)
  const places = usePlaces(placesOn, visible.roads)
  // Igual que las guaguas: tres peticiones al servicio del Cabildo que no se
  // hacen mientras el interruptor esté apagado.
  const counters = useCounters(visible.counters)
  const [variable, setVariable] = useState<MapVariable>('temperature')
  // El fondo de casa es el de arranque, y a propósito: es el único que no
  // depende de un servicio ajeno para que la isla aparezca en pantalla.
  const [basemap, setBasemap] = useState<BasemapId>('relieve')
  const [probe, setProbe] = useState<ProbePoint | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [showSources, setShowSources] = useState(false)
  /**
   * La pantalla es estrecha, así que manda la hoja y no la barra lateral.
   *
   * Es lo ÚNICO que cambia entre las dos versiones: el mapa, el motor, las
   * fichas y las capas son exactamente los mismos objetos. Lo que cambia es
   * dónde se cuelgan.
   */
  const isMobile = useIsMobile()
  /** El panel de capas del móvil, que allí es una hoja y no una columna. */
  const [layersOpen, setLayersOpen] = useState(false)
  const mapHandle = useRef<MapHandle | null>(null)
  /**
   * El punto lo puso el arranque al preguntar la ubicación, no un dedo.
   *
   * Con esto la hoja se queda asomando: quien abre la app ve la isla entera y
   * una línea abajo con la temperatura de donde está. Un toque en el mapa sí
   * la sube a media pantalla, porque ahí sí se ha preguntado algo.
   */
  const [autoProbe, setAutoProbe] = useState(false)
  // Si el zoom da ya para ver las paradas. Lo dice el mapa al cruzar el umbral,
  // no en cada fotograma: es lo único que hace falta saber del zoom aquí.
  const [stopsZoomReached, setStopsZoomReached] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /**
   * Qué secciones accesorias ha abierto el usuario. Las que cuestan no se
   * calculan ni se descargan mientras estén plegadas: la ETo es una petición
   * más al modelo y recorrer 49 senderos cuesta una cuarta parte de lo que
   * cuesta la malla.
   *
   * El Roque ya NO está entre ellas. Se pedía solo al abrir la sección para no
   * martillear a un observatorio ajeno, pero desde que su termómetro entra en
   * el motor (ver `summit.ts`) esa lectura la necesita el mapa entero, así que
   * la trae `useIslandData` y aquí solo queda el estado de plegado.
   */
  const [openSections, setOpenSections] = useState({
    roque: false,
    agro: false,
    trails: false,
  })

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Las capas de «cerca de aquí» se piden en cuanto el mapa está en pie, no al
  // arrancar: así el primer clic no espera, pero tampoco retrasan la pintura.
  useEffect(() => {
    if (!data.dem) return
    const id = setTimeout(warmNearbyLayers, 1500)
    return () => clearTimeout(id)
  }, [data.dem])

  /**
   * La variable higrotérmica en juego. Con el CO₂ elegido no hay ninguna, y en
   * su lugar va la temperatura: los pines de estación y la ficha de punto
   * siguen hablando del tiempo, que es lo que esas estaciones miden.
   */
  const bundleVariable: DisplayVariable = isBundleVariable(variable)
    ? variable
    : 'temperature'
  const stops = VARIABLES[bundleVariable].stops

  /**
   * El campo de CO₂ se construye UNA vez y lo comparten mapa y panel. Si cada
   * uno lo armara por su cuenta, el panel podría estar contando 187 sensores
   * mientras el mapa pinta otros tantos.
   */
  const co2Field = useMemo(() => buildCo2Field(data.co2), [data.co2])

  // El sondeo de cobertura son 105 KB de 2013 que no alimentan nada más: solo
  // se piden si alguien elige esa variable.
  const coverage = useCoverage(variable === 'coverage')

  /**
   * Qué campo enmascarado toca pintar. Uno como mucho: son variables, y solo
   * hay una elegida. Que el mapa reciba «el campo» y no «el campo de CO₂ más
   * el de cobertura más el siguiente» es lo que evita que añadir el tercero
   * signifique tocar `MapView` otra vez.
   */
  const maskedField =
    variable === 'co2'
      ? (co2Field?.field ?? null)
      : variable === 'coverage'
        ? (coverage.field?.field ?? null)
        : null

  /**
   * El mar de nubes NO cuesta una petición: sale de los perfiles verticales
   * que el motor ya descarga para anclar las cotas altas. Lo único que hacía
   * falta era pedirle a la misma llamada la nubosidad baja, que es lo que
   * separa una inversión con manta de una inversión seca.
   */
  const deck = useMemo(
    () => summarizeDeck(data.anchors.map((a) => a.profile)),
    [data.anchors],
  )

  // La cumbre ya no se pide aquí: desde que entra en el motor la trae
  // `useIslandData`, y el panel enseña exactamente la misma lectura que el mapa
  // está usando. Dos peticiones al TNG podrían contestar dos horas distintas.
  const roque = data.roque
  const agro = useAgro(data.dem, openSections.agro)
  const trailReports = useTrailReports(
    data.trails,
    data.dem,
    data.models,
    wind.field,
    data.municipalities,
    deck,
    openSections.trails,
  )

  /**
   * Los avisos, indexados por sendero, para que el mapa pinte lo mismo que
   * dice la lista. Se calcula aquí y no en `MapView` porque el panel y el mapa
   * tienen que estar mirando exactamente el mismo objeto.
   */
  const trailSeverity = useMemo(() => {
    const out: Record<number, 'warning' | 'notice'> = {}
    for (const r of trailReports) if (r.worst) out[r.profile.trail.id] = r.worst
    return out
  }, [trailReports])

  const pick = useCallback(
    (lon: number, lat: number, label?: string) => {
      setSelection(null)
      setAutoProbe(false)
      setProbe({
        lon,
        lat,
        elevation: data.dem ? elevationAt(data.dem, lon, lat) : null,
        municipality: municipalityOf(data.municipalities, lon, lat),
        label,
      })
    },
    [data.dem, data.municipalities],
  )

  const onSearch = useCallback(
    (entry: GazetteerEntry) => pick(entry.lon, entry.lat, entry.name),
    [pick],
  )

  const toggle = useCallback((key: keyof LayerVisibility) => {
    setVisible((v) => ({ ...v, [key]: !v[key] }))
  }, [])

  /**
   * Qué se hace con la ubicación cuando el navegador la da.
   *
   * Del arranque llega `auto: true` y entonces NO se vuela: la vista de llegada
   * es la isla entera, y acercarse antes de que a nadie le haya dado tiempo a
   * mirarla es quitarle a la app lo primero que enseña. Con el botón sí, porque
   * ahí sí se ha pedido ir hasta allí.
   */
  const onFix = useCallback(
    ({ lon, lat, auto }: GeoFix) => {
      pick(lon, lat, t.mobile.locate)
      if (auto) setAutoProbe(true)
      else mapHandle.current?.flyTo(lon, lat)
    },
    [pick],
  )

  // Solo en el móvil, y solo cuando hay DEM y modelo: sin altitud no hay
  // corrección altimétrica y sin modelo no hay nada que estimar, así que
  // preguntar antes dejaría una aguja sobre una ficha vacía.
  const geo = useGeolocation(isMobile, !!data.dem && !!data.models.temperature, onFix)


  /**
   * La ficha de lo que esté elegido, sea un punto del mapa o un pin.
   *
   * Es la MISMA en las dos pantallas: en el escritorio flota a la derecha y en
   * el móvil va dentro de la hoja deslizante. No hay una segunda versión de
   * ninguna ficha, así que lo que aprenda una lo sabe la otra el mismo día.
   */
  const detail = probe ? (
    <PointPanel
      point={probe}
      models={data.models}
      stations={data.stations}
      variable={bundleVariable}
      stops={stops}
      dem={data.dem}
      faulty={faultyIds}
      eto={agro.eto}
      now={now}
      onClose={() => setProbe(null)}
    />
  ) : selection ? (
    <DetailPanel
      selection={selection}
      model={data.models.temperature}
      health={data.health.diagnoses}
      now={now}
      firePolledAt={data.firePolledAt}
      co2Down={data.co2Down}
      guagua={guagua.network}
      onClose={() => setSelection(null)}
      onWeather={(lon, lat, label) => pick(lon, lat, label)}
      onRoute={(routeId) => setSelection({ kind: 'busRoute', value: { routeId } })}
    />
  ) : null

  // El DEM es bloqueante: sin altitudes no hay corrección altimétrica, y sin
  // ella la estimación no vale nada. Antes de enseñar una interpolación plana,
  // la app dice que no puede calcular.
  if (data.demError) {
    return (
      <main className="boot boot-error">
        <h1>{t.app.name}</h1>
        <p className="warn">{t.errors.demFailed}</p>
        <p className="dim">{t.errors.demFailedDetail}</p>
        <p className="mono dim small">{data.demError}</p>
      </main>
    )
  }

  if (!data.dem) {
    const p = data.demProgress
    return (
      <main className="boot">
        <h1>{t.app.name}</h1>
        <p className="dim">{t.app.tagline}</p>
        <p className="mono dim">
          {p ? t.loading.tiles(p.done, p.total) : `${t.loading.dem}…`}
        </p>
        <div className="boot-bar">
          <span style={{ width: p ? `${(p.done / p.total) * 100}%` : '4%' }} />
        </div>
      </main>
    )
  }

  return (
    <main className={isMobile ? 'app app-mobile' : 'app'}>
      <MapView
        dem={data.dem}
        models={data.models}
        variable={variable}
        stops={stops}
        maskedField={maskedField}
        stations={data.stations}
        summit={data.summit}
        health={data.health.diagnoses}
        air={data.air}
        sky={data.sky}
        fire={data.fire}
        co2={data.co2}
        gazetteer={data.gazetteer}
        trails={data.trails}
        trailSeverity={trailSeverity}
        trailPois={data.trailPois}
        guaguaLines={guagua.lines}
        guaguaStops={guagua.stops}
        // El resaltado no es un estado aparte: es la ficha de línea abierta.
        // Así no puede quedarse una línea encendida en el mapa sin nada que
        // explique por qué.
        guaguaRoute={selection?.kind === 'busRoute' ? selection.value.routeId : null}
        places={places.places}
        roads={places.roads}
        canals={places.canals}
        canalsVisible={placesOn.water}
        counters={counters.sites}
        wind={wind.field}
        basemap={basemap}
        visible={visible}
        probe={probe}
        me={geo.me}
        handleRef={mapHandle}
        onPick={(lon, lat) => pick(lon, lat)}
        onStation={(s) => {
          setProbe(null)
          setSelection({ kind: 'station', value: s })
        }}
        onAir={(a) => {
          setProbe(null)
          setSelection({ kind: 'air', value: a })
        }}
        onCo2={(c) => {
          setProbe(null)
          setSelection({ kind: 'co2', value: c })
        }}
        onFire={(f) => {
          setProbe(null)
          setSelection({ kind: 'fire', value: f })
        }}
        onSky={(s) => {
          setProbe(null)
          setSelection({ kind: 'sky', value: s })
        }}
        onBusStop={(stop) => {
          setProbe(null)
          setSelection({
            kind: 'busStop',
            value: {
              ...stop,
              elevation: data.dem ? elevationAt(data.dem, stop.lon, stop.lat) : null,
              municipality: municipalityOf(data.municipalities, stop.lon, stop.lat),
            },
          })
        }}
        onBusRoute={(routeId) => {
          setProbe(null)
          setSelection({ kind: 'busRoute', value: { routeId } })
        }}
        onPlace={(place) => {
          setProbe(null)
          setSelection({
            kind: 'place',
            value: {
              ...place,
              elevation: data.dem ? elevationAt(data.dem, place.lon, place.lat) : null,
              municipality: municipalityOf(data.municipalities, place.lon, place.lat),
            },
          })
        }}
        onRoad={(road, lon, lat) => {
          setProbe(null)
          setSelection({ kind: 'road', value: { ...road, lon, lat } })
        }}
        onStopsZoom={setStopsZoomReached}
        onCounter={(site) => {
          setProbe(null)
          setSelection({
            kind: 'counter',
            value: {
              ...site,
              elevation: data.dem ? elevationAt(data.dem, site.lon, site.lat) : null,
              municipality: municipalityOf(data.municipalities, site.lon, site.lat),
              // El día se acompaña desde donde se pidió: la ficha no vuelve a
              // preguntar qué día es, para no discrepar con la suma del pin.
              today: counters.today ?? '',
            },
          })
        }}
        onPoi={(poi) => {
          setProbe(null)
          // La altitud y el municipio no vienen en la capa de puntos: los pone
          // la app, con el mismo modelo de elevación que usa la interpolación.
          setSelection({
            kind: 'poi',
            value: {
              ...poi,
              elevation: data.dem ? elevationAt(data.dem, poi.lon, poi.lat) : null,
              municipality: municipalityOf(data.municipalities, poi.lon, poi.lat),
            },
          })
        }}
      />

      <Sidebar
        variable={variable}
        onVariable={setVariable}
        co2Field={co2Field}
        coverage={coverage}
        basemap={basemap}
        onBasemap={setBasemap}
        visible={visible}
        onToggle={toggle}
        places={placesOn}
        onTogglePlace={(kind) => setPlacesOn((p) => ({ ...p, [kind]: !p[kind] }))}
        models={data.models}
        census={data.census}
        health={data.health}
        stations={data.stations}
        validation={data.validation}
        gazetteer={data.gazetteer}
        onSearch={onSearch}
        lastUpdate={data.lastUpdate}
        wind={wind}
        counters={counters}
        guagua={{ loading: guagua.loading, stopsZoomReached }}
        deck={deck}
        roque={roque}
        summitLayer={data.summitLayer}
        agro={agro}
        trailReports={trailReports}
        // El punto elegido llega al panel para que el mar de nubes pueda decir
        // de qué lado cae y la agricultura, cuánta agua pide justo ahí.
        here={
          probe && probe.elevation !== null
            ? {
                lon: probe.lon,
                lat: probe.lat,
                elevationM: probe.elevation,
                label: probe.label ?? probe.municipality,
              }
            : null
        }
        onSectionToggle={(key, open) =>
          setOpenSections((prev) =>
            prev[key] === open ? prev : { ...prev, [key]: open },
          )
        }
        now={now}
        dem={data.dem}
        onSources={() => setShowSources(true)}
        // En el móvil la barra es una hoja que tapa el mapa y la abre un botón
        // redondo, así que quien manda es esta pantalla. En el escritorio no se
        // pasa nada y el panel sigue abriéndose solo.
        open={isMobile ? layersOpen : undefined}
        onOpenChange={isMobile ? setLayersOpen : undefined}
      />

      {data.upstreamError && (
        <div className="banner" role="status">
          <strong>{t.errors.upstreamDown}.</strong> {t.errors.upstreamDownDetail}
          <button className="link-btn" onClick={data.refresh}>
            {t.errors.retry}
          </button>
        </div>
      )}

      {data.fire.some((f) => f.hasAlert) && visible.fire && (
        <div className="banner banner-alert" role="alert">
          <strong>{t.fire.alert}:</strong>{' '}
          {data.fire.filter((f) => f.hasAlert).map((f) => f.name).join(', ')}
        </div>
      )}

      {isMobile ? (
        <MobileShell
          status={buildStatus({
            models: data.models,
            census: data.census,
            loading: data.loading,
            upstreamError: data.upstreamError,
            locating: geo.locating,
            locationDenied: geo.denied,
          })}
          variable={variable}
          onVariable={setVariable}
          headVariable={bundleVariable}
          stops={stops}
          gridOn={visible.grid}
          onToggleGrid={() => toggle('grid')}
          visible={visible}
          places={placesOn}
          locating={geo.locating}
          onLocate={geo.locate}
          onReset={() => {
            setProbe(null)
            setSelection(null)
            mapHandle.current?.reset()
          }}
          onLayers={() => setLayersOpen(true)}
          selection={selection}
          probe={probe}
          models={data.models}
          uncertainty={data.validation?.rmse ?? null}
          guagua={guagua.network}
          now={now}
          autoProbe={autoProbe}
        >
          {detail}
        </MobileShell>
      ) : (
        detail
      )}

      {showSources && <SourcesScreen onClose={() => setShowSources(false)} />}
    </main>
  )
}
