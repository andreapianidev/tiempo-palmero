/**
 * Los datos de la red de guaguas, traídos solo si alguien enciende la capa.
 *
 * Son 1,5 MB entre trazados y paradas —más de lo que pesa todo lo demás que la
 * app carga al arrancar— y la mayoría de las visitas vienen a ver el tiempo. Se
 * piden la primera vez que se enciende el interruptor y se quedan en memoria:
 * apagar la capa no tira los datos, porque volver a encenderla es lo más
 * probable que pase después.
 */

import { useEffect, useRef, useState } from 'react'
import { fetchLayer } from '../lib/api'
import { loadGuaguaNetwork, type GuaguaNetwork } from '../lib/guagua/network'
import { decorateStops } from '../components/guagua/GuaguaLayer'

export interface GuaguaData {
  network: GuaguaNetwork | null
  lines: GeoJSON.FeatureCollection | null
  /** Paradas ya marcadas con las líneas que las sirven. */
  stops: GeoJSON.FeatureCollection | null
  loading: boolean
}

export function useGuagua(enabled: boolean): GuaguaData {
  const [network, setNetwork] = useState<GuaguaNetwork | null>(null)
  const [lines, setLines] = useState<GeoJSON.FeatureCollection | null>(null)
  const [stops, setStops] = useState<GeoJSON.FeatureCollection | null>(null)
  const [loading, setLoading] = useState(false)
  /**
   * «Ya se pidió» va en una ref, no en un estado.
   *
   * Con un estado, marcarlo provoca un render, el render vuelve a disparar este
   * efecto, y la limpieza del anterior marca `cancelled`: la descarga termina
   * bien y su resultado se tira a la basura. El mapa se quedaba con las capas
   * creadas, visibles y vacías.
   */
  const asked = useRef(false)

  useEffect(() => {
    if (!enabled || asked.current) return
    asked.current = true
    setLoading(true)
    let cancelled = false

    Promise.all([
      loadGuaguaNetwork(),
      fetchLayer<GeoJSON.FeatureCollection>('lineas-guagua.geojson').catch(() => null),
      fetchLayer<GeoJSON.FeatureCollection>('paradas-guagua.geojson').catch(() => null),
    ])
      .then(([net, ln, st]) => {
        if (cancelled) return
        setNetwork(net)
        setLines(ln)
        // Si el agregado del GTFS no llega, las paradas siguen saliendo en el
        // mapa: se ven, se pinchan y la ficha dice que no sabe qué líneas paran.
        // Es peor un mapa vacío que un mapa que reconoce lo que le falta.
        setStops(st ? decorateStops(st, net) : null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { network, lines, stops, loading }
}
