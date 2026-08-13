/**
 * Lo que hay que decir de la capa de TDT y no cabe en el nombre de la casilla.
 *
 * La leyenda no es decorativa: sin ella, una mancha violeta que cubre la mitad
 * de la isla se lee como «aquí hay televisión y en el resto no», y eso es
 * exactamente lo que el dato NO dice. Son los repetidores, es un cálculo y es
 * de 2018.
 */

import { t } from '../../i18n'

interface Props {
  loading: boolean
  failed: boolean
  /** La capa está encendida. */
  on: boolean
}

export function TdtHint({ loading, failed, on }: Props) {
  if (!on) return null
  return (
    <>
      {loading && <p className="dim small">{t.tdt.loading}</p>}
      {failed && <p className="note small">{t.tdt.failed}</p>}
      {!failed && <p className="dim small">{t.tdt.legend}</p>}
    </>
  )
}
