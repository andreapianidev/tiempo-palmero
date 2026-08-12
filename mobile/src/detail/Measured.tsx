/**
 * «Medido, no interpolado»: viento, lluvia, UV y presión.
 *
 * Estas cuatro no se estiman para el punto y la sección lo dice. El viento y la
 * lluvia son locales —una ladera llueve y la de enfrente no—, el UV depende de
 * la nube que pase, y la presión reducida al nivel del mar apenas varía en 42
 * km pero los barómetros de la red se desvían entre sí hasta 39 hPa: por eso de
 * esa se da la mediana insular y no la estación más cercana.
 */

import { View } from 'react-native'
import { medianPressure, nearestWith } from '@core/lib/interpolate'
import type { Station } from '@core/lib/quality'
import { humanAge, n, n0, t } from '@core/i18n'
import { Row } from './Row'
import { Section } from './Section'

interface Props {
  stations: Station[]
  lon: number
  lat: number
  elevation: number
  now: number
}

/** Grados meteorológicos a rosa de ocho vientos. */
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
const cardinal = (deg: number) => COMPASS[Math.round(deg / 45) % 8]

export function Measured({ stations, lon, lat, elevation, now }: Props) {
  const wind = nearestWith(stations, lon, lat, elevation, 'windspeed')
  const rain = nearestWith(stations, lon, lat, elevation, 'dailyprecipitation')
  const uv = nearestWith(stations, lon, lat, elevation, 'uv')
  const pressure = medianPressure(stations)

  const rows: React.ReactNode[] = []

  if (wind) {
    const dir = wind.station.winddirection
    rows.push(
      <Row
        key="wind"
        label={t.variables.wind}
        sub={`${wind.station.name} · ${n(wind.distanceKm, 1)} ${t.units.km} · ${humanAge(
          now - wind.station.timeinstant,
        )}`}
        value={`${n0(wind.station.windspeed ?? 0)} ${t.units.kmh}`}
        valueSub={dir !== null ? `del ${cardinal(dir)}` : undefined}
      />,
    )
  }
  if (rain) {
    rows.push(
      <Row
        key="rain"
        label={t.variables.precipitation}
        sub={`${rain.station.name} · ${n(rain.distanceKm, 1)} ${t.units.km}`}
        value={`${n(rain.station.dailyprecipitation ?? 0, 1)} mm`}
      />,
    )
  }
  if (uv && uv.station.uv !== null) {
    rows.push(
      <Row
        key="uv"
        label={t.variables.uv}
        sub={`${uv.station.name} · ${n(uv.distanceKm, 1)} ${t.units.km}`}
        value={n0(uv.station.uv)}
      />,
    )
  }
  if (pressure !== null) {
    rows.push(
      <Row
        key="pressure"
        label={t.variables.pressure}
        sub={t.point.islandMedian}
        value={`${n0(pressure)} ${t.units.hpa}`}
        last
      />,
    )
  }

  return (
    <Section title={t.point.nearestOnly} note={t.point.noInterpolation}>
      <View style={{ marginTop: 10 }}>{rows}</View>
    </Section>
  )
}
