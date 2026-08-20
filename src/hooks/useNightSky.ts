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
import { skyFrame } from '../lib/stars/frame'
import { visibleTonight, type VisibleStar } from '../lib/stars/tonight'
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
import { moonSight, type MoonSight } from '../lib/moon'
import type { SkyPosition } from '../lib/sun'
import type { StarSceneState } from '../components/stars/StarLayer'
import type { MoonSceneState } from '../components/moon/MoonLayer'

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
  /**
   * Las cinco más brillantes que se ven ahora, con nombre y rumbo.
   *
   * Es la única parte comprobable de la escena: se sale a la puerta y se mira.
   * Se recalcula con el pulso de un minuto de la interfaz, que para una tabla
   * de texto sobra — el cielo gira 0,25° en ese rato.
   */
  tonight: VisibleStar[]
  /** Lo que la capa necesita para dibujar. `null` si no hay catálogo. */
  scene: StarSceneState | null
  /**
   * La luna de este minuto, vista desde el observador.
   *
   * SE CALCULA SIEMPRE que la escena esté encendida, haya catálogo o no: la
   * luna no depende de los 133 KB de estrellas, y es lo primero que se ve.
   */
  moon: MoonSight
  /** Lo que la capa de la luna necesita. `null` con la luna apagada. */
  moonScene: MoonSceneState | null
}

export function useNightSky(
  enabled: boolean,
  now: number,
  observer: NightSkyObserver,
  sun: SkyPosition,
  moonOn: boolean,
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
  /**
   * ────────────────────────────────────────────────────────────────────────
   * EL CATÁLOGO SE DESCARGABA Y NO SE DIBUJABA NUNCA, y conviene dejar escrito
   * el mecanismo porque el código roto se leía perfectamente bien.
   *
   * Estaba así: `if (!enabled || data || loading) return`, con `loading` en las
   * dependencias, y una bandera `alive` en la limpieza para no escribir estado
   * después de desmontar. Cada pieza es correcta por separado y juntas se
   * anulan:
   *
   *  1. El efecto corre, llama a `setLoading(true)` y arranca la descarga.
   *     Devuelve su limpieza, que pondrá `alive = false`.
   *  2. `setLoading(true)` provoca un render, y como `loading` está en las
   *     dependencias React **ejecuta la limpieza del paso 1** antes de volver a
   *     lanzarlo. Ahí `alive` se pone a `false`.
   *  3. El efecto se relanza, ve `loading === true` y sale.
   *  4. La descarga termina, con `alive` ya en `false`: no se guarda el
   *     catálogo, y el `finally` tampoco apaga `loading`. El panel se queda en
   *     «Descargando…» para siempre y el cielo, vacío.
   *
   * La red hacía su trabajo —133 KB con HTTP 200— y por eso desde fuera no
   * parecía un fallo de descarga. Lo cazó una comprobación en un navegador de
   * verdad, `scripts/checks/cielo-carga.ts`, no una prueba de unidad: es un
   * error de ciclo de vida de React y en Node no existe.
   *
   * EL ARREGLO ES QUITAR `loading` DE LAS DEPENDENCIAS y llevar el «ya se ha
   * intentado» a una ref, que no provoca renders. De paso arregla el otro
   * fallo del mismo sitio: cuando la descarga FALLABA, `loading` volvía a
   * `false` con `data` todavía nulo, el efecto se relanzaba y se reintentaba en
   * bucle cerrado contra un servidor que acababa de fallar.
   *
   * Apagar y volver a encender la casilla reinicia la ref, así que sigue
   * habiendo forma de reintentar — a mano, que es como debe ser.
   */
  const attempted = useRef(false)
  useEffect(() => {
    if (!enabled) {
      attempted.current = false
      return
    }
    if (attempted.current || data) return
    attempted.current = true
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
  }, [enabled, data])

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

    // LA LUNA SE CALCULA AQUÍ Y NO EN `App`, que es donde estaba. Allí se
    // pedía con las coordenadas de referencia de la isla y sin altitud, o sea
    // sin paralaje: hasta 23' de error, casi un diámetro lunar. Aquí entra el
    // mismo observador que decide el horizonte y la extinción, y las tres cosas
    // no pueden hablar de sitios distintos.
    const moonObserver = {
      lon: observer.lon,
      lat: observer.lat,
      elevationM: observer.elevationM,
      pressureHpa: pressure,
      temperatureC: temperature,
    }
    const moon = moonSight(now, moonObserver)

    // EL FOTÓMETRO GANA, y con él no se suma nada más: su lectura ya lleva
    // dentro la luna, el crepúsculo y el resplandor del pueblo de al lado.
    // Sumarle el modelo de la luna sería contarla dos veces.
    const source: GlowSource = station ? 'fotometro' : 'modelo'
    const glow = station
      ? station.station.sky
      : modelledSkyGlow({
          sunElevationDeg: sun.elevationDeg,
          moon: {
            illumination: moon.illumination,
            elevationDeg: moon.apparentElevationDeg,
          },
          // El punto de cielo que se evalúa es el cenit, así que la separación
          // a la luna es su distancia cenital.
          moonSeparationDeg: 90 - moon.apparentElevationDeg,
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

    const tonight = data
      ? visibleTonight({
          catalog: data.catalog,
          names: data.names,
          frame: skyFrame(now, observer.lon, observer.lat),
          limitMag,
          extinctionK,
          floorDeg,
          pressureHpa: pressure,
          temperatureC: temperature,
          limit: 5,
        })
      : []

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
      tonight,
      scene,
      moon,
      moonScene: moonOn
        ? { observer: moonObserver, floorDeg, extinctionK, sunElevationDeg: sun.elevationDeg }
        : null,
    }
  }, [
    data,
    failed,
    figures,
    frozenIds,
    loading,
    moonOn,
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
