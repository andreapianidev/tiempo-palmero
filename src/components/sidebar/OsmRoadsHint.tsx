/**
 * Lo que hay que decir de la capa del viario, que no cabe en el nombre de una
 * casilla y sin lo cual la capa parece rota tres veces distintas.
 *
 * 1. Son 5,2 MB y no se piden hasta que alguien enciende el interruptor.
 *    Durante esos segundos la casilla está marcada y el mapa sigue igual.
 * 2. Las pistas y los accesos —14.003 de los 19.770 trazados— no se dibujan por
 *    debajo de z13, y la vista de llegada es z9,6. O sea: encenderla al llegar
 *    enseña la red principal, que ya se parece a lo que había.
 * 3. Si la descarga falla, el mapa tampoco cambia, y sin aviso eso es
 *    indistinguible de que la capa no haga nada.
 *
 * Y una leyenda de una línea, porque la discontinua significa algo: en La Palma
 * la diferencia entre una pista de tierra y un acceso asfaltado decide si se
 * pasa con un coche normal.
 */

import { t } from '../../i18n'

interface Props {
  /** Se está descargando el fichero. */
  loading: boolean
  /** La descarga falló. */
  failed: boolean
  /** El zoom actual ya da para ver las pistas y los accesos. */
  tracksZoomReached: boolean
  /** La capa está encendida. */
  on: boolean
}

export function OsmRoadsHint({ loading, failed, tracksZoomReached, on }: Props) {
  if (!on) return null
  return (
    <>
      {loading && <p className="dim small">{t.viario.loading}</p>}
      {failed && <p className="note small">{t.viario.failed}</p>}
      {!loading && !failed && !tracksZoomReached && (
        <p className="note small">{t.viario.zoomForTracks}</p>
      )}
      {!loading && !failed && <p className="dim small">{t.viario.legend}</p>}
    </>
  )
}
