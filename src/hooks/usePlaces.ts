/**
 * Carga de las capas de sitios y de las carreteras, a demanda.
 *
 * Cada capa se pide la primera vez que se enciende y se queda en memoria: son
 * ficheros de entre 18 KB y 1,3 MB, y pedir los seis al arrancar sería pagar
 * 3 MB por si acaso. Apagar un interruptor no tira lo descargado, porque volver
 * a encenderlo es lo más probable que pase después.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLayer } from '../lib/api'
import { PLACES, toPlacePoints, type PlaceKind } from '../lib/places'

export type PlaceVisibility = Record<PlaceKind, boolean>

export const NO_PLACES: PlaceVisibility = {
  tourism: false,
  viewpoint: false,
  culture: false,
  history: false,
  recreation: false,
  charging: false,
}

export interface PlacesData {
  /** Todos los sitios encendidos, ya como puntos y con su icono. */
  places: GeoJSON.FeatureCollection
  roads: GeoJSON.FeatureCollection | null
  loading: boolean
}

export function usePlaces(visible: PlaceVisibility, roadsOn: boolean): PlacesData {
  const [loaded, setLoaded] = useState<Record<string, GeoJSON.Feature[]>>({})
  const [roads, setRoads] = useState<GeoJSON.FeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)
  /** Qué se ha pedido ya. En una ref: marcarlo no debe provocar otro render. */
  const asked = useRef(new Set<string>())

  useEffect(() => {
    const pending = PLACES.filter((p) => visible[p.kind] && !asked.current.has(p.kind))
    if (!pending.length) return
    for (const p of pending) asked.current.add(p.kind)
    setLoading(true)
    let cancelled = false

    Promise.all(
      pending.map(async (p) => {
        const fc = await fetchLayer<GeoJSON.FeatureCollection>(p.file).catch(() => null)
        return [p.kind, fc ? toPlacePoints(fc, p.kind) : []] as const
      }),
    )
      .then((entries) => {
        if (cancelled) return
        setLoaded((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visible])

  useEffect(() => {
    if (!roadsOn || asked.current.has('roads')) return
    asked.current.add('roads')
    let cancelled = false
    fetchLayer<GeoJSON.FeatureCollection>('carreteras.geojson')
      .then((fc) => {
        if (!cancelled) setRoads(fc)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [roadsOn])

  // Solo lo encendido entra en la fuente: apagar una capa es quitar sus puntos,
  // no añadir un filtro más al estilo.
  const places = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: PLACES.filter((p) => visible[p.kind]).flatMap((p) => loaded[p.kind] ?? []),
    }),
    [visible, loaded],
  )

  return { places, roads, loading }
}
