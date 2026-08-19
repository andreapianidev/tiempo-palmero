/**
 * El estado de la escena nocturna: el catálogo, la red de fotómetros y la
 * cuenta de cuántas estrellas se ven.
 *
 * QUÉ SE PIDE Y CUÁNDO. El catálogo son 133 KB entre las tres piezas y **no se
 * descarga hasta que alguien enciende la función**: es lo más pesado que la
 * aplicación puede llegar a pedir después del DEM, y quien no mire el cielo de
 * noche no lo paga. Una vez descargado se queda: apagar y encender no vuelve a
 * pedirlo.
 *
 * LA RED DE FOTÓMETROS SÍ SE REFRESCA, cada diez minutos, que es exactamente lo
 * que cachea el proxy. Pedirla más a menudo sería releer la misma respuesta
 * cacheada gastando batería.
 *
 * FALLA EN ABIERTO, y en dos escalones. Sin red de fotómetros se cae al modelo
 * de `skyglow.ts` y el panel lo dice; sin catálogo no hay escena y la casilla se
 * queda apagada con su motivo escrito. Nunca se enseña un cielo inventado
 * haciéndolo pasar por medido.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchSkyQuality } from '../lib/api'
import { fetchSkyData, type SkyData } from '../lib/stars/catalog'
import { visibleFloorDeg, REFERENCE_PRESSURE_HPA } from '../lib/stars/refraction'
import { modelledSkyGlow } from '../lib/stars/skyglow'
import { extinctionCoefficient, limitingMagnitude, visibleCount } from '../lib/stars/visibility'
import {
  decodeSqmNetwork,
  isFrozen,
  updateFrozen,
  type FrozenMemory,
  type SqmNetwork,
} from '../lib/sqm/network'
import { pickStation, type SqmPick } from '../lib/sqm/pick'
import type { MoonState, SkyPosition } from '../lib/sun'
import type { StarSceneState } from '../components/stars/StarLayer'

/** Lo que cachea el proxy para `skyobservation_lastdata`. */
const REFRESH_MS = 10 * 60 * 1000

export interface NightSkyObserver {
  lon: number
  lat: number
  /** Altitud del observador, m. Decide el horizonte y la extinción. */
  elevationM: number
  /** Presión medida, hPa. Sin ella, la atmósfera estándar de esa altitud. */
  pressureHpa: number | null
  /** Temperatura medida, °C. */
  temperatureC: number | null
}

export type GlowSource = 'fotometro' | 'modelo'

export interface NightSkyState {
  loading: boolean
  /** Motivo por el que no hay catálogo, si no lo hay. */
  failed: string | null
  data: SkyData | null
  network: SqmNetwork | null
  /** El fotómetro que habla por el observador, o `null` si ninguno está cerca. */
  station: SqmPick | null
  /** Estaciones descartadas por publicar siempre lo mismo. */
  frozen: string[]
  /** De dónde sale el brillo del cielo que se está usando. */
  source: GlowSource
  /** Brillo del fondo de cielo, mag/arcsec². */
  glow: number
  /** Magnitud límite a simple vista. */
  limitMag: number
  extinctionK: number
  floorDeg: number
  /** Cuántas estrellas del catálogo entran con esa magnitud límite. */
  visible: number
  /** Lo que la capa necesita para dibujar. `null` si no hay catálogo. */
  scene: StarSceneState | null
}

export function useNightSky(
  enabled: boolean,
  now: number,
  observer: NightSkyObserver,
  sun: SkyPosition,
  moon: MoonState | null,
  twinkle: boolean,
  figures: boolean,
): NightSkyState {
  const [data, setData] = useState<SkyData | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [network, setNetwork] = useState<SqmNetwork | null>(null)
  const frozenMemory = useRef(new Map<string, FrozenMemory>())
  const [frozenIds, setFrozenIds] = useState<string[]>([])

  // ------------------------------------------------------------- catálogo
  useEffect(() => {
    if (!enabled || data || loading) return
    let alive = true
    setLoading(true)
    fetchSkyData()
      .then((d) => {
        if (!alive) return
        setData(d)
        setFailed(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        setFailed(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [enabled, data, loading])

  // ------------------------------------------------------- red de fotómetros
  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = async () => {
      try {
        const rows = await fetchSkyQuality()
        if (!alive) return
        const decoded = decodeSqmNetwork(rows, Date.now())
        // El sensor congelado se detecta comparando con la lectura anterior:
        // hace falta memoria entre peticiones, y vive aquí porque es la única
        // parte del sistema que ve la serie.
        const stuck: string[] = []
        for (const s of decoded.usable) {
          const next = updateFrozen(frozenMemory.current.get(s.id), s)
          frozenMemory.current.set(s.id, next)
          if (isFrozen(next)) stuck.push(s.id)
        }
        setFrozenIds(stuck)
        setNetwork({
          ...decoded,
          usable: decoded.usable.filter((s) => !stuck.includes(s.id)),
        })
      } catch {
        // Sin red se cae al modelo. No se borra la anterior: una lectura de
        // hace diez minutos sigue describiendo esta noche.
      }
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [enabled])

  // ------------------------------------------------------------- derivadas
  return useMemo<NightSkyState>(() => {
    const extinctionK = extinctionCoefficient(observer.elevationM, observer.pressureHpa ?? undefined)
    const pressure =
      observer.pressureHpa ??
      REFERENCE_PRESSURE_HPA *
        Math.pow(1 - 2.25577e-5 * Math.max(0, observer.elevationM), 5.25588)
    const temperature = observer.temperatureC ?? 10
    const floorDeg = visibleFloorDeg(observer.elevationM, pressure, temperature)
    const density = (pressure / REFERENCE_PRESSURE_HPA) * (283 / (273 + temperature))

    const station = network ? pickStation(network, observer.lon, observer.lat) : null

    // EL FOTÓMETRO GANA, y con él no se suma nada más: su lectura ya lleva
    // dentro la luna, el crepúsculo y el resplandor del pueblo de al lado.
    // Sumarle el modelo de la luna sería contarla dos veces.
    const source: GlowSource = station ? 'fotometro' : 'modelo'
    const glow = station
      ? station.station.sky
      : modelledSkyGlow({
          sunElevationDeg: sun.elevationDeg,
          moon: moon ? { illumination: moon.illumination, elevationDeg: moon.elevationDeg } : null,
          moonSeparationDeg: moon ? 90 - moon.elevationDeg : 90,
          skyElevationDeg: 90,
          extinctionK,
        })

    const limitMag = limitingMagnitude(glow)
    const visible = data ? visibleCount(data.catalog.magnitudes, limitMag) : 0

    const scene: StarSceneState | null = data
      ? {
          lon: observer.lon,
          lat: observer.lat,
          limitMag,
          extinctionK,
          floorDeg,
          density,
          twinkle: twinkle ? 1 : 0,
          // Las figuras se apagan solas cuando el cielo está tan claro que
          // quedarían líneas uniendo estrellas que no se ven. El umbral es la
          // propia magnitud límite: por debajo de 3,0 no queda ni una figura
          // completa —la más débil que usa una línea es de magnitud 6,47— y
          // dibujarlas sería inventar el cielo en vez de enseñarlo.
          figureOpacity: figures ? Math.min(0.5, Math.max(0, (limitMag - 3) / 6)) : 0,
        }
      : null

    return {
      loading,
      failed,
      data,
      network,
      station,
      frozen: frozenIds,
      source,
      glow,
      limitMag,
      extinctionK,
      floorDeg,
      visible,
      scene,
    }
  }, [
    data,
    failed,
    figures,
    frozenIds,
    loading,
    moon,
    network,
    now,
    observer.elevationM,
    observer.lat,
    observer.lon,
    observer.pressureHpa,
    observer.temperatureC,
    sun.elevationDeg,
    twinkle,
  ])
}
