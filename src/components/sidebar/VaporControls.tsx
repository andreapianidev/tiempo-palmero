/**
 * La respiración de la isla: el interruptor, lo que se está viendo, y el día
 * entero en cuarenta segundos.
 *
 * ESTE PANEL TIENE UN TRABAJO ADEMÁS DE ENCENDER LA CAPA: decir qué parte de lo
 * que se ve es dato y qué parte es dibujo. La capa de vapor es lo más
 * espectacular de la aplicación y por eso es lo que más fácil sería colar como
 * si fuera una medida. Aquí se separan las dos cosas en voz alta.
 */

import { canaryClockLabel, CYCLE_SECONDS } from '../../lib/vapor/clock'
import { VPD_FULL_KPA, type VaporField } from '../../lib/vapor/field'
import type { Breath } from '../../lib/vapor/breath'
import { n, n0 } from '../../i18n'

interface Props {
  on: boolean
  onToggle: () => void
  /** La 3D está apagada: la capa se ve, pero se ve plana. */
  terrainOn: boolean
  field: VaporField | null
  breath: Breath
  /** Corriendo el día acelerado, y qué hora simulada marca. */
  playing: boolean
  onPlay: () => void
  clock: Date
  progress: number
}

const CEILING_SOURCE: Record<VaporField['ceilingFrom'], string> = {
  deck: 'la base del mar de nubes que diagnostica el sondeo',
  lcl: 'el nivel de condensación por ascenso, calculado con la temperatura y el rocío de la isla',
  default: 'la cota máxima de la isla, porque hoy no hay ni manta ni rocío que lo acoten',
}

export function VaporControls({
  on,
  onToggle,
  terrainOn,
  field,
  breath,
  playing,
  onPlay,
  clock,
  progress,
}: Props) {
  return (
    <div className="subblock">
      <ul className="switches">
        <li>
          <label>
            <input type="checkbox" checked={on} onChange={onToggle} />
            <span>Evaporación del terreno</span>
          </label>
        </li>
      </ul>

      <p className="dim small">
        Una isla de montaña respira. De día el sol calienta las laderas, el aire
        pegado a ellas sube por la pendiente y arrastra el agua que el terreno
        suelta; de noche las laderas se enfrían, ese aire se hace más denso y
        baja por los barrancos hasta el mar. Es lo que empuja al mar de nubes a
        trepar por la vertiente noreste cada tarde.
      </p>

      {!terrainOn && (
        <p className="dim small">
          Esta capa está hecha para la vista 3D: las partículas llevan altitud y
          el relieve las tapa cuando quedan detrás. En plano se ven, pero se ven
          desde arriba y la columna no se distingue de la mancha.
        </p>
      )}

      {on && (
        <>
          <p className="lbl" style={{ marginTop: 14 }}>
            Ahora mismo
          </p>
          <table className="kv">
            <tbody>
              <tr>
                <th>La isla</th>
                <td>
                  {breath.phase === 'up' ? 'inspira' : 'espira'} — el aire{' '}
                  {breath.phase === 'up'
                    ? 'sube por las laderas'
                    : 'baja por los barrancos'}
                </td>
              </tr>
              <tr>
                <th>Sol</th>
                <td>
                  {n(breath.sunDeg)}° sobre el horizonte
                  {breath.sunDeg < 0 && ' (de noche)'}
                </td>
              </tr>
              {field && (
                <>
                  <tr>
                    <th>Techo</th>
                    <td>
                      {n0(field.ceilingM)} m — {CEILING_SOURCE[field.ceilingFrom]}
                    </td>
                  </tr>
                  <tr>
                    <th>Isla activa</th>
                    <td>
                      {n0(100 * field.activeShare)} % de la superficie con más de{' '}
                      {n(VPD_FULL_KPA / 2)} kPa de déficit de vapor
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          <p className="lbl" style={{ marginTop: 14 }}>
            Ver el día entero
          </p>
          <button className="chip-btn" aria-pressed={playing} onClick={onPlay}>
            {playing ? 'Parar' : `Un día en ${CYCLE_SECONDS} s`}
          </button>
          {playing && (
            <>
              <div
                className="cycle-bar"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="dim small">
                <strong>Hora simulada: {canaryClockLabel(clock)}</strong> — no es
                la hora que es. El sol corre {n0(86_400 / CYCLE_SECONDS)} veces
                más rápido para que el ciclo se pueda ver; el vapor solo tres
                veces, porque acelerarlo igual sería ruido y no un ascenso.
              </p>
            </>
          )}

          {/*
            La parte incómoda, y va escrita donde se enciende la capa, no en un
            comentario del código: hay dos cosas mezcladas en pantalla y quien
            mira tiene derecho a saber cuál es cuál.
          */}
          <p className="lbl" style={{ marginTop: 14 }}>
            Qué es dato y qué es dibujo
          </p>
          <ul className="gestures">
            <li>
              <strong>Dato:</strong> dónde hay vapor y cuánto — lo pone el
              déficit de presión de vapor que estiman las estaciones del Cabildo,
              la misma variable que se puede elegir en el mapa.
            </li>
            <li>
              <strong>Dato:</strong> cuándo sube y cuándo baja — lo pone la
              posición real del sol para hoy y para esta isla, con las dos horas
              de retraso con las que el suelo va detrás del sol.
            </li>
            <li>
              <strong>Dato:</strong> hasta dónde llega — lo pone el nivel de
              condensación. Por encima, esto ya no es vapor: es la manta, y la
              cuenta el mar de nubes.
            </li>
            <li>
              <strong>Dato:</strong> hacia dónde deriva — el mismo campo de
              viento que dibuja la capa de viento.
            </li>
            <li>
              <strong>Dibujo:</strong> la velocidad con la que se mueve cada
              mota. Son rangos de manual para brisas de ladera, no medidas de
              esta isla: aquí no hay anemómetros de ladera con los que
              comprobarlo. No se puede medir una velocidad en esta pantalla.
            </li>
          </ul>
        </>
      )}
    </div>
  )
}
