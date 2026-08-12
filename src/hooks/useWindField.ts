/**
 * Campo de viento de la isla: estaciones del Cabildo donde miden, modelo donde
 * no llegan.
 *
 * Vive fuera de `useIslandData` a propósito. Ese hook ya coordina siete fuentes
 * y pasa de 500 líneas; el viento es otra responsabilidad —tiene su propia
 * fuente, su propio ritmo y su propia forma de fallar— y añadirle un apartado
 * más habría sido justo lo que la regla de no hacer ficheros monolíticos
 * intenta evitar.
 *
 * Si el modelo falla, el campo se construye igualmente SOLO con estaciones: el
 * mapa sale con menos cobertura y la interfaz lo dice, en vez de quedarse en
 * blanco. Si no hay ni una estación con dirección, no hay campo y la capa no se
 * ofrece.
 */

import { useEffect, useMemo, useState } from 'react'
import { ISLAND_BBOX } from '../lib/geo'
import { isLand, type Dem } from '../lib/dem'
import type { Station } from '../lib/quality'
import { buildWindField, toComponents, type WindField, type WindSample } from '../lib/wind/field'
import { fetchModelWind, modelGridPoints } from '../lib/wind/model'

/**
 * Resolución de la malla. 96 × 128 sobre la isla son celdas de unos 350 m:
 * suficiente para que las partículas sigan los barrancos principales y barato
 * de construir (12 288 celdas × las muestras, una vez por refresco).
 */
const FIELD_WIDTH = 96
const FIELD_HEIGHT = 128

export interface WindState {
  field: WindField | null
  /** Estaciones que de verdad publican velocidad Y dirección ahora mismo. */
  measuring: number
  /** Instante de la pasada del modelo, epoch ms. `null` si no hay modelo. */
  modelAt: number | null
  modelFailed: boolean
}

export function useWindField(
  dem: Dem | null,
  stations: readonly Station[],
  refreshKey: number | null,
): WindState {
  const [model, setModel] = useState<{ samples: WindSample[]; at: number } | null>(null)
  const [modelFailed, setModelFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const points = modelGridPoints(dem)

    fetchModelWind(points, controller.signal)
      .then((r) => {
        if (cancelled) return
        setModel({ samples: r.samples, at: r.observedAt })
        setModelFailed(r.samples.length === 0)
      })
      .catch(() => {
        if (cancelled) return
        setModel(null)
        setModelFailed(true)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [dem, refreshKey])

  /**
   * Solo entran estaciones con las DOS componentes. Una que publica velocidad
   * sin dirección no dice hacia dónde sopla, y meterla como si soplara al norte
   * sería inventarse la mitad del dato.
   */
  const stationSamples = useMemo<WindSample[]>(
    () =>
      stations
        .filter((s) => s.windspeed !== null && s.winddirection !== null)
        .map((s) => {
          const { u, v } = toComponents(s.windspeed as number, s.winddirection as number)
          return { lon: s.lon, lat: s.lat, u, v, source: 'cabildo' as const }
        }),
    [stations],
  )

  const field = useMemo(() => {
    const samples = [...stationSamples, ...(model?.samples ?? [])]
    if (!samples.length) return null
    const { west, south, east, north } = ISLAND_BBOX
    return buildWindField(
      samples,
      [west, south, east, north],
      FIELD_WIDTH,
      FIELD_HEIGHT,
      // Sin DEM todavía no se sabe qué es tierra: se cuenta todo, y el
      // porcentaje sale pesimista durante el par de segundos que tarda en
      // cargar. Pesimista es el lado correcto para equivocarse aquí.
      dem ? (lon, lat) => isLand(dem, lon, lat) : undefined,
    )
  }, [stationSamples, model, dem])

  return {
    field,
    measuring: stationSamples.length,
    modelAt: model && Number.isFinite(model.at) ? model.at : null,
    modelFailed,
  }
}
