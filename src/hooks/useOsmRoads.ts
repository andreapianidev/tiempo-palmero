/**
 * Carga del viario completo de OSM, a demanda y una sola vez.
 *
 * Va aparte de `usePlaces` porque es la capa más pesada de la aplicación —5,2 MB
 * de GeoJSON, 19.770 trazados— y por eso es la única que tiene que decir en voz
 * alta que se está descargando: encender la casilla y no ver nada durante unos
 * segundos parece una casilla rota. El resto de capas van entre 18 KB y 1,3 MB
 * y no necesitan explicarse.
 *
 * Apagarla NO tira lo descargado: volver a encenderla es lo más probable que
 * pase después, y son 5,2 MB.
 */

import { useEffect, useRef, useState } from 'react'
import { fetchLayer } from '../lib/api'

export interface OsmRoadsData {
  roads: GeoJSON.FeatureCollection | null
  loading: boolean
  /** La descarga falló. La casilla queda marcada y el mapa no cambia: hay que decirlo. */
  failed: boolean
}

export function useOsmRoads(on: boolean): OsmRoadsData {
  const [roads, setRoads] = useState<GeoJSON.FeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  /** Ya se ha pedido. En una ref: marcarlo no debe provocar otro render. */
  const asked = useRef(false)

  useEffect(() => {
    if (!on || asked.current) return
    asked.current = true
    setLoading(true)
    setFailed(false)
    let cancelled = false

    /** Un fallo no se queda pegado: apagar y volver a encender reintenta. */
    const fail = () => {
      asked.current = false
      if (!cancelled) setFailed(true)
    }

    fetchLayer<GeoJSON.FeatureCollection>('viario-osm.geojson')
      .then((fc) => {
        if (cancelled) return
        // `fetchLayer` devuelve null si el servidor no responde 200: eso es un
        // fallo, no una capa vacía, y se enseña como tal.
        if (fc) setRoads(fc)
        else fail()
      })
      .catch(fail)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [on])

  return { roads, loading, failed }
}
