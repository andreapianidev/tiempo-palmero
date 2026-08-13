/**
 * El parte de la cumbre, 2387 m.
 *
 * Lo que hace distinta a esta sección de todas las demás es que la fuente se
 * autodeclara vieja campo por campo, y aquí eso se respeta a rajatabla: un
 * valor marcado `outdated` sale apagado y con su fecha, nunca como si fuera de
 * ahora. El día que se escribió esto, el seeing llevaba cuatro días parado y
 * los otros ocho campos eran de hace un minuto.
 *
 * Es la ÚNICA medida real por encima del techo de la red del Cabildo, y desde
 * el 13 ago 2026 el mapa la usa: aquí ponía «todo lo que la aplicación dice de
 * la cumbre lo pone un modelo; esto no», y ya no es cierto. Su termómetro
 * ancla la cumbre en el motor (ver `summit.ts`), así que la cifra de esta
 * sección y la que pinta el mapa a 2387 m son la misma.
 */

import { humanAge, n } from '../../i18n'
import type { SummitLayer } from '../../lib/summit'
import {
  ROQUE_ELEVATION_M,
  ROQUE_KEYS,
  dustLevel,
  seeingQuality,
  type RoqueStatus as Status,
} from '../../lib/roque'

const SEEING_WORDS: Record<ReturnType<typeof seeingQuality>, string> = {
  excellent: 'noche excelente',
  good: 'noche buena',
  average: 'regular',
  poor: 'turbulenta',
}

const DUST_WORDS: Record<ReturnType<typeof dustLevel>, string> = {
  clean: 'aire limpio',
  hazy: 'polvo en suspensión',
  calima: 'calima',
}

/** Decimales por campo. El polvo necesita dos; el acimut, ninguno. */
const DECIMALS: Partial<Record<(typeof ROQUE_KEYS)[number], number>> = {
  temperature: 1,
  humidity: 0,
  dewpoint: 1,
  windspeed: 1,
  winddir: 0,
  pressure: 1,
  dust: 2,
  seeing: 2,
  solarimeter: 0,
}

interface Props {
  status: Status | null
  /** Cota del mar de nubes, para poder decir si la cumbre está por encima. */
  aboveDeck: boolean | null
  /**
   * La capa entre la estación más alta del Cabildo y la cumbre, MEDIDA con dos
   * termómetros. Es el único tramo de la vertical de la isla del que se puede
   * decir algo sin preguntarle a un modelo, y hasta ahora no se decía nada.
   */
  layer: SummitLayer | null
  now: number
}

export function RoqueStatus({ status, aboveDeck, layer, now }: Props) {
  if (!status) {
    return (
      <p className="dim small">
        La estación del TNG no responde ahora mismo. Es un observatorio de
        investigación, no un servicio público de datos: cuando calla, esta
        sección se queda sin nada que decir y el resto de la aplicación sigue
        igual.
      </p>
    )
  }

  const temp = status.fields.temperature
  const seeing = status.fields.seeing
  const dust = status.fields.dust

  return (
    <>
      {temp && (
        <p className="deck-headline">
          <b>{n(temp.value, 1)} °C</b> a {ROQUE_ELEVATION_M} m
          {aboveDeck === true && <> · por encima del mar de nubes</>}
        </p>
      )}

      <table className="kv">
        <tbody>
          {ROQUE_KEYS.map((key) => {
            const f = status.fields[key]
            if (!f) return null
            return (
              <tr key={key} className={f.outdated ? 'row-stale' : undefined}>
                <th>{f.label}</th>
                <td className="mono">
                  {n(f.value, DECIMALS[key] ?? 1)} {f.unit}
                  {/* Un campo obsoleto NO se esconde: se fecha. Esconderlo
                      dejaría la duda de si el instrumento existe.

                      Sin «hace»: lo pone ya `humanAge`. Con los dos salía «de
                      hace hace 2 h» en pantalla. */}
                  {f.outdated && (
                    <em className="dim"> · de {humanAge(now - f.observedAt)}</em>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* La vertical MEDIDA. No localiza la inversión del alisio —su base
          suele quedar por debajo del techo de la red, y con dos puntos no se
          saca una base—, sino lo que pasa en el tramo que el mapa rellenaba
          con modelo: si está bien mezclado o si hay una capa estable y seca.
          Es la única parte de la vertical de la isla que se puede afirmar sin
          un sondeo, y son dos termómetros de verdad. */}
      {layer && (
        <p className="dim small">
          Entre {n(layer.fromElevation, 0)} m ({layer.fromName}) y la cumbre hay{' '}
          {n(layer.spanM, 0)} m que ninguna otra estación mide. Ahora mismo la
          temperatura cambia{' '}
          <b className="mono">
            {layer.gradient >= 0 ? '+' : '−'}
            {n(Math.abs(layer.gradient), 2)} °C
          </b>{' '}
          cada 100 m de subida
          {layer.deltaRh !== null && (
            <>
              {' '}
              y la humedad {layer.deltaRh <= 0 ? 'baja' : 'sube'}{' '}
              {n(Math.abs(layer.deltaRh), 0)} puntos
            </>
          )}
          .{' '}
          {layer.subsident
            ? 'Es una capa estable y secándose: aire que baja, el mismo mecanismo que pone la tapa al mar de nubes.'
            : 'Aire bien mezclado, sin capa estable ahí arriba.'}
        </p>
      )}

      {/* Las dos lecturas que le importan a quien sube: si se ve y si hay
          polvo. Sólo se interpretan cuando el dato está fresco. */}
      <ul className="chips-inline">
        {seeing && !seeing.outdated && (
          <li>Seeing: {SEEING_WORDS[seeingQuality(seeing.value)]}</li>
        )}
        {dust && !dust.outdated && <li>{DUST_WORDS[dustLevel(dust.value)]}</li>}
      </ul>

      <p className="dim small">
        Telescopio Nazionale Galileo (INAF), Roque de los Muchachos. Presión de
        estación sin reducir al nivel del mar: a 2.387 m son ~778 hPa de verdad,
        y es justo la razón física de que allí arriba haya un observatorio.
        {status.observedAt !== null && (
          <> Última lectura fresca de {humanAge(now - status.observedAt)}.</>
        )}
      </p>
    </>
  )
}
