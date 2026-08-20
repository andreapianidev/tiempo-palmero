/**
 * Repartir el sitio en la pantalla: quién se ve entero y quién se colapsa.
 *
 * EL PROBLEMA. Con 36 estaciones sobre una isla de 42 km, a zoom bajo los pins
 * se pisan unos a otros y tapan los nombres de los pueblos. El mapa deja de
 * leerse justo en la vista que más se usa, que es la de la isla entera.
 *
 * LA REGLA. Se recorre todo lo que compite —pastillas de estación, cámaras de
 * incendio, webcams y topónimos— por prioridad, reservando un rectángulo por
 * cada uno que sobrevive; el que choca con algo ya colocado se colapsa a un
 * punto, que sigue siendo pinchable y sigue diciendo dónde hay un sensor. Los
 * pins mandan sobre los topónimos: el dato es el contenido, el nombre es el
 * contexto.
 *
 * POR QUÉ ES UN FICHERO Y NO PARTE DE LOS MARCADORES. Porque no es de los
 * marcadores. Reparte cuatro listas que llenan tres bloques distintos —el
 * gancho de los marcadores del DOM llena tres, y los topónimos, que se dibujan
 * en otro sitio, la cuarta—, y ponerlo dentro de cualquiera de ellos habría
 * hecho que ese bloque supiera de los demás. Recibe las refs y no las crea.
 *
 * LO QUE DEVUELVE es una función para pedir una pasada. Va envuelta en una ref
 * por dentro: los manejadores de `move` y `zoom` se registran una vez y tienen
 * que ver siempre la última versión del cálculo, no la del render en que se
 * engancharon.
 */

import { useEffect, useRef, type MutableRefObject } from 'react'
import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { place, pillRank, RANK, type Box, type DeclutterItem } from '../../lib/declutter'
import { markerSize } from '../markers/size'
import { hiddenByRelief, type Camera } from '../../lib/occlusion'
import { elevationAt } from '../../lib/dem'
import type { FireMarker, PillMarker, Props, WebcamMarker } from './types'

/**
 * El rectángulo que un marcador ocupa en pantalla.
 *
 * SOLO LEE. Antes escribía —deshacía el encogido y forzaba la visibilidad—
 * justo antes de preguntar por el tamaño, y escribir y leer alternándose
 * obliga al navegador a recalcular el diseño de la página entera entre cada
 * par: 249 recálculos por pasada para averiguar unos anchos que no cambian.
 * El tamaño lo recuerda ahora `markers/size.ts`, que lo mide una vez.
 */
function box(map: MlMap, el: HTMLElement, lon: number, lat: number): Box {
  const pt = map.project([lon, lat])
  const { w, h } = markerSize(el)
  return { x: pt.x, y: pt.y, w, h }
}

export interface DeclutterRefs {
  map: MutableRefObject<MlMap | null>
  pills: MutableRefObject<PillMarker[]>
  fires: MutableRefObject<FireMarker[]>
  webcams: MutableRefObject<WebcamMarker[]>
  placeMarkers: MutableRefObject<maplibregl.Marker[]>
}

/** Devuelve la función que pide una pasada de reparto. */
export function useDeclutter(ready: boolean, props: Props, refs: DeclutterRefs): () => void {
  const { dem } = props
  const {
    map: mapRef,
    pills: pillsRef,
    fires: firesRef,
    webcams: webcamsRef,
    placeMarkers: placeMarkersRef,
  } = refs

  /**
   * Resuelve solapamientos entre pins de estación y topónimos.
   *
   * Con 36 estaciones sobre una isla de 42 km, a zoom bajo los pins se pisan
   * unos a otros y tapan los nombres de los pueblos: el mapa deja de leerse
   * justo en la vista que más se usa. Se recorren por prioridad —altitud para
   * los pins, categoría para los topónimos— reservando un rectángulo por cada
   * uno que sobrevive; el que choca con algo ya colocado se colapsa a un punto,
   * que sigue siendo pinchable y sigue diciendo dónde hay un sensor.
   *
   * Los pins mandan sobre los topónimos: el dato es el contenido, el nombre es
   * el contexto.
   */
  const declutterImpl = () => {
    const map = mapRef.current
    if (!map) return

    const els: HTMLElement[] = []
    const items: DeclutterItem[] = []
    /** Los que no se reparten porque hay montaña delante. Ver más abajo. */
    const behind: HTMLElement[] = []

    /**
     * ¿Hay relieve entre la cámara y este punto?
     *
     * Solo con la vista inclinada: en plano la cámara mira desde arriba y no
     * hay nada que se pueda poner delante de nada.
     *
     * Esta es la mitad visible del cambio que quitó los 1.694 ms de espera a la
     * GPU por cada seis segundos de vista 3D. La comprobación la hacía MapLibre
     * marcador a marcador leyendo el búfer de profundidad; ahora se hace aquí,
     * con el modelo de elevación que ya está en memoria, en la misma pasada que
     * reparte los solapamientos. El porqué completo, con las cifras medidas,
     * está en `lib/occlusion.ts`.
     *
     * Un punto tapado se ESCONDE y no compite por el sitio: dejarlo en el
     * reparto haría que un dato invisible desalojara a uno que sí se ve.
     */
    const camera: Camera | null =
      props.terrain.on && dem
        ? (() => {
            const c = map.transform.getCameraPosition()
            return { lon: c.lngLat.lng, lat: c.lngLat.lat, altitude: c.altitude }
          })()
        : null

    const covered = (lon: number, lat: number, elevation?: number): boolean => {
      if (!camera || !dem) return false
      const z = elevation ?? elevationAt(dem, lon, lat) ?? 0
      return hiddenByRelief(dem, camera, { lon, lat, elevation: z }, props.terrain.exaggeration)
    }

    /**
     * Las cámaras de incendio entran en el reparto, que hasta ahora no lo
     * hacían: se pintaban con `z-index` 50 por encima de todo, y un triángulo
     * de aviso caído sobre una pastilla se leía como parte de la cifra. La
     * prioridad de cada clase de marcador está en `lib/declutter`.
     */
    for (const f of firesRef.current) {
      if (covered(f.lon, f.lat)) {
        behind.push(f.el)
        continue
      }
      els.push(f.el)
      items.push({
        rank: f.alert ? RANK.fireAlert : RANK.fireQuiet,
        collapsible: false,
        box: box(map, f.el, f.lon, f.lat),
      })
    }
    for (const m of placeMarkersRef.current) {
      const el = m.getElement()
      const ll = m.getLngLat()
      if (covered(ll.lng, ll.lat)) {
        behind.push(el)
        continue
      }
      const major = el.classList.contains('mk-place-city') || el.classList.contains('mk-place-town')
      els.push(el)
      items.push({
        rank: major ? RANK.placeMajor : RANK.placeMinor,
        collapsible: false,
        box: box(map, el, ll.lng, ll.lat),
      })
    }
    const maxElev = Math.max(1, ...pillsRef.current.map((p) => p.priority))
    for (const p of pillsRef.current) {
      // La pastilla de una estación sí sabe su cota de verdad —la publica el
      // Cabildo— y se le pasa: consultar el DEM en su lugar movería el punto de
      // salida del rayo unos metros justo donde más se nota, en una estación
      // asomada al borde de una pared.
      if (covered(p.lon, p.lat, p.elevation)) {
        behind.push(p.el)
        continue
      }
      els.push(p.el)
      items.push({
        rank: pillRank(p.priority, maxElev),
        collapsible: true,
        box: box(map, p.el, p.lon, p.lat),
      })
    }

    /*
     * Las webcams SÍ entran en el reparto, y no lo hacían.
     *
     * El razonamiento para dejarlas fuera era que amontonarse es cuestión de
     * legibilidad y que siete de ellas caen dentro del recinto del
     * observatorio, así que repartirlas dejaría el Roque con un icono. Estaba
     * mal: lo que se amontona no son ellas entre sí, es cada una contra las
     * pastillas de las estaciones, y el pin es un cuadrado macizo que no estorba
     * la cifra sino que la tacha. Salió «2◉4°» en Tirimaga. En el Roque se
     * apilan a zoom bajo y se separan al acercarse, que es lo que hacen todas.
     *
     * No son plegables: una webcam encogida a un punto se leería como un sensor
     * más, y un punto no enseña ninguna foto.
     */
    for (const w of webcamsRef.current) {
      if (covered(w.lon, w.lat)) {
        behind.push(w.el)
        continue
      }
      els.push(w.el)
      items.push({ rank: RANK.webcam, collapsible: false, box: box(map, w.el, w.lon, w.lat) })
    }

    const placement = place(items)
    // Las escrituras van TODAS al final, después de la última lectura. Mezclarlas
    // con las consultas de posición devolvería el recálculo de diseño por
    // marcador que `markers/size.ts` acaba de quitar de en medio.
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      el.classList.toggle('mk-pill-dot', placement[i] === 'dot')
      // Detrás de la montaña se esconde entero, no se atenúa: un pin medio
      // transparente sobre una ladera sigue leyéndose como un dato de ESA
      // ladera, que es justo lo que no es.
      el.style.visibility =
        placement[i] === 'hidden' ? 'hidden' : 'visible'
    }
    for (const el of behind) el.style.visibility = 'hidden'
  }

  // Se guarda en una ref y se refresca en cada render: los listeners del mapa
  // se registran una sola vez y siempre acaban llamando a la versión que ve los
  // marcadores actuales.
  const declutterRef = useRef<() => void>(declutterImpl)
  declutterRef.current = declutterImpl
  const declutter = () => declutterRef.current()

  /**
   * Cada cuánto se rehace el reparto mientras la cámara se mueve, en ms.
   *
   * ANTES NO HABÍA NINGUNO, y no por decisión: el planificador cancelaba su
   * propio fotograma pendiente en cada evento `move`, así que durante un
   * arrastre continuo —que emite un `move` por fotograma— la pasada no llegaba
   * a ejecutarse casi nunca. Medido en producción, un arrastre de seis segundos
   * disparaba dos pasadas. Funcionaba de casualidad y como un límite escondido.
   *
   * Ahora el límite es explícito y va en la otra dirección: se COALESCE por
   * fotograma —varios `move` seguidos son una sola pasada— pero se deja de
   * posponer indefinidamente. 60 ms es el paso en el que la oclusión por
   * relieve sigue el giro de la cámara sin que se vea el retraso, y son ~16
   * pasadas por segundo en vez de 60: con 249 marcadores, la diferencia entre
   * ~11 ms/s de reparto y ~42 ms/s.
   */
  const DECLUTTER_MS = 60

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let raf = 0
    let last = 0
    const run = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const now = performance.now()
        if (now - last < DECLUTTER_MS) return
        last = now
        declutterRef.current()
      })
    }
    // Al soltar sí se rehace siempre, sin mirar el reloj: es el fotograma que
    // se queda en pantalla, y dejarlo con el reparto de hace 59 ms sería dejar
    // una pastilla escondida detrás de una montaña que ya no está delante.
    const settle = () => {
      last = 0
      declutterRef.current()
    }
    map.on('move', run)
    map.on('zoom', run)
    map.on('moveend', settle)
    map.on('zoomend', settle)
    settle()
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', run)
      map.off('zoom', run)
      map.off('moveend', settle)
      map.off('zoomend', settle)
    }
  }, [ready])

  // Encender o apagar la 3D cambia quién está tapado por el relieve, y eso no
  // lo provoca ningún movimiento de cámara: sin esto, los marcadores se
  // quedarían con el reparto del modo anterior hasta que alguien tocara el mapa.
  useEffect(() => {
    if (!ready) return
    declutterRef.current()
  }, [ready, props.terrain.on, props.terrain.exaggeration])


  return declutter
}
