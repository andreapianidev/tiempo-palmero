/**
 * Todo lo que el océano necesita saber, reunido en un sitio.
 *
 * Vive fuera de `useIslandData` por la misma razón que el viento: ese hook ya
 * coordina siete fuentes y pasa de 600 líneas, y el mar tiene su propia fuente,
 * su propio ritmo y su propia forma de fallar.
 *
 * NO SE PIDE NADA HASTA QUE SE ENCIENDE LA CAPA. La batimetría son 155 KB, el
 * límite insular del que sale la costa 1,6 MB —aunque ese ya está en la caché
 * del navegador, porque el mapa lo dibuja desde el principio— y el modelo
 * marino, una petición cada refresco. Quien no encienda el océano no paga nada
 * de eso. Es la misma regla que la red de guaguas y el viario de OSM.
 *
 * DE DÓNDE SALE CADA COSA:
 *
 *   oleaje, marea, temperatura del agua, corriente   modelo marino (Open-Meteo)
 *   viento sobre el mar                              estaciones del Cabildo,
 *                                                    modelo donde no llegan
 *   profundidad                                      EMODnet, congelada en build
 *   línea de costa                                   límite insular del Cabildo
 *   polvo en suspensión                              estaciones de calidad del aire
 *   radiación solar                                  estaciones del Cabildo
 *
 * Las dos últimas no cambian la forma del mar: cambian la LUZ que le da, y con
 * ella el color. Un mar iluminado a mediodía en una mañana de calima cerrada
 * sería una contradicción con el resto de la pantalla.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { dataUrl } from '../lib/endpoints'
import type { Dem } from '../lib/dem'
import type { Station } from '../lib/quality'
import type { WindField, WindSample } from '../lib/wind/field'
import { fetchModelWind } from '../lib/wind/model'
import {
  fetchMarine,
  meanSeaLevel,
  meanSst,
  MARINE_POINTS,
  type MarineSample,
} from '../lib/ocean/marine'
import { buildOceanField, type OceanField } from '../lib/ocean/field'
import { buildShorelineMap, type ShorelineMap } from '../lib/ocean/land-mask'
import { pm10Now, solarNow } from '../lib/measured-light'
import type { AirStation } from './useIslandData'

export interface BathymetryAsset {
  image: HTMLImageElement
  maxDepthM: number
  attribution: string
  deepestM: number
}

export interface OceanData {
  field: OceanField | null
  shoreline: ShorelineMap | null
  bathymetry: BathymetryAsset | null
  marine: MarineSample[]
  /** Marea sobre el nivel medio, m. Una sola para toda la isla. */
  tideM: number | null
  sstC: number | null
  /** Viento medio sobre el mar, m/s: la escala del rizado. */
  windMs: number
  /** Instante de la pasada del modelo marino, epoch ms. */
  observedAt: number | null
  loading: boolean
  failed: boolean
  /** Polvo en suspensión y radiación medidos, para la luz. */
  pm10: number | null
  solarWm2: number | null
}

const EMPTY: OceanData = {
  field: null,
  shoreline: null,
  bathymetry: null,
  marine: [],
  tideM: null,
  sstC: null,
  windMs: 6,
  observedAt: null,
  loading: false,
  failed: false,
  pm10: null,
  solarWm2: null,
}

export function useOcean(
  enabled: boolean,
  dem: Dem | null,
  wind: WindField | null,
  stations: readonly Station[],
  air: readonly AirStation[],
  refreshKey: number | null,
): OceanData {
  const [bathymetry, setBathymetry] = useState<BathymetryAsset | null>(null)
  const [shoreline, setShoreline] = useState<ShorelineMap | null>(null)
  const [marine, setMarine] = useState<{ samples: MarineSample[]; at: number } | null>(null)
  const [offshore, setOffshore] = useState<WindSample[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  // --- el fondo: se pide una vez -------------------------------------------
  //
  // La marca se levanta si la petición falla, así que apagar y volver a
  // encender el océano lo reintenta. Antes se marcaba antes de empezar y no se
  // levantaba nunca: una batimetría que fallara una vez —un despliegue a medias,
  // un túnel— dejaba el mar sin fondo para el resto de la sesión.
  const bathyStarted = useRef(false)
  useEffect(() => {
    if (!enabled || bathyStarted.current) return
    bathyStarted.current = true
    let cancelled = false

    void (async () => {
      const manifest = (await (await fetch(dataUrl('/ocean/manifest.json'))).json()) as {
        maxDepthM: number
        attribution: string
        measured: { deepestM: number }
      }
      const image = new Image()
      // La textura la sube WebGL desde la propia imagen; sin esto, un despliegue
      // servido desde otro origen —la app móvil— daría una textura «manchada» y
      // WebGL se negaría a usarla.
      image.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('no se pudo cargar la batimetría'))
        image.src = dataUrl('/ocean/batimetria.png')
      })
      if (cancelled) return
      setBathymetry({
        image,
        maxDepthM: manifest.maxDepthM,
        attribution: manifest.attribution,
        deepestM: manifest.measured.deepestM,
      })
    })().catch(() => {
      if (cancelled) return
      bathyStarted.current = false
      setFailed(true)
    })

    return () => {
      cancelled = true
    }
  }, [enabled])

  // --- la costa: se construye una vez, y se rehace si llega el DEM ---------
  //
  // El modelo de elevación y esto compiten por llegar primero, y quien gana
  // cambia lo que se ve: sin DEM la costa se construye sin cotas, y entonces el
  // agua no distingue un acantilado de una playa. Si el DEM aparece después, se
  // rehace —cuesta unas decenas de milisegundos y no parpadea, porque lo único
  // que pasa es que se reescribe la textura—. Sin esto, la línea de agua
  // dependía del orden en que respondiera la red.
  const shoreBuild = useRef({ running: false, done: false, withDem: false })
  useEffect(() => {
    if (!enabled) return
    const state = shoreBuild.current
    if (state.running) return
    if (state.done && (state.withDem || dem === null)) return
    state.running = true
    let cancelled = false

    void (async () => {
      const island = (await (
        await fetch(dataUrl('/layers/limite-insular.geojson'))
      ).json()) as GeoJSON.FeatureCollection
      if (cancelled) return
      const map = await buildShorelineMap(island, dem)
      if (cancelled) return
      setShoreline(map)
      state.done = true
      state.withDem = dem !== null
    })()
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        state.running = false
      })

    return () => {
      cancelled = true
    }
  }, [enabled, dem])

  // --- lo que se refresca con la aplicación --------------------------------
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)

    // Dos peticiones y no una: el modelo marino no publica viento, y el viento
    // es lo que riza la superficie y arranca los borreguillos. Se le piden al
    // modelo los MISMOS ocho puntos del anillo, así que las dos rejillas
    // coinciden y no hay que interpolar una sobre la otra.
    Promise.all([
      fetchMarine(MARINE_POINTS, controller.signal),
      fetchModelWind(
        MARINE_POINTS.map((p) => ({ ...p, elevation: 0 })),
        controller.signal,
      ).catch(() => ({ samples: [] as WindSample[], observedAt: NaN })),
    ])
      .then(([sea, air10]) => {
        if (cancelled) return
        setMarine({ samples: sea.samples, at: sea.observedAt })
        setOffshore(air10.samples)
        setFailed(sea.samples.length === 0)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled, refreshKey])

  // --- el campo, ya interpolado --------------------------------------------
  const field = useMemo(() => {
    if (!marine || !marine.samples.length) return null
    return buildOceanField(marine.samples, wind, offshore)
  }, [marine, wind, offshore])

  /**
   * Viento medio sobre el mar. De los puntos del anillo, no de las estaciones:
   * lo que fija la escala del rizado es el viento que hay SOBRE EL AGUA, y las
   * estaciones están en tierra, muchas de ellas resguardadas.
   */
  const windMs = useMemo(() => {
    if (!offshore.length) return 6
    const speeds = offshore.map((s) => Math.hypot(s.u, s.v))
    return speeds.reduce((a, b) => a + b, 0) / speeds.length
  }, [offshore])

  // Las dos medidas que cambian la LUZ viven en `lib/measured-light.ts` desde
  // que el cielo de la vista 3D pinta el mismo cielo que este mar refleja: son
  // los mismos números o son dos cielos.
  const pm10 = useMemo(() => pm10Now(air), [air])
  const solarWm2 = useMemo(() => solarNow(stations), [stations])

  if (!enabled) return EMPTY

  return {
    field,
    shoreline,
    bathymetry,
    marine: marine?.samples ?? [],
    tideM: marine ? meanSeaLevel(marine.samples) : null,
    sstC: marine ? meanSst(marine.samples) : null,
    windMs,
    observedAt: marine && Number.isFinite(marine.at) ? marine.at : null,
    loading,
    failed,
    pm10,
    solarWm2,
  }
}
