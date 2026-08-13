/**
 * Agricultura: cuánta agua pide hoy la isla, y qué se cultiva en cada municipio.
 *
 * DOS DATOS DE NATURALEZA MUY DISTINTA, y la sección no los mezcla:
 *
 * - La **ETo** es de hoy, del modelo, y cambia con la pasada.
 * - El **mapa de cultivos** es de **2008** y no ha vuelto a levantarse. En 2021
 *   el Tajogaite sepultó parte de la platanera del Valle de Aridane, así que
 *   estas hectáreas describen la isla de antes de la erupción. Eso se dice
 *   arriba del todo y no en una nota al pie.
 */

import { n, n0 } from '../../i18n'
import type { AgroState } from '../../hooks/useAgro'
import { DEFAULT_SPACING_M2, litresPerPlant, waterBalance } from '../../lib/agro/balance'
import { sampleEto } from '../../lib/agro/eto'

const FAMILY_LABEL: Record<string, string> = {
  platanera: 'Platanera',
  frutal: 'Frutales',
  viña: 'Viña',
  huerta: 'Huerta',
  pasto: 'Pasto y forraje',
}

interface Props {
  agro: AgroState
  /** Punto elegido en el mapa, para la demanda «aquí». */
  here: { lon: number; lat: number; elevationM: number; label: string | null } | null
}

export function AgroStatus({ agro, here }: Props) {
  const { eto, etoFailed, crops } = agro

  const local = eto && here ? sampleEto(eto, here.lon, here.lat, here.elevationM) : null
  // La platanera es el cultivo de exportación de la isla y el que más agua
  // mueve: es el ejemplo que hace concreta la cifra de ETo.
  const banana = local ? waterBalance('21', local.etoMm, local.rainMm) : null

  return (
    <>
      {etoFailed && (
        <p className="warn small">
          El modelo no ha devuelto evapotranspiración. Sin ella no hay demanda
          de agua que calcular.
        </p>
      )}

      {local && (
        <>
          <p className="deck-headline">
            Hoy el aire pide <b>{n(local.etoMm, 1)} mm</b>
            {here?.label && <> en {here.label}</>}
            {local.rainMm > 0 && <> · han caído {n(local.rainMm, 1)} mm</>}
          </p>

          {banana && (
            <table className="kv">
              <tbody>
                <tr>
                  <th>ETo de referencia</th>
                  <td className="mono">{n(banana.etoMm, 2)} mm</td>
                </tr>
                <tr>
                  <th>Platanera (Kc {banana.crop.kcMid})</th>
                  <td className="mono">{n(banana.etcMm, 2)} mm</td>
                </tr>
                <tr>
                  <th>A reponer</th>
                  <td className="mono">
                    {n(banana.deficitMm, 2)} mm ·{' '}
                    {n(litresPerPlant(banana.deficitMm, DEFAULT_SPACING_M2.platanera!), 0)}{' '}
                    L/planta
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          <p className="dim small">
            ETo de FAO-56 Penman-Monteith resuelta por Open-Meteo en 54 puntos
            con la cota real de cada uno; el litro supone un marco de{' '}
            {DEFAULT_SPACING_M2.platanera} m²/planta. Es la demanda del cultivo,
            no una recomendación de riego: la eficiencia del sistema, el agua
            guardada en el suelo y el lavado de sales dependen de la finca y no
            están en ningún dato publicado.
          </p>
        </>
      )}

      {!local && !etoFailed && (
        <p className="dim small">
          Elige un punto en el mapa para ver cuánta agua pide ahí.
        </p>
      )}

      {crops && (
        <>
          <h4 className="lbl">Superficie en cultivo por municipio</h4>
          <p className="warn small">
            Cartografía de <b>{crops.year}</b>. No recoge la erupción de 2021,
            que sepultó parte de la platanera del Valle de Aridane.
          </p>
          <table className="kv agro-table">
            <tbody>
              {crops.municipios.slice(0, 6).map((m) => {
                const top = Object.entries(m.families).sort(
                  (a, b) => b[1].hectares - a[1].hectares,
                )[0]
                return (
                  <tr key={m.codmun}>
                    <th>{m.municipio}</th>
                    <td className="mono">
                      {n0(m.hectares)} ha
                      {top && (
                        <em className="dim">
                          {' '}
                          · {FAMILY_LABEL[top[0]] ?? top[0]} {n0(top[1].hectares)}
                        </em>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="dim small">
            {n0(crops.totals.parcels)} parcelas y {n0(crops.totals.hectares)} ha en
            cultivo, de 217.137 parcelas y 70.666 ha catalogadas: el resto es
            monte, erial y huerta abandonada. Cabildo Insular de La Palma.
          </p>
        </>
      )}
    </>
  )
}
