/**
 * La pantalla del mapa: todo lo que flota sobre la isla.
 *
 * Aquí no se calcula nada. Los datos, el modelo y la calidad de la red vienen
 * enteros de `useIslandData()`, el mismo hook que mueve la web; esta pantalla
 * decide qué se enseña y en qué orden, que es lo único que cambia entre un
 * escritorio con panel lateral y un teléfono en una mano.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { useIslandData, municipalityOf } from '@core/hooks/useIslandData'
import { elevationAt } from '@core/lib/dem'
import { estimateBundle, type Bundle, type DisplayVariable } from '@core/lib/interpolate'
import { DEWPOINT_STOPS, HUMIDITY_STOPS, TEMP_STOPS, type RgbStop } from '@core/lib/palette'
import type { Station } from '@core/lib/quality'
import { routeBounds } from '@core/lib/guagua/display'
import { t } from '@core/i18n'
import { isVariable, type LayerId } from '../layers'
import { color, font, space } from '../theme'
import { Header } from '../components/Header'
import { LayerChips } from '../components/LayerChips'
import { LayerSheet } from '../components/LayerSheet'
import { TopFade } from '../components/TopFade'
import { Fabs } from '../components/Fabs'
import { DetailSheet, SNAP } from '../components/sheet/DetailSheet'
import { IslandMap, type MapHandle } from '../map/IslandMap'
import { useGridImage } from '../hooks/useGridImage'
import { useMapIcons } from '../hooks/useMapIcons'
import { useOverlays } from '../hooks/useOverlays'
import { SheetContent, sheetHead } from '../sheets'
import type { Selection } from '../sheets/selection'
import type { PointPlace } from '../detail/PointDetail'

const STOPS: Record<DisplayVariable, RgbStop[]> = {
  temperature: TEMP_STOPS,
  relativehumidity: HUMIDITY_STOPS,
  dewpoint: DEWPOINT_STOPS,
}

export function MapScreen() {
  const insets = useSafeAreaInsets()
  const island = useIslandData()
  const overlays = useOverlays()
  const icons = useMapIcons()
  const mapHandle = useRef<MapHandle | null>(null)

  const [layer, setLayer] = useState<LayerId>('temperature')
  /** La malla siempre pinta una variable, aunque la capa activa sea el viento. */
  const [variable, setVariable] = useState<DisplayVariable>('temperature')
  const [gridOn, setGridOn] = useState(true)
  const [probe, setProbe] = useState<PointPlace | null>(null)
  const [me, setMe] = useState<{ lon: number; lat: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [sheet, setSheet] = useState(false)
  /** Alto de lo que asoma de la hoja en reposo, para no tapar los FABs. */
  const [peekHeight, setPeekHeight] = useState(110)
  /** Lo elegido en una capa superpuesta: parada, línea, sitio, aforo… */
  const [selection, setSelection] = useState<Selection | null>(null)
  const [stopsZoomReached, setStopsZoomReached] = useState(false)

  // Reloj de presentación: sin él, «hace 4 min» sigue diciendo 4 media hora
  // después. No alimenta el modelo, solo lo que se lee en pantalla.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const stops = STOPS[variable]
  const { image: grid, computing } = useGridImage(
    island.dem,
    island.models,
    variable,
    stops,
    gridOn,
  )

  const rejected = useMemo(
    () => new Set(island.models.temperature?.rejected.map((r) => r.entityId) ?? []),
    [island.models.temperature],
  )

  const bundle: Bundle | null = useMemo(() => {
    if (!probe) return null
    return estimateBundle(island.models, probe.lon, probe.lat, probe.elevation)
  }, [island.models, probe])

  const pick = useCallback(
    (lon: number, lat: number, title?: string) => {
      // La altitud sale del DEM, nunca de la API: la API no publica ninguna.
      const elevation = island.dem ? elevationAt(island.dem, lon, lat) : null
      if (elevation === null) return
      const municipality = municipalityOf(island.municipalities, lon, lat)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      // Tocar el mapa cierra la ficha de lo que hubiera elegido: la aguja nueva
      // y una parada de guagua de hace dos toques no son la misma pregunta.
      setSelection(null)
      setProbe({
        lon,
        lat,
        elevation,
        municipality: municipality ?? t.point.outsideIsland,
        title: title ?? municipality ?? t.point.title,
      })
    },
    [island.dem, island.municipalities],
  )

  const onStation = useCallback(
    (s: Station) => {
      pick(s.lon, s.lat, s.name)
      mapHandle.current?.flyTo(s.lon, s.lat, 12.5)
    },
    [pick],
  )

  const locate = useCallback(async () => {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const { longitude, latitude } = pos.coords
      setMe({ lon: longitude, lat: latitude })
      mapHandle.current?.flyTo(longitude, latitude, 12.5)
      pick(longitude, latitude, 'Mi ubicación')
    } catch {
      // Sin ubicación la app entera sigue funcionando: es un atajo, no un
      // requisito. El botón deja de parpadear y no aparece ningún diálogo.
    } finally {
      setLocating(false)
    }
  }, [pick])

  const onSelectLayer = useCallback((next: LayerId) => {
    setLayer(next)
    if (isVariable(next)) setVariable(next)
  }, [])

  /**
   * Elegir una línea: se resalta, se encuadra el recorrido entero y la hoja
   * pasa a ser la de la línea.
   *
   * El encuadre es lo que convierte «esta línea existe» en «esta línea va de
   * aquí a allá». En la web se puede ver el trazado sin mover la vista porque
   * la isla entera cabe al lado del panel; en un teléfono, no.
   */
  const showRoute = useCallback(
    (routeId: string) => {
      setSelection({ kind: 'route', routeId })
      const bounds = routeBounds(overlays.guagua.lines, routeId)
      if (bounds) mapHandle.current?.fitBounds(bounds)
    },
    [overlays.guagua.lines],
  )

  /** «El tiempo aquí»: cierra la ficha de la capa y abre la del punto. */
  const weatherAt = useCallback(
    (lon: number, lat: number, label: string) => {
      setSelection(null)
      pick(lon, lat, label)
      mapHandle.current?.flyTo(lon, lat, 13)
    },
    [pick],
  )

  const status = useMemo(() => buildStatus(island, grid, computing), [island, grid, computing])

  if (!island.dem) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.amber} />
        <Text style={styles.loadingTitle}>{t.app.name}</Text>
        <Text style={styles.loadingLine}>
          {island.demError
            ? `${t.errors.demFailed}. ${t.errors.demFailedDetail}`
            : island.demProgress
              ? t.loading.tiles(island.demProgress.done, island.demProgress.total)
              : t.loading.dem}
        </Text>
      </View>
    )
  }

  // Cambia cuando cambia lo elegido, y solo entonces: la hoja lo usa para
  // devolver la lista a su origen. Sin esto, abrir una parada después de leer
  // una ficha larga empezaba a media altura de la ficha nueva.
  const contentKey = selection
    ? `${selection.kind}:${selectionId(selection)}`
    : probe
      ? `punto:${probe.lon.toFixed(5)},${probe.lat.toFixed(5)}`
      : 'nada'

  // Lo que la hoja necesita saber del punto: dónde está y qué se estima ahí.
  const pointState = probe
    ? {
        place: probe,
        bundle,
        variable,
        stops,
        uncertainty: island.validation?.rmse ?? null,
      }
    : null

  return (
    <View style={styles.root}>
      <IslandMap
        dem={island.dem}
        grid={grid}
        gridVisible={gridOn}
        layer={layer}
        stops={stops}
        stations={island.stations}
        rejected={rejected}
        air={island.air}
        sky={island.sky}
        co2={island.co2}
        probe={probe}
        me={me}
        onPick={pick}
        onStation={onStation}
        handleRef={mapHandle}
        overlays={overlays.visible}
        icons={icons}
        guaguaLines={overlays.guagua.lines}
        guaguaStops={overlays.guagua.stops}
        guaguaRoute={selection?.kind === 'route' ? selection.routeId : null}
        places={overlays.placesData.places}
        roads={overlays.placesData.roads}
        trails={island.trails}
        trailPois={island.trailPois}
        counters={overlays.counters.sites}
        fire={island.fire}
        onSelect={(next) => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          // Elegir algo de una capa retira la aguja: la tarjeta del punto y la
          // ficha de una parada no caben a la vez en la parte de abajo.
          setProbe(null)
          setSelection(next)
        }}
        onStopsZoom={setStopsZoomReached}
      />

      <TopFade />

      <View style={[styles.top, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
        <Header status={status} />
        <View style={styles.chips}>
          <LayerChips
            active={layer}
            gridOn={gridOn}
            onSelect={onSelectLayer}
            onToggleGrid={() => setGridOn((v) => !v)}
          />
        </View>
      </View>

      {/* Los FABs se apoyan en la hoja: con la hoja subida quedan debajo de
          ella —tiene más z— y en reposo se quedan justo encima del asa. */}
      <View style={[styles.fabs, { bottom: peekHeight + 16 }]} pointerEvents="box-none">
        <Fabs
          locating={locating}
          layerCount={overlays.count}
          onLayers={() => setSheet(true)}
          onLocate={locate}
          onReset={() => {
            setProbe(null)
            setSelection(null)
            mapHandle.current?.reset()
          }}
        />
      </View>

      <DetailSheet
        head={sheetHead(selection, pointState, overlays.guagua.network)}
        openTo={SNAP.half}
        contentKey={contentKey}
        onPeekHeight={setPeekHeight}
      >
        <SheetContent
          selection={selection}
          point={pointState}
          net={overlays.guagua.network}
          countersToday={overlays.counters.today}
          firePolledAt={island.firePolledAt}
          stations={island.stations}
          models={island.models}
          census={island.census}
          validation={island.validation}
          now={now}
          onRoute={showRoute}
          onWeather={weatherAt}
        />
      </DetailSheet>

      <LayerSheet
        open={sheet}
        visible={overlays.visible}
        places={overlays.places}
        guaguaLoading={overlays.guagua.loading}
        stopsZoomReached={stopsZoomReached}
        placesLoading={overlays.placesData.loading}
        countersError={overlays.counters.error}
        onToggle={overlays.toggle}
        onTogglePlace={overlays.togglePlace}
        onClose={() => setSheet(false)}
      />

    </View>
  )
}

/** Qué distingue una selección de otra de la misma clase. */
function selectionId(selection: Selection): string {
  switch (selection.kind) {
    case 'stop':
      return selection.stop.stopId
    case 'route':
      return selection.routeId
    case 'place':
      return `${selection.place.lon},${selection.place.lat}`
    case 'poi':
      return `${selection.poi.lon},${selection.poi.lat}`
    case 'road':
      return `${selection.road.name}@${selection.lon.toFixed(4)}`
    case 'counter':
      return selection.site.id
    case 'fire':
      return selection.camera.name
  }
}

/** La línea de estado bajo el título. Ámbar lo que hay que mirar primero. */
function buildStatus(
  island: ReturnType<typeof useIslandData>,
  grid: { landCells: number } | null,
  computing: boolean,
): { text: string; strong?: boolean }[] {
  if (island.upstreamError) {
    return [{ text: t.errors.upstreamDown, strong: true }, { text: island.upstreamError }]
  }
  if (island.loading) return [{ text: t.loading.stations }]

  const used = island.models.temperature?.used.length ?? 0
  const total = island.census?.total ?? island.stations.length
  const out: { text: string; strong?: boolean }[] = [
    { text: `${used} de ${total} estaciones`, strong: true },
    { text: 'en directo' },
  ]
  if (computing) out.push({ text: 'calculando malla…' })
  else if (grid) out.push({ text: `${grid.landCells.toLocaleString('es-ES')} celdas` })
  return out
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ink },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  chips: { marginTop: 12 },
  fabs: { position: 'absolute', right: 16 },
  loading: {
    flex: 1,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: space.sheet,
  },
  loadingTitle: { fontFamily: font.bold, fontSize: 21, color: color.fg },
  loadingLine: {
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 17,
    color: color.dim,
    textAlign: 'center',
  },
})
