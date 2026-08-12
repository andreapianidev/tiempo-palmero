import { useCallback, useEffect, useState } from 'react'
import { MapView, type LayerVisibility } from './components/MapView'
import { PointPanel, type ProbePoint } from './components/PointPanel'
import { DetailPanel, type Selection } from './components/DetailPanel'
import { Sidebar } from './components/sidebar'
import { SourcesScreen } from './components/SourcesScreen'
import { useIslandData, municipalityOf } from './hooks/useIslandData'
import { useWindField } from './hooks/useWindField'
import { useGuagua } from './hooks/useGuagua'
import { usePlaces, NO_PLACES, type PlaceVisibility } from './hooks/usePlaces'
import { useCounters } from './hooks/useCounters'
import { elevationAt } from './lib/dem'
import { DEWPOINT_STOPS, HUMIDITY_STOPS, TEMP_STOPS, type RgbStop } from './lib/palette'
import type { DisplayVariable } from './lib/interpolate'
import type { GazetteerEntry } from './lib/api'
import { warmNearbyLayers } from './lib/nearby'
import { t } from './i18n'

const STOPS: Record<DisplayVariable, RgbStop[]> = {
  temperature: TEMP_STOPS,
  relativehumidity: HUMIDITY_STOPS,
  dewpoint: DEWPOINT_STOPS,
}

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
  const [variable, setVariable] = useState<DisplayVariable>('temperature')
  const [probe, setProbe] = useState<ProbePoint | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [showSources, setShowSources] = useState(false)
  // Si el zoom da ya para ver las paradas. Lo dice el mapa al cruzar el umbral,
  // no en cada fotograma: es lo único que hace falta saber del zoom aquí.
  const [stopsZoomReached, setStopsZoomReached] = useState(false)
  const [now, setNow] = useState(() => Date.now())

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

  const stops = STOPS[variable]

  const pick = useCallback(
    (lon: number, lat: number, label?: string) => {
      setSelection(null)
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
    <main className="app">
      <MapView
        dem={data.dem}
        models={data.models}
        variable={variable}
        stops={stops}
        stations={data.stations}
        air={data.air}
        sky={data.sky}
        fire={data.fire}
        co2={data.co2}
        gazetteer={data.gazetteer}
        trails={data.trails}
        trailPois={data.trailPois}
        guaguaLines={guagua.lines}
        guaguaStops={guagua.stops}
        // El resaltado no es un estado aparte: es la ficha de línea abierta.
        // Así no puede quedarse una línea encendida en el mapa sin nada que
        // explique por qué.
        guaguaRoute={selection?.kind === 'busRoute' ? selection.value.routeId : null}
        places={places.places}
        roads={places.roads}
        counters={counters.sites}
        wind={wind.field}
        visible={visible}
        probe={probe}
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
        visible={visible}
        onToggle={toggle}
        places={placesOn}
        onTogglePlace={(kind) => setPlacesOn((p) => ({ ...p, [kind]: !p[kind] }))}
        models={data.models}
        census={data.census}
        validation={data.validation}
        stops={stops}
        gazetteer={data.gazetteer}
        onSearch={onSearch}
        lastUpdate={data.lastUpdate}
        wind={wind}
        counters={counters}
        guagua={{ loading: guagua.loading, stopsZoomReached }}
        now={now}
        dem={data.dem}
        onSources={() => setShowSources(true)}
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

      {probe && (
        <PointPanel
          point={probe}
          models={data.models}
          stations={data.stations}
          variable={variable}
          stops={stops}
          now={now}
          onClose={() => setProbe(null)}
        />
      )}

      {selection && (
        <DetailPanel
          selection={selection}
          model={data.models.temperature}
          now={now}
          firePolledAt={data.firePolledAt}
          co2Down={data.co2Down}
          guagua={guagua.network}
          onClose={() => setSelection(null)}
          onWeather={(lon, lat, label) => pick(lon, lat, label)}
          onRoute={(routeId) => setSelection({ kind: 'busRoute', value: { routeId } })}
        />
      )}

      {showSources && <SourcesScreen onClose={() => setShowSources(false)} />}
    </main>
  )
}
