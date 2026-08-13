/**
 * Agricultura: la sed del día y qué se cultiva en cada municipio.
 *
 * Dos datos de naturaleza muy distinta, y esta pantalla no los mezcla: la ETo
 * es de hoy y del modelo; el mapa de cultivos es de **2008** y no recoge la
 * erupción de 2021. Ese aviso va arriba de la tabla, no en una nota al pie.
 */

import { StyleSheet, Text } from 'react-native'
import { n, n0 } from '@core/i18n'
import { DEFAULT_SPACING_M2, litresPerPlant, waterBalance } from '@core/lib/agro/balance'
import { sampleEto, type EtoField } from '@core/lib/agro/eto'
import { Section } from '../detail/Section'
import { Row } from '../detail/Row'
import { color, font } from '../theme'

const FAMILY_LABEL: Record<string, string> = {
  platanera: 'Platanera',
  frutal: 'Frutales',
  viña: 'Viña',
  huerta: 'Huerta',
  pasto: 'Pasto',
}

export interface CropSummary {
  year: number
  totals: { parcels: number; hectares: number }
  municipios: {
    codmun: number
    municipio: string
    families: Record<string, { parcels: number; hectares: number }>
    hectares: number
  }[]
}

interface Props {
  eto: EtoField | null
  etoFailed: boolean
  crops: CropSummary | null
  here: { lon: number; lat: number; elevationM: number; label: string | null } | null
}

export function AgroBlock({ eto, etoFailed, crops, here }: Props) {
  const local = eto && here ? sampleEto(eto, here.lon, here.lat, here.elevationM) : null
  const banana = local ? waterBalance('21', local.etoMm, local.rainMm) : null

  return (
    <Section title="Agricultura">
      {etoFailed && (
        <Text style={styles.warn}>
          El modelo no ha devuelto evapotranspiración: sin ella no hay demanda
          de agua que calcular.
        </Text>
      )}

      {local ? (
        <>
          <Text style={styles.headline}>
            Hoy el aire pide <Text style={styles.hi}>{n(local.etoMm, 1)} mm</Text>
            {here?.label ? ` en ${here.label}` : ''}
            {local.rainMm > 0 ? ` · han caído ${n(local.rainMm, 1)} mm` : ''}
          </Text>

          {banana && (
            <>
              <Row label="ETo de referencia" value={`${n(banana.etoMm, 2)} mm`} />
              <Row
                label="Platanera"
                sub={`Kc ${banana.crop.kcMid}`}
                value={`${n(banana.etcMm, 2)} mm`}
              />
              <Row
                label="A reponer"
                value={`${n(banana.deficitMm, 2)} mm`}
                valueSub={`${n(
                  litresPerPlant(banana.deficitMm, DEFAULT_SPACING_M2.platanera!),
                  0,
                )} L/planta`}
                last
              />
            </>
          )}

          <Text style={styles.foot}>
            ETo de FAO-56 Penman-Monteith resuelta por Open-Meteo en 54 puntos
            con la cota real de cada uno. Es la demanda del cultivo, no una
            recomendación de riego: la eficiencia del sistema y el agua guardada
            en el suelo dependen de la finca.
          </Text>
        </>
      ) : (
        !etoFailed && (
          <Text style={styles.foot}>
            Toca un punto del mapa para ver cuánta agua pide ahí.
          </Text>
        )
      )}

      {crops && (
        <>
          <Text style={styles.warn}>
            Cartografía de {crops.year}. No recoge la erupción de 2021, que
            sepultó parte de la platanera del Valle de Aridane.
          </Text>
          {crops.municipios.slice(0, 6).map((m, i) => {
            const top = Object.entries(m.families).sort(
              (a, b) => b[1].hectares - a[1].hectares,
            )[0]
            return (
              <Row
                key={m.codmun}
                label={m.municipio}
                sub={top ? `${FAMILY_LABEL[top[0]] ?? top[0]} ${n0(top[1].hectares)} ha` : undefined}
                value={`${n0(m.hectares)} ha`}
                last={i === 5}
              />
            )
          })}
          <Text style={styles.foot}>
            {n0(crops.totals.parcels)} parcelas y {n0(crops.totals.hectares)} ha en
            cultivo, de 217.137 y 70.666 catalogadas: el resto es monte, erial y
            huerta abandonada. Cabildo Insular de La Palma.
          </Text>
        </>
      )}
    </Section>
  )
}

const styles = StyleSheet.create({
  headline: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
    color: color.fg,
    marginTop: 10,
    marginBottom: 4,
  },
  hi: { fontFamily: font.semibold, color: color.amber },
  warn: {
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 18,
    color: color.warn,
    marginTop: 14,
  },
  foot: {
    fontFamily: font.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: color.faint,
    marginTop: 12,
  },
})
