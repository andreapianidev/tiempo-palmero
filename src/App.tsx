import { useCallback, useEffect, useState } from 'react'
import { MapView, type LayerVisibility } from './components/MapView'
import { PointPanel, type ProbePoint } from './components/PointPanel'
import { DetailPanel, type Selection } from './components/DetailPanel'
import { Sidebar } from './components/Sidebar'
import { SourcesScreen } from './components/SourcesScreen'
import { useIslandData, municipalityOf } from './hooks/useIslandData'
import { elevationAt } from './lib/dem'
import { DEWPOINT_STOPS, HUMIDITY_STOPS, TEMP_STOPS, type RgbStop } from './lib/palette'
import type { InterpolableVariable } from './lib/interpolate'
import type { GazetteerEntry } from './lib/api'
import { t } from './i18n'

const STOPS: Record<InterpolableVariable, RgbStop[]> = {
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
  fire: true,
}

export default function App() {
  const data = useIslandData()
  const [variable, setVariable] = useState<InterpolableVariable>('temperature')
  const [visible, setVisible] = useState<LayerVisibility>(INITIAL_LAYERS)
  const [probe, setProbe] = useState<ProbePoint | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [showSources, setShowSources] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

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

  const model = data.models[variable]

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
        model={model}
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
      />

      <Sidebar
        variable={variable}
        onVariable={setVariable}
        visible={visible}
        onToggle={toggle}
        model={model}
        census={data.census}
        validation={data.validation}
        stops={stops}
        gazetteer={data.gazetteer}
        onSearch={onSearch}
        lastUpdate={data.lastUpdate}
        now={now}
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
          model={model}
          now={now}
          firePolledAt={data.firePolledAt}
          co2Down={data.co2Down}
          onClose={() => setSelection(null)}
        />
      )}

      {showSources && <SourcesScreen onClose={() => setShowSources(false)} />}
    </main>
  )
}
