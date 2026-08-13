/**
 * El mapa: relieve, malla interpolada y pins.
 *
 * El estilo base es `buildStyle()` de `@core/lib/mapStyle` —el mismo relieve
 * sombreado sobre las mismas teselas terrarium que la web, sin proveedor de
 * teselas ni clave de API— y la malla entra como `ImageSource`, que es el
 * equivalente nativo de la fuente `image` que allí se actualiza a mano.
 *
 * La rotación y la inclinación están apagadas. No es una simplificación: el
 * reparto de pins proyecta las coordenadas por su cuenta para no cruzar el
 * puente 36 veces por fotograma, y esa cuenta solo vale con el norte arriba.
 */

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  Camera,
  Images,
  ImageSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type PressEvent,
} from '@maplibre/maplibre-react-native'
import type { NativeSyntheticEvent } from 'react-native'
import { buildStyle } from '@core/lib/mapStyle'
import { cssColor, co2Band, type RgbStop } from '@core/lib/palette'
import { stationReading, type Station } from '@core/lib/quality'
import { STOPS_MIN_ZOOM } from '@core/lib/guagua/display'
import type { Dem } from '@core/lib/dem'
import type { AirStation, Co2Point, FireCamera, SkyStation } from '@core/hooks/useIslandData'
import type { CounterSite } from '@core/lib/counters/model'
import { ISLAND_CENTER, ISLAND_ZOOM, MAX_ZOOM, MIN_ZOOM } from '../config'
import { pinLabel } from '@core/lib/variables'
import { isVariable, type LayerId } from '../layers'
import type { OverlayVisibility } from '../overlays'
import { color } from '../theme'
import { declutter, type DeclutterItem, type Viewport } from './declutter'
import { StationPin } from './StationPin'
import { WindPin } from './WindPin'
import { SensorDot } from './SensorDot'
import { CountersOverlay } from './overlays/CountersOverlay'
import { FireOverlay } from './overlays/FireOverlay'
import { GuaguaOverlay } from './overlays/GuaguaOverlay'
import { PlacesOverlay } from './overlays/PlacesOverlay'
import { RoadsOverlay } from './overlays/RoadsOverlay'
import { TrailsOverlay } from './overlays/TrailsOverlay'
import type { Selection } from '../sheets/selection'
import type { GridImage } from '../hooks/useGridImage'

export interface MapHandle {
  flyTo: (lon: number, lat: number, zoom?: number) => void
  reset: () => void
  /** Encuadra un rectángulo, para enseñar el recorrido entero de una línea. */
  fitBounds: (bounds: [[number, number], [number, number]]) => void
}

interface Props {
  dem: Dem
  grid: GridImage | null
  gridVisible: boolean
  layer: LayerId
  stops: RgbStop[]
  stations: Station[]
  rejected: Set<string>
  air: AirStation[]
  sky: SkyStation[]
  co2: Co2Point[]
  probe: { lon: number; lat: number } | null
  me: { lon: number; lat: number } | null
  onPick: (lon: number, lat: number) => void
  onStation: (station: Station) => void
  handleRef: React.RefObject<MapHandle | null>

  // --- capas superpuestas -------------------------------------------------
  overlays: OverlayVisibility
  /** Iconos ya rasterizados. Sin ellos no se montan las capas de símbolos. */
  icons: Record<string, string> | null
  guaguaLines: GeoJSON.FeatureCollection | null
  guaguaStops: GeoJSON.FeatureCollection | null
  /** Línea resaltada, la de la ficha abierta. */
  guaguaRoute: string | null
  places: GeoJSON.FeatureCollection
  roads: GeoJSON.FeatureCollection | null
  trails: unknown | null
  trailPois: unknown | null
  counters: CounterSite[]
  fire: FireCamera[]
  onSelect: (selection: Selection) => void
  /** Se avisa al cruzar el umbral de zoom de las paradas, no en cada fotograma. */
  onStopsZoom: (reached: boolean) => void
}

export function IslandMap({
  dem,
  grid,
  gridVisible,
  layer,
  stops,
  stations,
  rejected,
  air,
  sky,
  co2,
  probe,
  me,
  onPick,
  onStation,
  handleRef,
  overlays,
  icons,
  guaguaLines,
  guaguaStops,
  guaguaRoute,
  places,
  roads,
  trails,
  trailPois,
  counters,
  fire,
  onSelect,
  onStopsZoom,
}: Props) {
  const cameraRef = useRef<CameraRef>(null)
  const [viewport, setViewport] = useState<Viewport | null>(null)
  const size = useRef({ width: 0, height: 0 })

  useImperativeHandle(handleRef, () => ({
    flyTo: (lon: number, lat: number, zoom = 12.5) =>
      cameraRef.current?.flyTo({ center: [lon, lat], zoom, duration: 700 }),
    reset: () =>
      cameraRef.current?.flyTo({ center: ISLAND_CENTER, zoom: ISLAND_ZOOM, duration: 700 }),
    fitBounds: ([[west, south], [east, north]]) =>
      cameraRef.current?.fitBounds([west, south, east, north], {
        // Sitio para la cabecera arriba y para la hoja de la línea abajo: sin
        // margen, medio recorrido queda tapado justo por lo que lo describe.
        padding: { top: 130, right: 40, bottom: 320, left: 40 },
        duration: 700,
      }),
  }))

  const style = useMemo(() => buildStyle(dem.manifest), [dem])

  // Durante un arrastre esto llega decenas de veces por segundo, y cada vez
  // vuelve a repartir 36 pins. Se limita a uno cada 150 ms: el mapa mueve los
  // marcadores por su cuenta, así que lo único que se retrasa es el momento en
  // que una píldora tapada se colapsa a punto. Al soltar se recalcula ya sin
  // límite, con `onRegionDidChange`.
  const lastPlaced = useRef(0)
  const applyCamera = useCallback((center: [number, number], zoom: number) => {
    setViewport({ center, zoom, ...size.current })
  }, [])

  const onCameraMoving = useCallback(
    (event: { nativeEvent: { center: [number, number]; zoom: number } }) => {
      const at = Date.now()
      if (at - lastPlaced.current < 150) return
      lastPlaced.current = at
      applyCamera(event.nativeEvent.center, event.nativeEvent.zoom)
    },
    [applyCamera],
  )

  const onCameraSettled = useCallback(
    (event: { nativeEvent: { center: [number, number]; zoom: number } }) =>
      applyCamera(event.nativeEvent.center, event.nativeEvent.zoom),
    [applyCamera],
  )

  // Lo que enseña cada pin en esta capa. Se resuelve antes del reparto porque
  // el ancho del texto es lo que decide si dos pins caben.
  const pins = useMemo(() => {
    if (!isVariable(layer)) return []
    return stations.map((s) => {
      const reading = stationReading(s, layer)
      const dead = reading === null || rejected.has(s.entityId)
      const label = reading === null ? '·' : pinLabel(layer, reading.value)
      return {
        station: s,
        label,
        background: dead ? color.pillDim : cssColor(stops, reading.value),
        text: dead ? color.pillDimText : color.onLight,
      }
    })
  }, [stations, layer, stops, rejected])

  const placement = useMemo(() => {
    if (!viewport) return new Map<string, 'pill' | 'dot' | 'hidden'>()
    const items: DeclutterItem[] = pins.map((p) => ({
      id: p.station.entityId,
      lon: p.station.lon,
      lat: p.station.lat,
      // Prioridad por altitud: en una isla de 2426 m las estaciones altas son
      // las que cuentan la historia y las que menos vecinas tienen.
      priority: p.station.elevation,
      label: p.label,
    }))
    return declutter(items, viewport)
  }, [pins, viewport])

  const handlePress = useCallback(
    (event: NativeSyntheticEvent<PressEvent>) => {
      const [lon, lat] = event.nativeEvent.lngLat
      onPick(lon, lat)
    },
    [onPick],
  )

  // Cruzar el umbral de zoom de las paradas se avisa una sola vez por cruce, no
  // en cada fotograma: la hoja de capas necesita saberlo para no dejar una
  // casilla marcada sobre un mapa que no cambia, y nada más.
  const crossed = useRef<boolean | null>(null)
  useEffect(() => {
    if (!viewport) return
    const reached = viewport.zoom >= STOPS_MIN_ZOOM
    if (crossed.current === reached) return
    crossed.current = reached
    onStopsZoom(reached)
  }, [viewport, onStopsZoom])

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        size.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        }
        setViewport((v) => (v ? { ...v, ...size.current } : v))
      }}
    >
      <MapLibreMap
        style={StyleSheet.absoluteFill}
        mapStyle={style}
        attribution={false}
        logo={false}
        compass={false}
        scaleBar={false}
        touchRotate={false}
        touchPitch={false}
        onPress={handlePress}
        onRegionIsChanging={onCameraMoving}
        onRegionDidChange={onCameraSettled}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: ISLAND_CENTER, zoom: ISLAND_ZOOM }}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          maxBounds={[-18.35, 28.15, -17.4, 29.15]}
        />

        {/* La malla va por debajo de los límites municipales, como en la web:
            el color de fondo no debe tapar lo que sitúa lo que se mira. */}
        {grid && gridVisible && (
          <ImageSource id="grid" url={grid.uri} coordinates={grid.coordinates}>
            <Layer
              id="grid-raster"
              type="raster"
              beforeId="municipal-boundaries"
              paint={{ 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 }}
            />
          </ImageSource>
        )}

        {/* Los iconos, antes que cualquier capa que los use: una capa de
            símbolos cuyas imágenes no existen se pinta vacía. */}
        {icons && <Images images={icons} />}

        {/* El orden es el de la web y no es cosmético. Las carreteras son el
            fondo sobre el que se leen las demás, así que van debajo de todo; la
            red de guaguas va debajo de los puntos de interés, porque donde un
            sendero y una línea se cruzan lo que hay que poder tocar es el
            punto, que es un sitio. */}
        <RoadsOverlay
          roads={roads}
          visible={overlays.roads}
          onRoad={(road, lon, lat) => onSelect({ kind: 'road', road, lon, lat })}
        />

        <PlacesOverlay
          places={places}
          icons={icons}
          onPlace={(place) => onSelect({ kind: 'place', place })}
        />

        <GuaguaOverlay
          lines={guaguaLines}
          stops={guaguaStops}
          visible={overlays.guagua}
          route={guaguaRoute}
          onStop={(stop) => onSelect({ kind: 'stop', stop })}
          onRoute={(routeId) => onSelect({ kind: 'route', routeId })}
        />

        <TrailsOverlay
          trails={trails}
          pois={trailPois}
          icons={icons}
          visible={overlays.trails}
          onPoi={(poi) => onSelect({ kind: 'poi', poi })}
        />

        {/* El pin tapado NO se monta con contenido vacío: un `Marker` sin
            hijos hace que MapLibre dibuje encima su chincheta roja de serie, y
            el mapa acaba con marcas que la aplicación nunca ha pedido. */}
        {isVariable(layer) &&
          pins
            .map((p) => ({ ...p, state: placement.get(p.station.entityId) ?? 'pill' }))
            .filter((p): p is typeof p & { state: 'pill' | 'dot' } => p.state !== 'hidden')
            .map((p) => (
              <Marker key={p.station.entityId} lngLat={[p.station.lon, p.station.lat]}>
                <StationPin
                  label={p.label}
                  background={p.background}
                  text={p.text}
                  ageHours={p.station.ageHours}
                  state={p.state}
                  onPress={() => onStation(p.station)}
                  accessibilityLabel={`${p.station.name}, ${p.label}`}
                />
              </Marker>
            ))}

        {layer === 'wind' &&
          stations
            .filter((s) => s.windspeed !== null)
            .map((s) => (
              <Marker key={s.entityId} lngLat={[s.lon, s.lat]}>
                <WindPin
                  speedKmh={s.windspeed!}
                  direction={s.winddirection}
                  onPress={() => onStation(s)}
                  accessibilityLabel={`${s.name}, ${Math.round(s.windspeed!)} km/h`}
                />
              </Marker>
            ))}

        {layer === 'air' &&
          air
            // Una calidad del aire de hace días no dice nada de hoy.
            .filter((a) => a.ageHours <= 24)
            .map((a) => (
              <Marker key={a.entityId} lngLat={[a.lon, a.lat]}>
                <SensorDot
                  fill={
                    a.index === null
                      ? color.faint
                      : a.index < 50
                        ? color.ok
                        : a.index < 100
                          ? color.warn
                          : color.bad
                  }
                  onPress={() => onPick(a.lon, a.lat)}
                  accessibilityLabel={a.name}
                />
              </Marker>
            ))}

        {layer === 'co2' &&
          co2.map((c) => (
            <Marker key={`co2-${c.id}`} lngLat={[c.lon, c.lat]}>
              <SensorDot
                fill={c.reading ? co2Band(c.reading.ppm).color : color.faint}
                stale={c.stale}
                onPress={() => onPick(c.lon, c.lat)}
                accessibilityLabel={c.name}
              />
            </Marker>
          ))}

        {layer === 'sky' &&
          sky
            // 44 de 59 fotómetros llevan más de un mes mudos: solo los vivos.
            .filter((s) => Date.now() - s.at < 24 * 3_600_000)
            .map((s) => (
              <Marker key={s.entityId} lngLat={[s.lon, s.lat]}>
                <SensorDot
                  fill="#4a6fbf"
                  onPress={() => onPick(s.lon, s.lat)}
                  accessibilityLabel={s.name}
                />
              </Marker>
            ))}

        {/* Los aforos y las cámaras son marcadores y no capas: son diecisiete y
            cuatro, llevan una cifra o un glifo dentro, y eso se dibuja mucho
            mejor con una vista que con un símbolo del estilo. */}
        <CountersOverlay
          sites={counters}
          visible={overlays.counters}
          onSite={(site) => onSelect({ kind: 'counter', site })}
        />

        <FireOverlay
          cameras={fire}
          visible={overlays.fire}
          onCamera={(camera) => onSelect({ kind: 'fire', camera })}
        />

        {probe && (
          <Marker lngLat={[probe.lon, probe.lat]}>
            <View style={styles.probe} pointerEvents="none" />
          </Marker>
        )}

        {me && (
          <Marker lngLat={[me.lon, me.lat]}>
            <View style={styles.me} pointerEvents="none" />
          </Marker>
        )}
      </MapLibreMap>
    </View>
  )
}

const styles = StyleSheet.create({
  probe: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: color.fg,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  me: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: color.me,
    borderWidth: 2.5,
    borderColor: '#fff',
  },
})
