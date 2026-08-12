/**
 * Diagnóstico del modelo, dentro de la ficha.
 *
 * En el escritorio esto vive en el panel lateral y está siempre a la vista; en
 * el móvil no hay panel lateral, así que baja al final de la ficha del punto —
 * que es donde importa: quien acaba de leer una cifra estimada es quien tiene
 * que poder juzgar el modelo que la ha producido.
 *
 * Las cifras son las mismas y salen del mismo sitio que en la web: el ajuste de
 * TEMPERATURA, que es el que marca el gradiente de la isla y el que valida el
 * RMSE. Enseñar aquí el de la humedad bajo la etiqueta «gradiente medido»
 * confundiría dos cosas distintas.
 */

import { Text, View } from 'react-native'
import type { InterpolableVariable, Model } from '@core/lib/interpolate'
import type { NetworkCensus } from '@core/lib/quality'
import { n, n0, t } from '@core/i18n'
import { Row } from './Row'
import { Section } from './Section'
import { color, font } from '../theme'

interface Props {
  models: Record<InterpolableVariable, Model | null>
  census: NetworkCensus | null
  validation: { rmse: number; mae: number; n: number } | null
  /** Vecinas que han entrado en el cálculo de este punto concreto. */
  neighbours: number
}

export function Diagnostics({ models, census, validation, neighbours }: Props) {
  const model = models.temperature
  const lapsePerKm = model ? -model.b * 1000 : null
  const anchors = Math.max(
    models.temperature?.anchors ?? 0,
    models.relativehumidity?.anchors ?? 0,
  )
  const rejected = model?.rejected.length ?? 0

  return (
    <Section title={t.model.title}>
      <View style={{ marginTop: 10 }}>
        <Row
          label="Estaciones activas"
          sub={census ? `${census.total} registradas en la red` : undefined}
          value={census ? `${model?.used.length ?? 0} ${t.common.of} ${census.total}` : '—'}
        />
        <Row
          label={t.model.lapseRate}
          sub="regresión T ~ altitud"
          value={lapsePerKm !== null ? `${n(lapsePerKm, 2)} °C/km` : '—'}
        />
        <Row label={t.model.r2} value={model ? n(model.r2, 3) : '—'} />
        <Row
          label={t.model.rmse}
          sub="validación dejando una fuera"
          value={validation ? `${n(validation.rmse, 2)} °C` : '—'}
        />
        <Row
          label={t.model.coverage}
          value={
            model
              ? `${n0(model.elevationRange[0])}–${n0(model.elevationRange[1])} ${t.units.metres}`
              : '—'
          }
        />
        <Row label="Vecinas en el cálculo" value={String(neighbours)} last={anchors === 0} />
        {anchors > 0 && (
          <Row label={t.model.anchorTag} value={t.model.anchorsActive(anchors)} last />
        )}
      </View>

      {rejected > 0 && <Text style={styles.note}>{t.model.rejected(rejected)}</Text>}
      <Text style={styles.note}>{t.model.validationNote}</Text>
    </Section>
  )
}

const styles = {
  note: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: color.faint,
    marginTop: 10,
  },
} as const
