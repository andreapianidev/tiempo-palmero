/**
 * Los marcadores del DOM: estaciones, sensores, cámaras, aforos y webcams.
 *
 * POR QUÉ SON MARCADORES DEL DOM Y NO UNA CAPA `symbol`. Son pocos —decenas—, y
 * como elementos del DOM se pueden estilar con CSS y leerlos un lector de
 * pantalla. Una capa de símbolos de MapLibre no permite ninguna de las dos
 * cosas, y la accesibilidad de esta aplicación depende de que las cifras que se
 * ven sobre el mapa sean texto de verdad.
 *
 * SALIÓ DE `MapView.tsx` Y ES EL PRIMERO QUE SALE. Eran 269 líneas dentro de un
 * fichero de 2203, y era el bloque más fácil de separar de los demás: no toca
 * ninguna capa de MapLibre, solo crea elementos y los pega. La regla del
 * repositorio dice que un fichero que hace dos cosas que se explican con un
 * «y» son dos ficheros, y `MapView` hacía catorce.
 *
 * LO QUE NO SE HA MOVIDO CON ÉL. El reparto de solapamientos —`declutterImpl`—
 * sigue en `MapView`, porque no es de los marcadores: es de todo lo que compite
 * por el sitio, incluidos los topónimos, que se dibujan en otro bloque. Este
 * gancho llena las tres listas —`pills`, `fires`, `webcams`— y el que reparte
 * las lee. Por eso las refs llegan de fuera en vez de vivir aquí.
 */

import { useEffect, type MutableRefObject } from 'react'
import maplibregl, { type Map as MlMap } from 'maplibre-gl'
import { isBundleVariable, pinLabel } from '../../lib/variables'
import { cssColor, co2Band, FRESHNESS_COLOR } from '../../lib/palette'
import { freshness, stationReading } from '../../lib/quality'
import { markerSize } from '../markers/size'
import { silenceDepthProbe } from '../markers/depthProbe'
import { counterMarkerElement } from '../counters/CounterMarker'
import { webcamMarkerElement } from '../webcams/WebcamMarker'
import { WEBCAM_SITES } from '../../lib/webcams/catalog'
import { fallbackReading } from '../../lib/station-fallback'
import { n0, t } from '../../i18n'
import type { FireMarker, PillMarker, Props, WebcamMarker } from './types'

export interface DomMarkerRefs {
  map: MutableRefObject<MlMap | null>
  /**
   * Repartir los solapamientos. Llega como función y no como la ref de dentro
   * porque quien la implementa es `MapView` —el reparto no es de los
   * marcadores, es de todo lo que compite por el sitio— y este gancho solo
   * necesita poder pedir una pasada cuando acaba de crearlos.
   */
  declutter: () => void
  markers: MutableRefObject<maplibregl.Marker[]>
  /** Las pastillas de estación, para que otro reparta los solapamientos. */
  pills: MutableRefObject<PillMarker[]>
  fires: MutableRefObject<FireMarker[]>
  webcams: MutableRefObject<WebcamMarker[]>
  /** Las devoluciones de llamada, leídas por ref para no recrear manejadores. */
  handlers: MutableRefObject<Props>
}

export function useDomMarkers(ready: boolean, props: Props, refs: DomMarkerRefs): void {
  const { models, variable, stops, stations, visible } = props
  const model = models.temperature
  /**
   * Los pines son de las estaciones del Cabildo, que no miden CO₂. Con esa
   * variable elegida siguen enseñando la temperatura en vez de vaciarse: son la
   * otra mitad de lo que está en pantalla, y quedarían en blanco por una
   * decisión que no va con ellos.
   */
  const pinVariable = isBundleVariable(variable) ? variable : 'temperature'
  const {
    declutter,
    map: mapRef,
    markers: markersRef,
    pills: pillsRef,
    fires: firesRef,
    webcams: webcamsRef,
    handlers,
  } = refs

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
      // Después de `addTo`, que es quien encola la primera comprobación. La
      // oclusión no se pierde: la hace `declutterImpl` con el DEM.
      silenceDepthProbe(marker)
      // Y se mide aquí, una vez, mientras la pastilla está recién puesta y
      // expandida: dentro del bucle de reparto la medición costaba un recálculo
      // de diseño de la página entera por marcador y por pasada.
      markerSize(el)
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

    const pills: {
      el: HTMLElement
      lon: number
      lat: number
      priority: number
      /** Cota publicada por el Cabildo. Los aforos no la traen. */
      elevation?: number
    }[] = []

    if (visible.stations) {
      const rejected = new Set(model?.rejected.map((r) => r.entityId) ?? [])
      // La cumbre se dibuja como una estación más porque ES una estación más:
      // mide temperatura, humedad, viento y presión, y desde `summit.ts` entra
      // en el motor igual que las demás. Se junta AQUÍ y no en `stations` para
      // no tocar ninguna de las cifras que la aplicación cuenta sobre la red
      // del Cabildo. Si el TNG no contesta, no hay pin y no hay hueco.
      for (const s of props.summit ? [...stations, props.summit] : stations) {
        // El pin enseña lo que la estación sabe de esa variable, que no es lo
        // mismo que las columnas que publica: con T y humedad el rocío está
        // determinado. Lo calculado se marca (subrayado de puntos) para que
        // siga distinguiéndose de lo medido.
        //
        // Salvo que no nos creamos a la estación. Entonces su propia lectura no
        // se pinta —ni siquiera en gris, porque un número gris sigue siendo un
        // número— y en su lugar va la estimación del modelo, con tilde delante
        // para que no pueda confundirse con una medida. Ver `station-fallback`.
        const faulty = props.health.get(s.entityId)?.faulty === true
        const fallback = faulty ? fallbackReading(models, s, pinVariable) : null
        const reading = faulty ? null : stationReading(s, pinVariable)
        const isRejected = rejected.has(s.entityId)

        const shown = reading ?? fallback
        // La cifra y su unidad salen de `pinLabel`, en el catálogo compartido,
        // no de un ternario escrito aquí: con la regla vieja el VPD —que va en
        // kPa con dos decimales— habría salido «2,9°». La tilde de delante sí
        // es de este mapa, porque solo aquí hay estimaciones que no son medidas.
        const label =
          shown === null
            ? faulty
              ? '⚠'
              : '·'
            : `${fallback ? '~' : ''}${pinLabel(pinVariable, shown.value)}`

        const muted = shown === null || isRejected || faulty
        const el = pill(
          label,
          muted ? '#4a453f' : cssColor(stops, shown.value),
          muted ? '#cfc9c1' : '#141311',
        )
        if (isRejected) el.classList.add('mk-rejected')
        if (faulty) {
          el.classList.add('mk-faulty')
          el.title = `${s.name} · ${t.health.faulty}${fallback ? ` · ${t.health.fallbackTag}` : ''}`
        }
        if (reading?.derived) {
          el.classList.add('mk-derived')
          el.title = `${s.name} · ${t.station.derivedValue}`
        }
        el.setAttribute(
          'aria-label',
          faulty
            ? `${s.name}, ${t.health.faulty}${fallback ? `, ${t.health.fallbackTag} ${pinLabel(pinVariable, fallback.value)}` : ''}`
            : `${s.name}, ${label}${reading?.derived ? `, ${t.point.derived}` : ''}`,
        )
        el.addEventListener('click', (ev) => {
          ev.stopPropagation()
          handlers.current.onStation(s)
        })
        // Un anillo de color según la frescura, sin ocupar sitio.
        el.style.boxShadow = `0 0 0 1.5px ${FRESHNESS_COLOR[freshness(s.ageHours)]}, 0 2px 8px rgba(0,0,0,.55)`
        add(s.lon, s.lat, el, 40)
        // Prioridad por altitud: en una isla de 2426 m las estaciones altas son
        // las que cuentan la historia, y son justo las que menos vecinas tienen.
        pills.push({ el, lon: s.lon, lat: s.lat, priority: s.elevation, elevation: s.elevation })
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

    if (visible.counters) {
      for (const site of props.counters) {
        const el = counterMarkerElement(site, {
          onClick: (s) => handlers.current.onCounter(s),
          label: (s) =>
            s.todayTotal === null
              ? t.counters.markerSilent(s.name)
              : t.counters.markerLabel(s.name, n0(s.todayTotal)),
        })
        add(site.lon, site.lat, el, 45)
        // Compiten por el sitio con las pastillas de estación, así que entran
        // en el mismo reparto. Prioridad por tráfico: donde pasa más gente es
        // donde la cifra dice algo, y los aforos de sendero son los que más se
        // solapan entre sí en la cumbre.
        pills.push({ el, lon: site.lon, lat: site.lat, priority: site.todayTotal ?? 0 })
      }
    }

    const fires: { el: HTMLElement; lon: number; lat: number; alert: boolean }[] = []

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
        // El `z-index` sigue haciendo falta —cuando dos cosas caben, la cámara
        // va delante—, pero ya no es lo único que reparte: entra en el mismo
        // sorteo que las pastillas para que no lleguen a pisarse.
        fires.push({ el, lon: f.lon, lat: f.lat, alert: f.hasAlert })
      }
    }

    // Las webcams NO entran en el REPARTO de `declutter`, al contrario que las
    // pastillas y los triángulos de incendio. Es deliberado: el reparto existe
    // para que dos CIFRAS no se pisen y se lean como una sola, y aquí no hay
    // ninguna cifra que malinterpretar. Siete de los sitios están dentro del
    // recinto del observatorio, a metros unos de otros, y esconderlos por
    // solaparse dejaría el Roque —justo donde más webcams hay— con un icono.
    // Se amontonan a zoom bajo y se separan al acercarse, como los sensores.
    //
    // La OCLUSIÓN sí la hacen, y va en `declutterImpl` con las demás.
    const cams: { el: HTMLElement; lon: number; lat: number }[] = []

    if (visible.webcams) {
      for (const site of WEBCAM_SITES) {
        const el = webcamMarkerElement(site, {
          onClick: (s) => handlers.current.onWebcam(s),
          label: (s) => `${t.webcams.title}: ${s.name}`,
        })
        add(site.lon, site.lat, el, 48)
        cams.push({ el, lon: site.lon, lat: site.lat })
      }
    }

    pillsRef.current = pills
    firesRef.current = fires
    webcamsRef.current = cams
    declutter()

    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      pillsRef.current = []
      firesRef.current = []
      webcamsRef.current = []
    }
  }, [
    ready,
    stations,
    // La cumbre llega por su cuenta, del TNG, unos segundos después que la red
    // del Cabildo. Sin esta dependencia su pin no aparecería hasta el refresco
    // siguiente, que son cinco minutos de mapa sin el punto más alto de la isla.
    props.summit,
    // El diagnóstico llega en segundo plano, después del primer pintado: sin
    // esta dependencia las averías no se marcarían hasta el refresco siguiente.
    props.health,
    models,
    model,
    variable,
    stops,
    visible.stations,
    visible.air,
    visible.co2,
    visible.sky,
    visible.fire,
    visible.counters,
    // El catálogo es estático, así que aquí solo hace falta el interruptor: no
    // hay unos datos de webcam que puedan llegar tarde y repintar.
    visible.webcams,
    props.air,
    props.co2,
    props.sky,
    props.fire,
    props.counters,
  ])

}
