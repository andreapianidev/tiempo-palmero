/**
 * Carga y orquestación de todos los datos de la isla.
 *
 * El DEM es bloqueante a propósito: sin altitudes no hay corrección
 * altimétrica, y sin corrección altimétrica la estimación no vale nada. Antes
 * que enseñar una interpolación plana, la app dice que no puede calcular.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAirQuality,
  fetchCo2Readings,
  fetchCo2Sensors,
  fetchFireCameras,
  fetchGazetteer,
  fetchLayer,
  fetchSkyQuality,
  fetchWeather,
  UpstreamDownError,
  type Co2Reading,
  type Co2Sensor,
  type GazetteerEntry,
} from '../lib/api'
import { loadDem, elevationAt, type Dem } from '../lib/dem'
import {
  fetchAnchors,
  fetchProfileAnchors,
  pickHighAnchors,
  type Anchor,
  type ProfileAnchor,
} from '../lib/openmeteo'
import { buildStations, type NetworkCensus, type Station } from '../lib/quality'
import { parseLocation, parseTimeinstant, num, type CdaRow } from '../lib/cabildo'
import {
  buildModel,
  calibrate,
  leaveOneOut,
  type InterpolableVariable,
  type Model,
} from '../lib/interpolate'
import type { Calibration } from '../lib/uncertainty'
import {
  areaContaining,
  bboxOfMultiPolygon,
  inIslandBbox,
  toMultiPolygon,
  type NamedArea,
} from '../lib/geo'

const REFRESH_MS = 5 * 60 * 1000
const CO2_REFRESH_MS = 60 * 1000

export interface AirStation {
  entityId: string
  name: string
  lon: number
  lat: number
  at: number
  ageHours: number
  index: number | null
  level: string | null
  values: { key: string; value: number }[]
}

export interface SkyStation {
  entityId: string
  name: string
  lon: number
  lat: number
  at: number
  skyMagnitude: number | null
  clouds: number | null
}

export interface FireCamera {
  name: string
  lon: number
  lat: number
  hasAlert: boolean
  minTemperature: number | null
  maxTemperature: number | null
}

export interface Co2Point extends Co2Sensor {
  reading: Co2Reading | null
  /** true si la lectura tiene más de 15 minutos o no existe. */
  stale: boolean
}

export interface IslandData {
  dem: Dem | null
  demProgress: { done: number; total: number } | null
  demError: string | null

  stations: Station[]
  census: NetworkCensus | null
  models: Record<InterpolableVariable, Model | null>
  validation: { rmse: number; mae: number; n: number } | null
  /** Anclas de modelo por encima del techo de la red. Nunca son del Cabildo. */
  anchors: ProfileAnchor[]

  air: AirStation[]
  sky: SkyStation[]
  fire: FireCamera[]
  firePolledAt: number | null

  co2: Co2Point[]
  co2FetchedAt: number | null
  co2Down: boolean

  municipalities: NamedArea[]
  gazetteer: GazetteerEntry[]
  trails: unknown | null
  trailPois: unknown | null
  islandOutline: unknown | null

  loading: boolean
  upstreamError: string | null
  lastUpdate: number | null
  refresh: () => void
}

const AIR_KEYS = ['no2', 'o3', 'so2', 'co', 'co2', 'pm1', 'pm25', 'pm10'] as const

export function useIslandData(): IslandData {
  const [dem, setDem] = useState<Dem | null>(null)
  const [demProgress, setDemProgress] = useState<{ done: number; total: number } | null>(null)
  const [demError, setDemError] = useState<string | null>(null)

  const [weatherRows, setWeatherRows] = useState<CdaRow[]>([])
  const [anchors, setAnchors] = useState<ProfileAnchor[]>([])
  /** Open-Meteo en el punto de cada estación, para medir el error del modelo. */
  const [modelAtStations, setModelAtStations] = useState<Anchor[]>([])
  const [air, setAir] = useState<AirStation[]>([])
  const [sky, setSky] = useState<SkyStation[]>([])
  const [fire, setFire] = useState<FireCamera[]>([])
  const [firePolledAt, setFirePolledAt] = useState<number | null>(null)

  const [co2Sensors, setCo2Sensors] = useState<Co2Sensor[]>([])
  const [co2Readings, setCo2Readings] = useState<Co2Reading[]>([])
  const [co2FetchedAt, setCo2FetchedAt] = useState<number | null>(null)
  const [co2Down, setCo2Down] = useState(false)

  const [municipalities, setMunicipalities] = useState<NamedArea[]>([])
  const [gazetteer, setGazetteer] = useState<GazetteerEntry[]>([])
  const [trails, setTrails] = useState<unknown | null>(null)
  const [trailPois, setTrailPois] = useState<unknown | null>(null)
  const [islandOutline, setIslandOutline] = useState<unknown | null>(null)

  const [loading, setLoading] = useState(true)
  const [upstreamError, setUpstreamError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [tick, setTick] = useState(0)

  // Reloj de PRESENTACIÓN: sin él, la antigüedad mostrada se congela entre
  // refrescos y un dato de 14 minutos sigue pareciendo de 4.
  //
  // Deliberadamente NO alimenta el modelo. La frescura de una lectura se juzga
  // contra el momento en que se pidió, no contra el reloj de pared: colgar el
  // modelo de este tic recalculaba el ajuste, la malla de 46.000 celdas y la
  // validación leave-one-out entera cada 30 segundos, para que casi nunca
  // cambiara nada.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // --- DEM y capas estáticas, una sola vez ---------------------------------
  useEffect(() => {
    let cancelled = false
    loadDem((done, total) => {
      if (!cancelled) setDemProgress({ done, total })
    })
      .then((d) => {
        if (!cancelled) setDem(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setDemError(e instanceof Error ? e.message : String(e))
      })

    fetchLayer<{ features: { geometry: any; properties: any }[] }>('municipios.geojson')
      .then((geo) => {
        if (cancelled || !geo) return
        setMunicipalities(
          geo.features.map((f) => {
            const polygons = toMultiPolygon(f.geometry)
            return {
              name: String(f.properties?.municipio ?? '—'),
              polygons,
              bbox: bboxOfMultiPolygon(polygons),
            }
          }),
        )
      })
      .catch(() => undefined)

    fetchGazetteer().then((g) => !cancelled && setGazetteer(g)).catch(() => undefined)
    fetchLayer('senderos.geojson').then((g) => !cancelled && setTrails(g)).catch(() => undefined)
    fetchLayer('senderos-poi.geojson').then((g) => !cancelled && setTrailPois(g)).catch(() => undefined)
    fetchLayer('limite-insular.geojson').then((g) => !cancelled && setIslandOutline(g)).catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  // --- Redes del Cabildo ---------------------------------------------------
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const rows = await fetchWeather()
        if (cancelled) return
        setWeatherRows(rows)
        setUpstreamError(null)
        setLastUpdate(Date.now())
      } catch (e) {
        if (!cancelled) {
          setUpstreamError(
            e instanceof UpstreamDownError ? e.detail : String(e),
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }

      // Las redes secundarias no bloquean ni tumban la principal.
      fetchAirQuality()
        .then((rows) => {
          if (cancelled) return
          const out: AirStation[] = []
          for (const r of rows) {
            const loc = parseLocation(r.location)
            const at = parseTimeinstant(r.timeinstant)
            if (!loc || at === null || !inIslandBbox(loc[0], loc[1])) continue
            const values: { key: string; value: number }[] = []
            for (const k of AIR_KEYS) {
              const v = num(r[k])
              if (v !== null) values.push({ key: k, value: v })
            }
            out.push({
              entityId: String(r.entityid ?? ''),
              name: String(r.name ?? '—'),
              lon: loc[0],
              lat: loc[1],
              at,
              ageHours: (Date.now() - at) / 3_600_000,
              index: num(r.airqualityindex ?? r.airqualitystatus),
              level: r.airqualitylevel ? String(r.airqualitylevel) : null,
              values,
            })
          }
          setAir(out)
        })
        .catch(() => undefined)

      fetchSkyQuality()
        .then((rows) => {
          if (cancelled) return
          const out: SkyStation[] = []
          for (const r of rows) {
            const loc = parseLocation(r.location)
            const at = parseTimeinstant(r.timeinstant)
            if (!loc || at === null || !inIslandBbox(loc[0], loc[1])) continue
            out.push({
              entityId: String(r.entityid ?? ''),
              name: String(r.name ?? '—'),
              lon: loc[0],
              lat: loc[1],
              at,
              skyMagnitude: num(r.skymagnitude),
              clouds: num(r.clouds),
            })
          }
          setSky(out)
        })
        .catch(() => undefined)

      fetchFireCameras()
        .then((rows) => {
          if (cancelled) return
          const out: FireCamera[] = []
          for (const r of rows) {
            const loc = parseLocation(r.location)
            if (!loc) continue
            out.push({
              name: String(r.name ?? '—'),
              lon: loc[0],
              lat: loc[1],
              // `hasfirealert` es la CADENA "True"/"False": `if (r.hasfirealert)`
              // sería siempre cierto y la app estaría en alerta permanente.
              hasAlert: String(r.hasfirealert).toLowerCase() === 'true',
              minTemperature: num(r.mintemperature),
              maxTemperature: num(r.maxtemperature),
            })
          }
          setFire(out)
          // Esta red no publica ninguna marca de tiempo, así que la única
          // referencia honesta es nuestro propio reloj de consulta.
          setFirePolledAt(Date.now())
        })
        .catch(() => undefined)
    }

    run()
    const id = setInterval(run, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [tick])

  // --- CO₂ -----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    fetchCo2Sensors()
      .then((s) => !cancelled && setCo2Sensors(s))
      .catch(() => undefined)

    const run = () =>
      fetchCo2Readings()
        .then(({ fetchedAt, readings }) => {
          if (cancelled) return
          setCo2Readings(readings)
          setCo2FetchedAt(fetchedAt)
          setCo2Down(false)
        })
        .catch(() => {
          if (cancelled) return
          // Fallo en cerrado: se borran las lecturas. No se conserva la última
          // buena, porque un verde rancio sobre gas volcánico es peor que nada.
          setCo2Readings([])
          setCo2FetchedAt(null)
          setCo2Down(true)
        })

    run()
    const id = setInterval(run, CO2_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [tick])

  // --- Derivados -----------------------------------------------------------

  const elevationLookup = useCallback(
    (lon: number, lat: number) => (dem ? elevationAt(dem, lon, lat) : null),
    [dem],
  )

  // Instante de referencia del modelo: cuándo se trajeron estas filas.
  const fetchedAt = lastUpdate ?? now

  const { stations, census } = useMemo(() => {
    if (!dem || !weatherRows.length) {
      return { stations: [] as Station[], census: null as NetworkCensus | null }
    }
    return buildStations(weatherRows, elevationLookup, { now: fetchedAt })
  }, [dem, weatherRows, elevationLookup, fetchedAt])

  /** Identidad del conjunto de estaciones: cambia solo si cambia la red. */
  const stationKey = stations.map((s) => s.entityId).join(',')

  /**
   * Open-Meteo en el punto de cada estación.
   *
   * No se usa para pintar nada: sirve para MEDIR cuánto se desvía el modelo de
   * la red, que es la incertidumbre honesta de las anclas allí donde no hay
   * estaciones. Se pide con la misma cadencia que el resto y, si falla, la
   * banda de arriba se queda sin calibrar y hereda la del interpolador.
   */
  useEffect(() => {
    if (!stations.length) return
    let cancelled = false
    fetchAnchors(
      stations.map((s) => ({ lon: s.lon, lat: s.lat, elevation: s.elevation })),
    )
      .then((m) => {
        if (!cancelled) setModelAtStations(m)
      })
      .catch(() => {
        if (!cancelled) setModelAtStations([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationKey, tick])


  // Techo real de lo que publica la red: la estación más alta con dato.
  const stationCeiling = useMemo(
    () => (stations.length ? Math.max(...stations.map((s) => s.elevation)) : null),
    [stations],
  )

  /**
   * Anclas de modelo por encima de la estación más alta que publica.
   *
   * El techo se toma de las propias estaciones, no de los modelos: los modelos
   * ya llevan las anclas dentro y preguntarles aquí sería un ciclo. La cota de
   * corte definitiva la aplica `buildModel`, variable por variable, contra el
   * rango que de verdad ha quedado tras el rechazo de anomalías.
   *
   * El valor sale del PERFIL VERTICAL, no de la superficie: ver la cabecera de
   * `profile.ts`. Contra la estación real del Roque, 8,20 K de error con la
   * superficie contra 1,27 K con el perfil.
   *
   * Si Open-Meteo falla no pasa nada: se queda sin anclas y el mapa vuelve a
   * extrapolar, que es exactamente lo que hacía antes. Nunca tumba la app.
   */
  useEffect(() => {
    if (!dem || !stationCeiling) return
    let cancelled = false
    const points = pickHighAnchors(dem, stationCeiling)
    if (!points.length) return
    fetchProfileAnchors(points)
      .then((a) => {
        if (!cancelled) setAnchors(a)
      })
      .catch(() => {
        if (!cancelled) setAnchors([])
      })
    return () => {
      cancelled = true
    }
  }, [dem, stationCeiling, tick])


  /**
   * Calibración de la banda de incertidumbre. Cara —un leave-one-out completo
   * por variable— así que cuelga del conjunto de estaciones y de la comparación
   * contra el modelo, no del reloj de presentación.
   */
  const calibrations = useMemo(() => {
    if (stations.length < 8) {
      return { temperature: null, relativehumidity: null } as Record<
        InterpolableVariable,
        Calibration | null
      >
    }
    // Emparejado por COORDENADA, nunca por índice: `fetchAnchors` descarta los
    // puntos que llegan sin hora legible, así que el array puede venir más
    // corto que el de estaciones y un `modelAtStations[i]` estaría comparando
    // el modelo de una estación con la medida de otra, en silencio.
    const key = (lon: number, lat: number) => `${lon.toFixed(5)},${lat.toFixed(5)}`
    const byPoint = new Map(modelAtStations.map((m) => [key(m.lon, m.lat), m]))
    const pairs = (v: InterpolableVariable) =>
      stations.map((s) => {
        const m = byPoint.get(key(s.lon, s.lat))
        return {
          model: m ? (v === 'temperature' ? m.temperature : m.relativehumidity) : null,
          observed: s[v],
        }
      })
    return {
      temperature: calibrate(stations, 'temperature', pairs('temperature')),
      relativehumidity: calibrate(stations, 'relativehumidity', pairs('relativehumidity')),
    } as Record<InterpolableVariable, Calibration | null>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationKey, modelAtStations])

  const models = useMemo(() => {
    const make = (v: InterpolableVariable) =>
      stations.length ? buildModel(stations, v, anchors, calibrations[v]) : null
    return {
      temperature: make('temperature'),
      relativehumidity: make('relativehumidity'),
    } as Record<InterpolableVariable, Model | null>
  }, [stations, anchors, calibrations])

  // La validación es cara (n ajustes completos) y solo informa la cabecera, así
  // que se recalcula cuando cambia el conjunto de estaciones, no en cada tick.
  const validation = useMemo(() => {
    if (stations.length < 8) return null
    const loo = leaveOneOut(stations, 'temperature')
    return Number.isFinite(loo.rmse) ? { rmse: loo.rmse, mae: loo.mae, n: loo.n } : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationKey])

  const co2 = useMemo<Co2Point[]>(() => {
    const byId = new Map(co2Readings.map((r) => [r.id, r]))
    return co2Sensors.map((s) => {
      const reading = byId.get(s.id) ?? null
      const stale = !reading || now - reading.at > 15 * 60 * 1000
      return { ...s, reading, stale }
    })
  }, [co2Sensors, co2Readings, now])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return {
    dem,
    demProgress,
    demError,
    stations,
    census,
    models,
    validation,
    anchors,
    air,
    sky,
    fire,
    firePolledAt,
    co2,
    co2FetchedAt,
    co2Down,
    municipalities,
    gazetteer,
    trails,
    trailPois,
    islandOutline,
    loading,
    upstreamError,
    lastUpdate,
    refresh,
  }
}

export function municipalityOf(
  areas: NamedArea[],
  lon: number,
  lat: number,
): string | null {
  return areaContaining(lon, lat, areas)
}
