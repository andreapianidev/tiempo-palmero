/**
 * El viento animado, dentro de «Experimental».
 *
 * POR QUÉ SE MUDÓ AQUÍ. Estaba en la lista de capas, la primera, entre las
 * estaciones meteorológicas y los sensores de CO₂. Esa vecindad decía algo que
 * no es cierto: que lo que se dibuja son medidas. No lo son. Las partículas
 * siguen un campo continuo y ese campo no existe en ningún sensor —se construye
 * mezclando las estaciones que publican dirección con una rejilla del modelo
 * allí donde no llega ninguna—, y en una isla donde el alisio, el efecto föhn a
 * sotavento y las brisas de ladera hacen que dos puntos a 5 km soplen en
 * direcciones opuestas, ese relleno es una parte grande de lo que se ve.
 *
 * LO QUE NO CAMBIA. El campo se sigue calculando siempre, esté la capa
 * encendida o no, porque de él salen las alertas de viento de los senderos y la
 * cifra de estaciones que lo miden. Y la sección «Viento» sigue apareciendo
 * cuando la capa está puesta, con el reparto entre lo medido y lo modelado. Lo
 * único que se ha movido es el interruptor.
 */

import type { WindState } from '../../hooks/useWindField'
import { t } from '../../i18n'

interface Props {
  on: boolean
  onToggle: () => void
  wind: WindState
}

export function WindAnimation({ on, onToggle, wind }: Props) {
  return (
    <>
      <div className="switches">
        <label>
          <input type="checkbox" checked={on} onChange={onToggle} />
          <span>{t.layers.wind}</span>
        </label>
      </div>

      <p className="dim small">
        Las partículas siguen un campo continuo, y ese campo no sale entero de
        los sensores: <strong>{wind.measuring}</strong> estaciones del Cabildo
        publican velocidad y dirección ahora mismo, y donde no llega ninguna
        entra una rejilla de Open-Meteo como fondo. En esta isla eso importa —el
        alisio, el föhn de sotavento y las brisas de ladera hacen que dos puntos
        a 5 km puedan soplar al revés—, así que la sección «Viento» dice qué
        parte del mapa sostiene cada cosa.
      </p>

      {wind.modelFailed && (
        <p className="warn small">
          El modelo de fondo no ha contestado. El campo se construye solo con
          estaciones: sale con menos cobertura, y no se rellena a ojo.
        </p>
      )}
    </>
  )
}
