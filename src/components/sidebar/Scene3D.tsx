/**
 * Vista en tres dimensiones: el interruptor y lo que hay que saber al usarla.
 *
 * El catálogo de la escena NO vive aquí —está en `lib/terrain.ts`, junto a las
 * cifras medidas que lo justifican—. Este archivo solo lo dibuja, igual que
 * `BasemapPicker` dibuja los fondos sin saber de dónde salen sus teselas.
 */

import {
  EXAGGERATIONS,
  exaggerationLabel,
  slopeDegrees,
  type Exaggeration,
} from '../../lib/terrain'
import { n } from '../../i18n'

interface Props {
  on: boolean
  onToggle: () => void
  exaggeration: Exaggeration
  onExaggeration: (x: Exaggeration) => void
  /** La capa de viento está encendida: en 3D se apaga y hay que avisar. */
  windOn: boolean
}

export function Scene3D({ on, onToggle, exaggeration, onExaggeration, windOn }: Props) {
  return (
    <>
      <ul className="switches">
        <li>
          <label>
            <input type="checkbox" checked={on} onChange={onToggle} />
            <span>Relieve en tres dimensiones</span>
          </label>
        </li>
      </ul>

      {/* Que no cueste una descarga no es un detalle interno: es la diferencia
          entre una capa que se puede encender en el móvil con datos y una que
          no. Se dice donde se enciende. */}
      <p className="dim small">
        Usa el mismo modelo de elevación que ya sombrea el mapa y que pone las
        cotas del motor. No descarga nada nuevo.
      </p>

      {on && (
        <>
          <p className="dim small">
            Arrastra con el botón derecho —o con dos dedos— para girar e
            inclinar. La brújula de abajo a la derecha vuelve al norte y al
            plano.
          </p>

          <div className="chips">
            {EXAGGERATIONS.map((x) => (
              <button
                key={x}
                className="chip-btn"
                aria-pressed={exaggeration === x}
                onClick={() => onExaggeration(x)}
              >
                {exaggerationLabel(x)}
              </button>
            ))}
          </div>

          {/* La cifra que sostiene el tope, en la interfaz y no solo en el
              comentario del código: quien elige 1,5× tiene derecho a saber qué
              está estirando. */}
          <p className="dim small">
            {exaggeration === 1 ? (
              <>
                La isla como es. El modelo mide paredes de {n(slopeDegrees(1))}°
                en la Caldera de Taburiente: aquí no hace falta exagerar nada.
              </>
            ) : (
              <>
                La vertical va estirada {exaggerationLabel(exaggeration)}. Esas
                paredes de {n(slopeDegrees(1))}° de la Caldera se dibujan a{' '}
                {n(slopeDegrees(exaggeration))}°. Ayuda a leer las medianías,
                pero ya no es una pendiente que se pueda medir en pantalla.
              </>
            )}
          </p>

          {windOn && (
            <p className="dim small">
              El viento se queda apagado mientras la vista esté inclinada: sus
              partículas se calculan a nivel del mar y sobre el relieve
              atravesarían la montaña por dentro.
            </p>
          )}
        </>
      )}
    </>
  )
}
