/**
 * Los dos avisos de la red de guaguas, que existen porque sin ellos la capa
 * parece rota dos veces seguidas.
 *
 * 1. Son 1,5 MB entre trazados y paradas, y no se piden hasta que alguien
 *    enciende el interruptor. Durante esos segundos la casilla está marcada y
 *    el mapa sigue igual.
 * 2. Las paradas no se dibujan por debajo de z10,5 —913 puntos sobre una isla
 *    de 42 km son una mancha, no un mapa—, y la vista de llegada es z9,6. O
 *    sea: encender «paradas» al llegar no enseña nada, y nadie lo decía.
 *
 * Comprobado en producción el 12 ago 2026: con la casilla marcada a z9,6 el
 * mapa dibujaba cero píxeles de la red.
 */

import { t } from '../../i18n'

interface Props {
  /** Están descargándose los trazados y las paradas. */
  loading: boolean
  /** El zoom actual ya da para ver las paradas. */
  stopsZoomReached: boolean
  /** La red está encendida. */
  on: boolean
}

export function GuaguaHint({ loading, stopsZoomReached, on }: Props) {
  if (!on) return null
  return (
    <>
      {loading && <p className="dim small">{t.guagua.loading}</p>}
      {!loading && !stopsZoomReached && <p className="note small">{t.guagua.zoomForStops}</p>}
    </>
  )
}
