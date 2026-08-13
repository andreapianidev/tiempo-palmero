/**
 * Qué dice la simulación de TDT en el punto que se ha pinchado.
 *
 * Lee EL MISMO PNG que pinta la mancha del mapa, así que la ficha y el mapa no
 * pueden decir cosas distintas. Y distingue tres situaciones, porque las tres
 * significan cosas distintas:
 *
 *   celda con simulación   cuántos sectores de repetidor la alcanzan.
 *   celda vacía, vecinas   no aquí, sí a menos de 300 m. Es el caso del casco
 *                          de Villa de Mazo y del puerto de Tazacorte: agujeros
 *                          de UNA celda de 92 m dentro de zona cubierta.
 *   nada alrededor         fuera de las 49 simulaciones.
 *
 * Lo que NO dice, y va escrito debajo: que allí no se vea la tele. El KMZ simula
 * los REPETIDORES, no el centro emisor principal, y es un cálculo de 2018.
 */

import { tdtReadingAt, type TdtMask } from '../../lib/tdt/mask'
import { t } from '../../i18n'

interface Props {
  mask: TdtMask | null
  lon: number
  lat: number
}

export function TdtPointBlock({ mask, lon, lat }: Props) {
  if (!mask) return null
  const { tier, nearby } = tdtReadingAt(mask, lon, lat)

  return (
    <section className="block">
      <h3>{t.tdt.title}</h3>
      <table className="kv">
        <tbody>
          <tr>
            <td>{t.tdt.simulated}</td>
            <td className="mono">
              {tier > 0
                ? t.tdt.repeaters(tier)
                : nearby > 0
                  ? t.tdt.notHereButNear
                  : t.tdt.outside}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="dim small">{t.tdt.note}</p>
    </section>
  )
}
