/**
 * El cuerpo de la ficha de un punto del mapa.
 *
 * Es lo que había dentro de `DetailScreen`, que era una pantalla entera y ya no
 * existe: ahora esto vive dentro de la hoja deslizante, con el mapa a la vista
 * por encima. El contenido y su orden no cambian, porque el orden ES el
 * argumento: la cifra, de dónde sale, qué no se ha interpolado, qué hay
 * alrededor y cómo de fiable es el modelo.
 */

import { View } from 'react-native'
import type { Bundle, InterpolableVariable, Model } from '@core/lib/interpolate'
import type { DisplayVariable } from '@core/lib/interpolate'
import type { NetworkCensus, Station } from '@core/lib/quality'
import type { RgbStop } from '@core/lib/palette'
import { VARIABLES, VARIABLE_ORDER } from '@core/lib/variables'
import { n, t } from '@core/i18n'
import { Hero } from './Hero'
import { Contributors } from './Contributors'
import { Measured } from './Measured'
import { Nearby } from './Nearby'
import { Diagnostics } from './Diagnostics'
import { Row } from './Row'
import { Section } from './Section'

export interface PointPlace {
  lon: number
  lat: number
  elevation: number
  municipality: string
  title: string
}

interface Props {
  point: PointPlace
  bundle: Bundle | null
  variable: DisplayVariable
  stops: RgbStop[]
  stations: Station[]
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  now: number
}

export function PointDetail({
  point,
  bundle,
  variable,
  stops,
  stations,
  models,
  census,
  validation,
  now,
}: Props) {
  const estimate = bundle?.[variable] ?? null
  if (!estimate) return <Section title={t.point.title} note={t.errors.noStations} first />

  const secondary = VARIABLE_ORDER.filter((v) => v !== variable && bundle?.[v]).map((v) => ({
    variable: v,
    est: bundle![v]!,
  }))

  return (
    <>
      <Hero
        estimate={estimate}
        unit={VARIABLES[variable].unit}
        decimals={VARIABLES[variable].decimals}
        derived={VARIABLES[variable].derived === true}
        stops={stops}
        lon={point.lon}
        lat={point.lat}
        elevation={point.elevation}
        municipality={point.municipality}
        now={now}
      />

      {secondary.length > 0 && (
        <Section title="Las otras variables">
          <View style={{ marginTop: 10 }}>
            {secondary.map(({ variable: v, est }, i) => (
              <Row
                key={v}
                label={VARIABLES[v].label}
                value={`${n(est.value, VARIABLES[v].decimals)} ${VARIABLES[v].unit}`}
                valueSub={`± ${n(est.uncertainty, VARIABLES[v].decimals)}`}
                last={i === secondary.length - 1}
              />
            ))}
          </View>
        </Section>
      )}

      {VARIABLES[variable].hint && (
        <Section title="Cómo se calcula" note={VARIABLES[variable].hint} />
      )}

      <Contributors
        estimate={estimate}
        note={contributorsNote(models, point.elevation, variable)}
        now={now}
      />

      <Measured
        stations={stations}
        lon={point.lon}
        lat={point.lat}
        elevation={point.elevation}
        now={now}
      />

      <Nearby lon={point.lon} lat={point.lat} />

      <Diagnostics
        models={models}
        census={census}
        validation={validation}
        neighbours={estimate.contributors.length}
      />
    </>
  )
}

/** La frase que explica el cálculo, con el gradiente real de este momento. */
function contributorsNote(
  models: Record<InterpolableVariable, Model | null>,
  elevation: number,
  variable: DisplayVariable,
): string {
  const model = variable === 'relativehumidity' ? models.relativehumidity : models.temperature
  if (!model) return t.model.explain
  const perKm = -model.b * 1000
  const unit = variable === 'relativehumidity' ? '%/km' : '°C/km'
  return (
    `Media ponderada por distancia inversa sobre los residuos del ajuste altitudinal, ` +
    `devuelta a ${Math.round(elevation)} m con el gradiente medido ahora mismo, ` +
    `${n(perKm, 2)} ${unit}. Las estaciones anómalas ya se han descartado.`
  )
}
