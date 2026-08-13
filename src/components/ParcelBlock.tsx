/**
 * Qué se cultiva justo aquí, y cuánta agua pide hoy.
 *
 * Se pide EN VIVO al Feature Service del Cabildo, una parcela cada vez: la
 * capa entera son 217.137 polígonos y 35 MB, que no se le sirven a un teléfono
 * para que casi nadie los mire. La consulta puntual tarda ~0,8 s medidos.
 *
 * ⚠️ El polígono es de **2008** y lo dice cada vez. Entre esa fecha y hoy está
 * la erupción de 2021, que sepultó parte de la platanera del Valle de Aridane:
 * en esa zona la capa describe lo que HABÍA, y callarlo sería enseñar un
 * cultivo donde ahora hay colada.
 */

import { useEffect, useState } from 'react'
import { n, n0 } from '../i18n'
import { fetchParcel, type Parcel } from '../lib/agro/parcel'
import { waterBalance, litresPerPlant, DEFAULT_SPACING_M2 } from '../lib/agro/balance'
import { sampleEto, type EtoField } from '../lib/agro/eto'

interface Props {
  lon: number
  lat: number
  elevationM: number
  eto: EtoField | null
}

export function ParcelBlock({ lon, lat, elevationM, eto }: Props) {
  const [parcel, setParcel] = useState<Parcel | null>(null)
  const [asked, setAsked] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    setParcel(null)
    setAsked(false)

    fetchParcel(lon, lat, controller.signal).then((p) => {
      if (!alive) return
      setParcel(p)
      setAsked(true)
    })

    return () => {
      alive = false
      controller.abort()
    }
  }, [lon, lat])

  // Mientras no haya respuesta no se enseña nada: un esqueleto parpadeando en
  // cada clic del mapa molesta más de lo que informa, y esto es un extra.
  if (!asked || !parcel) return null

  const local = eto ? sampleEto(eto, lon, lat, elevationM) : null
  const balance =
    local && parcel.crop ? waterBalance(parcel.crop.code, local.etoMm, local.rainMm) : null
  const spacing = parcel.crop ? DEFAULT_SPACING_M2[parcel.crop.family] : undefined

  return (
    <section className="parcel-block">
      <h3>Parcela · cartografía {parcel.year}</h3>

      <p className="parcel-crop">
        <b>{parcel.description || 'Sin clasificar'}</b>
        {parcel.reference && <span className="dim mono"> · {parcel.reference}</span>}
      </p>

      <ul className="parcel-flags">
        {parcel.greenhouse && <li>Invernadero</li>}
        {/* El jable es arena volcánica extendida sobre la tierra para conservar
            la humedad: cambia por completo cuánto riego pide una parcela, y por
            eso se marca aunque el cálculo de abajo no lo tenga en cuenta. */}
        {parcel.jable && <li>Jable</li>}
        {parcel.elevationM !== null && <li>{n0(parcel.elevationM)} m (Cabildo)</li>}
      </ul>

      {balance && spacing ? (
        <table className="kv">
          <tbody>
            <tr>
              <th>Demanda hoy (Kc {balance.crop.kcMid})</th>
              <td className="mono">{n(balance.etcMm, 2)} mm</td>
            </tr>
            {balance.rainMm > 0 && (
              <tr>
                <th>Lluvia del día</th>
                <td className="mono">{n(balance.rainMm, 1)} mm</td>
              </tr>
            )}
            <tr>
              <th>A reponer</th>
              <td className="mono">
                {n(balance.deficitMm, 2)} mm ·{' '}
                {n(litresPerPlant(balance.deficitMm, spacing), 0)} L/planta
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="dim small">
          {parcel.crop && parcel.crop.kcMid === null
            ? 'No es una superficie en cultivo: no tiene demanda de riego que calcular.'
            : 'Abre la sección de Agricultura para calcular la demanda de agua aquí.'}
        </p>
      )}

      <p className="dim small">
        Cabildo Insular de La Palma, capa levantada entre 2002 y {parcel.year}.
        No recoge la erupción de 2021.
        {spacing && <> El litro supone un marco de {spacing} m²/planta.</>}
      </p>
    </section>
  )
}
