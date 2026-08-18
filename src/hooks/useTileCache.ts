/**
 * La caché de teselas, enchufada al mapa.
 *
 * Tres cosas, y las tres cuelgan de que el mapa esté quieto:
 *
 *  1. **Al encender un fondo externo**, se precarga la vista de lejos de la
 *     isla —17 teselas, ver `budget.ts`—. Solo la primera vez y solo de ese
 *     fondo: `basemaps.ts` promete que quien no toque el selector no gasta ni
 *     una petición fuera de casa, y esa promesa sigue en pie.
 *  2. **Cuando el mapa se para después de moverse**, se precarga el borde por
 *     el que se venía saliendo.
 *  3. **De vez en cuando**, se purga lo caducado y lo que pase del techo.
 *
 * El registro del protocolo NO está aquí: lo hace `MapView` justo antes de
 * declarar las fuentes, porque tiene que estar puesto antes de la primera
 * petición y el orden de los efectos de React no es sitio donde apoyar eso.
 */

import { useEffect, useRef } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { BASEMAPS, type BasemapId } from '../lib/basemaps'
import { ISLAND_BBOX } from '../lib/geo'
import { rasterTileZoom } from '../lib/tiles/grid'
import { leadingEdgeTiles, overviewTiles } from '../lib/tiles/prefetch'
import { sweep } from '../lib/tiles/store'
import { stopWarming, warmTiles } from '../lib/tiles/warm'

/** Cada cuánto se purga, como mucho: una vez por sesión y cada media hora. */
const SWEEP_EVERY_MS = 30 * 60 * 1000

export function useTileCache(map: MapLibreMap | null, basemap: BasemapId): void {
  const warmed = useRef(new Set<BasemapId>())
  const lastCenter = useRef<{ lon: number; lat: number } | null>(null)
  const lastSweep = useRef(0)

  // 1. La vista de lejos, al estrenar un fondo externo.
  useEffect(() => {
    const source = BASEMAPS[basemap].source
    if (!source?.tiles?.length || warmed.current.has(basemap)) return
    warmed.current.add(basemap)
    warmTiles('lejos', source.tiles[0], overviewTiles(ISLAND_BBOX))
  }, [basemap])

  // 2. El borde por el que se sale, y 3. la purga.
  useEffect(() => {
    if (!map) return

    const onMoveStart = () => {
      const c = map.getCenter()
      lastCenter.current = { lon: c.lng, lat: c.lat }
    }

    const onIdle = () => {
      const now = Date.now()
      if (now - lastSweep.current > SWEEP_EVERY_MS) {
        lastSweep.current = now
        void sweep(now)
      }

      const from = lastCenter.current
      lastCenter.current = null
      const source = BASEMAPS[basemap].source
      if (!from || !source?.tiles?.length) return

      const b = map.getBounds()
      const tiles = leadingEdgeTiles(from, {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
        zoom: rasterTileZoom(map.getZoom(), source.minzoom ?? 0, source.maxzoom ?? 22),
      })
      if (tiles.length) warmTiles('borde', source.tiles[0], tiles)
    }

    map.on('movestart', onMoveStart)
    map.on('idle', onIdle)
    return () => {
      map.off('movestart', onMoveStart)
      map.off('idle', onIdle)
    }
  }, [map, basemap])

  /**
   * Cortar las descargas es cosa DEL DESMONTAJE Y DE NADIE MÁS, y por eso está
   * en su propio efecto con la lista de dependencias vacía.
   *
   * Estuvo en la limpieza del efecto de arriba, que depende de `basemap`, y ahí
   * hacía algo que nadie pidió: cambiar de fondo vaciaba la fila entera, así que
   * la vista de lejos del fondo anterior se quedaba a medias. Y no se recupera
   * sola —`warmed` ya lo daba por precargado—, de modo que ese fondo se quedaba
   * con agujeros hasta la siguiente recarga de la página. Es justo lo que los
   * canales de `warm.ts` existen para evitar, anulado desde fuera.
   */
  useEffect(() => stopWarming, [])
}
