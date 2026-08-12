/**
 * Mapa. MapLibre GL, estilo propio, sin proveedor externo ni clave de API.
 */

import { useEffect, useRef, useState } from 'react'
import maplibregl, { type LngLatLike, type Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildStyle, COLORS } from '../lib/mapStyle'
import { renderGrid } from '../lib/grid'
import { cssColor, co2Band, FRESHNESS_COLOR, type RgbStop } from '../lib/palette'
import { freshness, type Station } from '../lib/quality'
import type { Model, InterpolableVariable } from '../lib/interpolate'
import type { Dem } from '../lib/dem'
import type { AirStation, Co2Point, FireCamera, SkyStation } from '../hooks/useIslandData'
import type { GazetteerEntry } from '../lib/api'
import { n, n0, t } from '../i18n'

export const ISLAND_CENTER: LngLatLike = [-17.86, 28.66]

export interface LayerVisibility {
  grid: boolean
  stations: boolean
  air: boolean
  co2: boolean
  sky: boolean
  trails: boolean
  fire: boolean
}

interface Props {
  dem: Dem | null
  model: Model | null
  variable: InterpolableVariable
  stops: RgbStop[]
  stations: Station[]
  air: AirStation[]
  sky: SkyStation[]
  fire: FireCamera[]
  co2: Co2Point[]
  gazetteer: GazetteerEntry[]
  trails: unknown | null
  trailPois: unknown | null
  visible: LayerVisibility
  probe: { lon: number; lat: number } | null
  onPick: (lon: number, lat: number) => void
  onStation: (station: Station) => void
  onAir: (station: AirStation) => void
  onCo2: (sensor: Co2Point) => void
  onFire: (camera: FireCamera) => void
  onSky: (station: SkyStation) => void
}

/** Qué topónimos merecen etiqueta a cada zoom. Sin esto la isla es ilegible. */
const PLACE_MIN_ZOOM: Record<string, number> = {
  city: 8,
  town: 9.5,
  village: 11,
  suburb: 12,
  quarter: 12.5,
  neighbourhood: 12.5,
  hamlet: 13,
  locality: 13.5,
  isolated_dwelling: 14.5,
  farm: 14.5,
  plot: 15,
  square: 14.5,
}

export function MapView(props: Props) {
  const { dem, model, variable, stops, stations, visible, probe } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  // Estado, no ref: cuando el mapa termina de cargar hay que volver a ejecutar
  // los efectos que pintan malla y marcadores. Una ref no provoca re-render, y
  // con ella los datos que llegaban antes del evento `load` no se dibujaban
  // nunca — el mapa se quedaba con el contorno de la isla y nada más.
  const [ready, setReady] = useState(false)
  const markersRef = useRef<maplibregl.Marker[]>([])
  /** Pins de estación en juego, para resolver solapamientos en cada movimiento. */
  const pillsRef = useRef<{ el: HTMLElement; lon: number; lat: number; priority: number }[]>([])
  const placeMarkersRef = useRef<maplibregl.Marker[]>([])
  const probeMarkerRef = useRef<maplibregl.Marker | null>(null)
  // Los callbacks cambian en cada render; se leen desde una ref para que los
  // manejadores del mapa no haya que recrearlos (y volver a añadir listeners).
  const handlers = useRef(props)
  handlers.current = props

  // --- inicialización ------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !dem) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(dem.manifest),
      center: ISLAND_CENTER,
      zoom: 9.6,
      minZoom: 8.5,
      maxZoom: 16,
      maxBounds: [
        [-18.35, 28.15],
        [-17.4, 29.15],
      ],
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 90, unit: 'metric' }),
      'bottom-left',
    )

    map.on('load', () => {
      setReady(true)

      // Fuente de la malla interpolada. Se crea con un píxel transparente y se
      // reemplaza la imagen en cada recálculo: recrear la fuente entera hace
      // parpadear el mapa.
      map.addSource('grid', {
        type: 'image',
        url:
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        coordinates: [
          [-18.05, 28.9],
          [-17.7, 28.9],
          [-17.7, 28.4],
          [-18.05, 28.4],
        ],
      })
      map.addLayer(
        {
          id: 'grid-raster',
          type: 'raster',
          source: 'grid',
          paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 },
        },
        'municipal-boundaries',
      )

      map.addSource('trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'trails-line',
        type: 'line',
        source: 'trails',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLORS.trail,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 2.2],
        },
      })

      map.addSource('trail-pois', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 14,
      })
      map.addLayer({
        id: 'trail-pois-cluster',
        type: 'circle',
        source: 'trail-pois',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(226,197,106,0.28)',
          'circle-stroke-color': 'rgba(226,197,106,0.65)',
          'circle-stroke-width': 1,
          'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 9, 200, 22],
        },
      })
      map.addLayer({
        id: 'trail-pois-point',
        type: 'circle',
        source: 'trail-pois',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': 'rgba(226,197,106,0.85)',
          'circle-radius': 3,
          'circle-stroke-color': 'rgba(0,0,0,0.6)',
          'circle-stroke-width': 0.8,
        },
      })

      map.on('click', (e) => {
        // Un clic sobre un pin ya lo gestiona el propio marcador.
        const hits = map.queryRenderedFeatures(e.point, { layers: ['trail-pois-cluster'] })
        if (hits.length) return
        handlers.current.onPick(e.lngLat.lng, e.lngLat.lat)
      })
      map.getCanvas().style.cursor = 'crosshair'
    })

    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [dem])

  // --- malla interpolada ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !dem) return
    const src = map.getSource('grid') as maplibregl.ImageSource | undefined
    if (!src) return

    if (!visible.grid || !model) {
      map.setLayoutProperty('grid-raster', 'visibility', 'none')
      return
    }
    map.setLayoutProperty('grid-raster', 'visibility', 'visible')

    const grid = renderGrid(dem, model, stops)
    const [[w, s], [e, nth]] = grid.bounds
    try {
      src.updateImage({
        url: grid.canvas.toDataURL(),
        coordinates: [
          [w, nth],
          [e, nth],
          [e, s],
          [w, s],
        ],
      })
    } catch (err) {
      // `updateImage` aborta la carga anterior si aún estaba en vuelo. Es el
      // comportamiento correcto —gana la malla más reciente— pero lo señala
      // lanzando un AbortError que aquí no significa nada.
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
    }
  }, [ready, dem, model, stops, visible.grid])

  // --- capas GeoJSON estáticas --------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (props.trails) {
      ;(map.getSource('trails') as maplibregl.GeoJSONSource | undefined)?.setData(
        props.trails as GeoJSON.FeatureCollection,
      )
    }
    if (props.trailPois) {
      ;(map.getSource('trail-pois') as maplibregl.GeoJSONSource | undefined)?.setData(
        props.trailPois as GeoJSON.FeatureCollection,
      )
    }
  }, [ready, props.trails, props.trailPois])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const vis = visible.trails ? 'visible' : 'none'
    for (const id of ['trails-line', 'trail-pois-cluster', 'trail-pois-point']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [ready, visible.trails])

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

    const taken: { x: number; y: number; w: number; h: number }[] = []
    const collides = (x: number, y: number, w: number, h: number) =>
      taken.some(
        (r) =>
          Math.abs(r.x - x) < (r.w + w) / 2 + 3 && Math.abs(r.y - y) < (r.h + h) / 2 + 2,
      )

    interface Item {
      el: HTMLElement
      lon: number
      lat: number
      rank: number
      /** Los pins se colapsan a un punto; las etiquetas se ocultan del todo. */
      collapsible: boolean
    }

    const items: Item[] = []

    // Los topónimos de primer orden van ANTES que los pins. Perder «Santa Cruz
    // de La Palma» para ganar un grado más en pantalla deja un mapa bonito en
    // el que nadie sabe dónde está.
    for (const m of placeMarkersRef.current) {
      const el = m.getElement()
      const ll = m.getLngLat()
      const major = el.classList.contains('mk-place-city') || el.classList.contains('mk-place-town')
      items.push({ el, lon: ll.lng, lat: ll.lat, rank: major ? 0 : 2, collapsible: false })
    }
    // Pins, por altitud descendente: en una isla de 2426 m las estaciones altas
    // son las que cuentan la historia y las que menos vecinas tienen.
    const maxElev = Math.max(1, ...pillsRef.current.map((p) => p.priority))
    for (const p of pillsRef.current) {
      items.push({
        el: p.el,
        lon: p.lon,
        lat: p.lat,
        rank: 1 + (1 - p.priority / maxElev) * 0.9,
        collapsible: true,
      })
    }

    items.sort((a, b) => a.rank - b.rank)

    for (const it of items) {
      const pt = map.project([it.lon, it.lat])
      // Se mide siempre expandido: si se midiera colapsado, el ancho sería el
      // del punto y el pin nunca volvería a abrirse al alejar los vecinos.
      it.el.classList.remove('mk-pill-dot')
      it.el.style.visibility = 'visible'
      const w = it.el.offsetWidth || 44
      const h = it.el.offsetHeight || 18

      if (!collides(pt.x, pt.y, w, h)) {
        taken.push({ x: pt.x, y: pt.y, w, h })
        continue
      }
      if (it.collapsible) {
        it.el.classList.add('mk-pill-dot')
        // Aun colapsado ocupa sitio: dos puntos encima del otro son un punto.
        if (!collides(pt.x, pt.y, 12, 12)) taken.push({ x: pt.x, y: pt.y, w: 12, h: 12 })
        else it.el.style.visibility = 'hidden'
      } else {
        it.el.style.visibility = 'hidden'
      }
    }
  }

  // Se guarda en una ref y se refresca en cada render: los listeners del mapa
  // se registran una sola vez y siempre acaban llamando a la versión que ve los
  // marcadores actuales.
  const declutterRef = useRef<() => void>(declutterImpl)
  declutterRef.current = declutterImpl
  const declutter = () => declutterRef.current()

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let raf = 0
    const run = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => declutterRef.current())
    }
    map.on('move', run)
    map.on('zoom', run)
    run()
    return () => {
      cancelAnimationFrame(raf)
      map.off('move', run)
      map.off('zoom', run)
    }
  }, [ready])

  // --- marcadores del DOM --------------------------------------------------
  // Estaciones, sensores y topónimos son pocos (decenas), y como marcadores del
  // DOM se pueden estilar con CSS y leer con un lector de pantalla, cosa que
  // una capa `symbol` no permite.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const add = (lon: number, lat: number, el: HTMLElement, zIndex = 1) => {
      el.style.zIndex = String(zIndex)
      const marker = new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map)
      markersRef.current.push(marker)
    }

    const pill = (text: string, background: string, color = '#141311') => {
      const el = document.createElement('button')
      el.className = 'mk-pill'
      el.textContent = text
      el.style.background = background
      el.style.color = color
      el.type = 'button'
      return el
    }

    const pills: { el: HTMLElement; lon: number; lat: number; priority: number }[] = []

    if (visible.stations) {
      const rejected = new Set(model?.rejected.map((r) => r.entityId) ?? [])
      for (const s of stations) {
        const value =
          variable === 'temperature'
            ? s.temperature
            : variable === 'relativehumidity'
              ? s.relativehumidity
              : s.dewpoint
        const isRejected = rejected.has(s.entityId)
        const label =
          value === null
            ? '·'
            : variable === 'relativehumidity'
              ? `${Math.round(value)}%`
              : `${n(value, 1)}°`
        const el = pill(
          label,
          value === null || isRejected ? '#4a453f' : cssColor(stops, value),
          value === null || isRejected ? '#cfc9c1' : '#141311',
        )
        if (isRejected) el.classList.add('mk-rejected')
        el.setAttribute('aria-label', `${s.name}, ${label}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onStation(s)
        })
        // Un anillo de color según la frescura, sin ocupar sitio.
        el.style.boxShadow = `0 0 0 1.5px ${FRESHNESS_COLOR[freshness(s.ageHours)]}, 0 2px 8px rgba(0,0,0,.55)`
        add(s.lon, s.lat, el, 40)
        // Prioridad por altitud: en una isla de 2426 m las estaciones altas son
        // las que cuentan la historia, y son justo las que menos vecinas tienen.
        pills.push({ el, lon: s.lon, lat: s.lat, priority: s.elevation })
      }
    }

    if (visible.air) {
      for (const a of props.air) {
        if (a.ageHours > 24) continue // una AQI de hace días no dice nada de hoy
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'mk-dot mk-air'
        el.setAttribute('aria-label', `${t.air.title}: ${a.name}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onAir(a)
        })
        add(a.lon, a.lat, el, 30)
      }
    }

    if (visible.sky) {
      for (const sk of props.sky) {
        // 44 de 59 fotómetros llevan más de un mes mudos: solo se pintan vivos.
        if (Date.now() - sk.at > 24 * 3_600_000) continue
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'mk-dot mk-sky'
        el.setAttribute('aria-label', `${t.sky.title}: ${sk.name}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onSky(sk)
        })
        add(sk.lon, sk.lat, el, 25)
      }
    }

    if (visible.co2) {
      for (const c of props.co2) {
        const el = document.createElement('button')
        el.type = 'button'
        // Sin lectura fresca el punto se pinta gris y dice «sin datos». Nunca
        // se hereda el color de una lectura anterior.
        el.className = c.stale ? 'mk-dot mk-co2 mk-co2-stale' : 'mk-dot mk-co2'
        if (!c.stale && c.reading) {
          el.style.background = co2Band(c.reading.ppm).color
        }
        el.setAttribute(
          'aria-label',
          c.stale
            ? `${c.name}: ${t.co2.noData}`
            : `${c.name}: ${n0(c.reading!.ppm)} ppm`,
        )
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onCo2(c)
        })
        add(c.lon, c.lat, el, 35)
      }
    }

    if (visible.fire) {
      for (const f of props.fire) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = f.hasAlert ? 'mk-fire mk-fire-alert' : 'mk-fire'
        el.textContent = f.hasAlert ? '▲' : '△'
        el.setAttribute('aria-label', `${f.name}: ${f.hasAlert ? t.fire.alert : t.fire.noAlert}`)
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onFire(f)
        })
        add(f.lon, f.lat, el, 50)
      }
    }

    pillsRef.current = pills
    declutter()

    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      pillsRef.current = []
    }
  }, [
    ready,
    stations,
    model,
    variable,
    stops,
    visible.stations,
    visible.air,
    visible.co2,
    visible.sky,
    visible.fire,
    props.air,
    props.co2,
    props.sky,
    props.fire,
  ])

  // --- topónimos, filtrados por zoom --------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !props.gazetteer.length) return

    const render = () => {
      for (const m of placeMarkersRef.current) m.remove()
      placeMarkersRef.current = []
      const z = map.getZoom()
      const bounds = map.getBounds()
      // Orden de prioridad: primero las categorías grandes, para que en un
      // choque sobreviva «Los Llanos de Aridane» y no un caserío homónimo.
      const candidates = props.gazetteer
        .filter((p) => z >= (PLACE_MIN_ZOOM[p.kind] ?? 14) && bounds.contains([p.lon, p.lat]))
        .sort((a, b) => (PLACE_MIN_ZOOM[a.kind] ?? 14) - (PLACE_MIN_ZOOM[b.kind] ?? 14))
      for (const p of candidates) {
        const el = document.createElement('span')
        el.className = `mk-place mk-place-${p.kind}`
        el.textContent = p.name
        placeMarkersRef.current.push(
          new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map),
        )
      }
      declutter()
    }

    let timer: number | undefined
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(render, 90)
    }
    render()
    map.on('moveend', schedule)
    map.on('zoomend', schedule)
    return () => {
      window.clearTimeout(timer)
      map.off('moveend', schedule)
      map.off('zoomend', schedule)
      for (const m of placeMarkersRef.current) m.remove()
      placeMarkersRef.current = []
    }
  }, [ready, props.gazetteer])

  // --- marcador del punto consultado --------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    probeMarkerRef.current?.remove()
    probeMarkerRef.current = null
    if (!probe) return
    const el = document.createElement('div')
    el.className = 'mk-probe'
    probeMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([probe.lon, probe.lat])
      .addTo(map)
  }, [ready, probe])

  return <div ref={containerRef} className="map" />
}

export function flyTo(map: MlMap | null, lon: number, lat: number, zoom = 12.5) {
  map?.flyTo({ center: [lon, lat], zoom, duration: 700 })
}
