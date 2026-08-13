/**
 * Vista en tres dimensiones: el interruptor, cómo se vuela y qué se exagera.
 *
 * Va DENTRO de la misma sección que el fondo del mapa, como un segundo bloque.
 * Son dos preguntas sobre lo mismo —de qué está hecha la superficie que se
 * mira, y desde dónde se la mira— y separadas en dos pestañas plegables
 * quedaba escondido que la 3D existe.
 *
 * El catálogo de la escena NO vive aquí: está en `lib/terrain.ts`, junto a las
 * cifras medidas que lo justifican. Este archivo solo lo dibuja.
 */

import {
  EXAGGERATIONS,
  MAX_PITCH,
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
  /** La capa de viento está encendida: en 3D cambia de sitio, y se dice. */
  windOn: boolean
}

export function Scene3D({ on, onToggle, exaggeration, onExaggeration, windOn }: Props) {
  return (
    <div className="subblock">
      <p className="lbl">Vista 3D</p>

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
          {/*
            Los cuatro gestos están COMPROBADOS contra el mapa, no copiados de
            la documentación. Dos de los que parecían obvios no valen y por eso
            no están:

              - arrastrar la brújula no hace nada (es de Mapbox, no de
                MapLibre: probado, la cámara no se mueve ni un grado);
              - «dos dedos» solo gira en una pantalla táctil. En el trackpad de
                un portátil, dos dedos son la rueda, y la rueda es el zoom.

            Queda `Ctrl` + arrastrar, que es justo el gesto de Google Earth y
            el único que funciona igual con ratón y con trackpad.
          */}
          <p className="lbl" style={{ marginTop: 14 }}>
            Cómo moverse
          </p>
          <ul className="gestures">
            <li>
              <kbd>Ctrl</kbd> + arrastrar — gira los 360° en horizontal e
              inclina hasta {MAX_PITCH}° en vertical. Con ratón, el botón
              derecho hace lo mismo.
            </li>
            <li>
              <kbd>Mayús</kbd> + flechas — lo mismo con el teclado, después de
              hacer clic en el mapa.
            </li>
            <li>
              La brújula de abajo a la derecha vuelve al norte y a la vertical.
              La vista 3D se queda puesta.
            </li>
            <li>
              Arrastrar y rueda siguen siendo desplazar y acercar, igual que en
              plano.
            </li>
          </ul>

          <p className="lbl" style={{ marginTop: 14 }}>
            Exageración vertical
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
              El viento va por el suelo: cada partícula lleva la cota del punto
              por el que pasa —la del mismo modelo de elevación que dibuja el
              relieve— y las estelas que quedan detrás de una cresta las tapa la
              cresta. Lo que se estira {exaggerationLabel(exaggeration)} es
              también su altura, para que sigan pegadas a la ladera.
            </p>
          )}
        </>
      )}
    </div>
  )
}
