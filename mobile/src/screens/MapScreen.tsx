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
import {
  DEWPOINT_STOPS,
  HUMIDITY_STOPS,
  TEMP_STOPS,
  cssColor,
  type RgbStop,
} from '@core/lib/palette'
import type { Station } from '@core/lib/quality'
import { n, n0, t } from '@core/i18n'
import { isVariable, type LayerId } from '../layers'
import { color, font, space } from '../theme'
import { Header } from '../components/Header'
import { LayerChips } from '../components/LayerChips'
import { TopFade } from '../components/TopFade'
import { Fabs } from '../components/Fabs'
import { PeekCard } from '../components/PeekCard'
import { IslandMap, type MapHandle } from '../map/IslandMap'
import { useGridImage } from '../hooks/useGridImage'
import { DetailScreen, type DetailPoint } from './DetailScreen'

const STOPS: Record<DisplayVariable, RgbStop[]> = {
  temperature: TEMP_STOPS,
  relativehumidity: HUMIDITY_STOPS,
  dewpoint: DEWPOINT_STOPS,
}

export function MapScreen() {
  const insets = useSafeAreaInsets()
  const island = useIslandData()
  const mapHandle = useRef<MapHandle | null>(null)

  const [layer, setLayer] = useState<LayerId>('temperature')
  /** La malla siempre pinta una variable, aunque la capa activa sea el viento. */
  const [variable, setVariable] = useState<DisplayVariable>('temperature')
  const [gridOn, setGridOn] = useState(true)
  const [probe, setProbe] = useState<DetailPoint | null>(null)
  const [detail, setDetail] = useState(false)
  const [me, setMe] = useState<{ lon: number; lat: number } | null>(null)
  const [locating, setLocating] = useState(false)

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

  const estimate = bundle?.[variable] ?? null
  const unit = variable === 'relativehumidity' ? '%' : '°'
  const decimals = variable === 'relativehumidity' ? 0 : 1

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

      <View style={[styles.fabs, { bottom: probe ? 158 : 40 + insets.bottom }]} pointerEvents="box-none">
        <Fabs
          locating={locating}
          onLocate={locate}
          onReset={() => {
            setProbe(null)
            mapHandle.current?.reset()
          }}
        />
      </View>

      <PeekCard
        visible={!!probe && !!estimate}
        value={estimate ? `${n(estimate.value, decimals)}${unit}` : '—'}
        valueColor={estimate ? cssColor(stops, estimate.value) : color.dim}
        title={probe?.title ?? ''}
        meta={
          probe && estimate
            ? `${n0(probe.elevation)} m · estimado ± ${n(estimate.uncertainty, decimals)} ${
                variable === 'relativehumidity' ? '%' : '°C'
              }`
            : ''
        }
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          setDetail(true)
        }}
      />

      <DetailScreen
        open={detail}
        point={probe}
        bundle={bundle}
        variable={variable}
        stops={stops}
        stations={island.stations}
        models={island.models}
        census={island.census}
        validation={island.validation}
        now={now}
        onClose={() => setDetail(false)}
      />
    </View>
  )
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
