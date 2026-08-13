/**
 * Mar de nubes: a qué altura está la manta y desde dónde hay sol.
 *
 * La regla de esta sección es que la cota SIEMPRE viaja con su margen. La
 * rejilla de niveles de presión que la mide tiene ~493 m de paso en la banda
 * crítica, más que el espesor del propio fenómeno, y una cifra sola —«1.081 m»—
 * prometería una precisión que no existe. Aquí se dice «entre 1.100 y 1.550 m,
 * ±250».
 *
 * Y cuando hay inversión pero NO hay nubes, se dice eso mismo en vez de
 * callarse: que hoy el aire está partido en dos capas es información, aunque no
 * haya manta que ver.
 */

import { n0, humanAge } from '../../i18n'
import { sunlightAbove, type CloudDeck } from '../../lib/clouds'

interface Props {
  deck: CloudDeck | null
  /** Altitud del punto que el usuario tiene elegido, si hay alguno. */
  hereM: number | null
  hereLabel: string | null
  now: number
}

export function CloudSea({ deck, hereM, hereLabel, now }: Props) {
  if (!deck) {
    return (
      <p className="dim small">
        El sondeo de ahora no encuentra ninguna capa estable entre 200 y 2.500 m:
        hoy la atmósfera sube seguida y no hay inversión del alisio que separe
        dos mundos.
      </p>
    )
  }

  const sun = sunlightAbove(deck)

  return (
    <>
      {deck.present ? (
        <p className="deck-headline">
          Manta de nubes entre <b>{n0(deck.base)}</b> y <b>{n0(deck.top)} m</b>.
          Por encima de <b>{n0(sun)} m</b> hay sol.
        </p>
      ) : (
        <p className="deck-headline dim">
          Hay inversión entre {n0(deck.base)} y {n0(deck.top)} m, pero{' '}
          <b>sin nubes debajo</b>: capa estable y cielo despejado.
        </p>
      )}

      <table className="kv">
        <tbody>
          <tr>
            <th>Base de la capa</th>
            <td className="mono">
              {n0(deck.base)} m <em className="dim">± {n0(deck.resolutionM)}</em>
            </td>
          </tr>
          <tr>
            <th>Techo</th>
            <td className="mono">
              {n0(deck.top)} m <em className="dim">± {n0(deck.resolutionM)}</em>
            </td>
          </tr>
          <tr>
            <th>Salto térmico</th>
            <td className="mono">
              {deck.deltaT > 0 ? '+' : ''}
              {deck.deltaT.toFixed(1)} °C
              {deck.deltaT > 0 && <em className="dim"> sube con la altura</em>}
            </td>
          </tr>
          <tr>
            <th>Caída de humedad</th>
            <td className="mono">{deck.deltaRh.toFixed(0)} puntos</td>
          </tr>
          <tr>
            <th>Nubosidad baja</th>
            <td className="mono">
              {deck.coverage === null ? '—' : `${Math.round(deck.coverage)} %`}
            </td>
          </tr>
          <tr>
            <th>Columnas de acuerdo</th>
            <td className="mono">
              {deck.agreement.withInversion}/{deck.agreement.total}
            </td>
          </tr>
        </tbody>
      </table>

      {/* El caso que la gente pregunta de verdad: ¿y aquí abajo, qué? */}
      {hereM !== null && (
        <p className="deck-here">
          {hereM < deck.base - deck.resolutionM ? (
            <>
              {hereLabel ?? 'El punto elegido'} está a {n0(hereM)} m,{' '}
              <b>por debajo</b> de la capa
              {deck.present ? ': cielo tapado desde abajo.' : '.'}
            </>
          ) : hereM > deck.top + deck.resolutionM ? (
            <>
              {hereLabel ?? 'El punto elegido'} está a {n0(hereM)} m,{' '}
              <b>por encima</b> de la capa{deck.present ? ': al sol.' : '.'}
            </>
          ) : (
            <>
              {hereLabel ?? 'El punto elegido'} está a {n0(hereM)} m,{' '}
              <b>dentro del margen</b> de la capa: con esta resolución no se
              puede afirmar de qué lado cae.
            </>
          )}
        </p>
      )}

      <p className="dim small">
        Del sondeo de niveles de presión de Open-Meteo, pasada de hace{' '}
        {humanAge(now - deck.observedAt)}. La cota es una banda porque los
        niveles que la encierran están a ~500 m entre sí: medir el espesor real
        pediría un radiosondeo, y el más cercano se lanza en Güímar.
      </p>
    </>
  )
}
