/**
 * La caché de teselas, enchufada al mapa.
 *
 * Cuatro cosas, y todas cuelgan de que el mapa esté quieto:
 *
 *  1. **Al encender un fondo externo**, se precarga la vista de lejos de la
 *     isla —17 teselas, ver `budget.ts`—. Solo la primera vez y solo de ese
 *     fondo: `basemaps.ts` promete que quien no toque el selector no gasta ni
 *     una petición fuera de casa, y esa promesa sigue en pie.
 *  2. **Cuando el mapa se para después de moverse**, se precarga el borde por
 *     el que se venía saliendo y, si el nivel de tesela acaba de subir, las
 *     cuatro hijas de la del centro — el paso siguiente del zoom.
 *  3. **Se apunta el encuadre** donde ha quedado el mapa, que es lo que el
 *     selector de fondos necesita para precargar por intención sin tener el
 *     mapa delante. Ver `tiles/intent.ts`.
 *  4. **De vez en cuando**, se purga lo caducado y lo que pase del techo.
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
import { rememberView } from '../lib/tiles/intent'
import { leadingEdgeTiles, overviewTiles, zoomInTiles } from '../lib/tiles/prefetch'
import { sweep } from '../lib/tiles/store'
import { warmTiles } from '../lib/tiles/warm'

/** Cada cuánto se purga, como mucho: una vez por sesión y cada media hora. */
const SWEEP_EVERY_MS = 30 * 60 * 1000

export function useTileCache(map: MapLibreMap | null, basemap: BasemapId): void {
  const warmed = useRef(new Set<BasemapId>())
  const lastCenter = useRef<{ lon: number; lat: number } | null>(null)
  /**
   * El zoom del ANTERIOR reposo, no el de `movestart`.
   *
   * Y es la diferencia entre que esto funcione o no. `map.jumpTo()` actualiza
   * la cámara ANTES de disparar `movestart`, así que un salto instantáneo deja
   * el «zoom de antes» ya valiendo el de después y el escalón no se ve nunca.
   * Pasa con `jumpTo` y con cualquier cosa que mueva el mapa sin animación —el
   * mando a distancia, una vista restaurada—. Comparando reposo contra reposo
   * da igual cómo se haya movido: el escalón está en los dos números.
   *
   * Y NO SE FILTRA POR `originalEvent` para pedirlo solo cuando se ha movido
   * una persona, que es lo primero que se intenta. No funciona: la rueda del
   * ratón termina en una transición inercial que MapLibre anima él solo, así
   * que ni su `moveend` ni su `movestart` la traen. Se probó de las dos formas
   * el 18 de agosto de 2026 con `scripts/checks/precarga-intencion.ts` girando
   * la rueda de verdad, y con las dos el escalón se veía y el gesto no: la
   * precarga se quedaba apagada sin decirlo. Un filtro que no distingue lo que
   * dice distinguir es peor que no tenerlo.
   */
  const zoomAnterior = useRef<number | null>(null)
  const lastSweep = useRef(0)

  // 1. La vista de lejos, al estrenar un fondo externo.
  useEffect(() => {
    const source = BASEMAPS[basemap].source
    if (!source?.tiles?.length || warmed.current.has(basemap)) return
    warmed.current.add(basemap)
    warmTiles('lejos', source.tiles[0], overviewTiles(ISLAND_BBOX))
  }, [basemap])

  // 2. El borde y el paso siguiente del zoom, 3. el encuadre y 4. la purga.
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

      // El encuadre se apunta SIEMPRE, también con el fondo de casa puesto y
      // también si el mapa no se ha movido: quien lo va a usar es el selector,
      // para precargar el fondo que todavía no está encendido.
      const b = map.getBounds()
      const vista = {
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
        zoom: map.getZoom(),
      }
      rememberView(vista)

      const from = lastCenter.current
      lastCenter.current = null
      const desdeZoom = zoomAnterior.current
      zoomAnterior.current = vista.zoom
      const source = BASEMAPS[basemap].source
      if (!from || !source?.tiles?.length) return

      const minz = source.minzoom ?? 0
      const maxz = source.maxzoom ?? 22
      const z = rasterTileZoom(vista.zoom, minz, maxz)
      const enTesela = { ...vista, zoom: z }

      // El paso siguiente del zoom, y solo si el nivel de tesela ACABA de
      // subir: se compara el nivel del reposo anterior con el de ahora, así que
      // no hace falta ningún umbral sobre un zoom de cámara que es continuo y
      // tiembla. Quien acaba de subir un escalón casi siempre sube otro.
      const acercandose = desdeZoom !== null && z > rasterTileZoom(desdeZoom, minz, maxz)
      const siguiente = acercandose ? zoomInTiles(enTesela, maxz) : []
      const borde = leadingEdgeTiles(from, enTesela)

      // Las dos van en UNA llamada y en el mismo canal a propósito. En el mismo
      // canal porque un movimiento nuevo deja sin sentido las dos anticipaciones
      // a la vez; en una sola llamada porque `warmTiles` vacía la fila del canal
      // al entrar, así que en dos llamadas la segunda tiraría a la primera.
      // Peor caso de una parada: 4 + 8 teselas, 2,8 MB a la mediana medida.
      const todas = [...siguiente, ...borde]
      if (todas.length) warmTiles('borde', source.tiles[0], todas)
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
 * fila está acotada —17 de la vista de lejos, 12 del borde y el zoom, 24 de la
 * intención del selector: 53 en el peor caso, y solo si las tres coinciden— y lo
 * que se baje acaba en la caché de todos modos. `stopWarming()` se queda
 * exportada para las pruebas y para quien algún día monte dos mapas en la misma
 * página.
 */
