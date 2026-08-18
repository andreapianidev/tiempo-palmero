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
import { warmTiles } from '../lib/tiles/warm'

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
}

/**
 * AQUÍ NO SE CORTA LA PRECARGA AL DESMONTAR, y las dos veces que se intentó
 * salió mal, cada una a su manera. Queda escrito para no intentarlo una tercera.
 *
 * El primer intento la cortaba en la limpieza del efecto que depende de
 * `basemap`: cambiar de fondo vaciaba la fila entera, la vista de lejos del
 * fondo anterior se quedaba a medias y no se recuperaba sola —`warmed` ya lo
 * daba por precargado—, así que ese fondo arrastraba agujeros hasta recargar la
 * página. Justo lo que los canales de `warm.ts` existen para evitar, anulado
 * desde fuera.
 *
 * El segundo intento la movió a un efecto propio con dependencias vacías, que
 * parece lo correcto y sigue siendo un pie en una trampa: en `StrictMode` React
 * monta, limpia y vuelve a montar, así que esa limpieza se ejecuta en desarrollo
 * nada más arrancar, sobre la fila que el efecto de al lado acaba de llenar.
 *
 * Y sobre todo, no hace falta para nada: el mapa vive lo que vive la página, la
 * fila está acotada a 25 teselas y lo que se baje acaba en la caché de todos
 * modos. `stopWarming()` se queda exportada para las pruebas y para quien algún
 * día monte dos mapas en la misma página.
 */
