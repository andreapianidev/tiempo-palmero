/**
 * Qué le pasa a la luz sobre cada fondo.
 *
 * SOLO APARECE CUANDO CAMBIA ALGO. Sobre el relieve propio —el fondo de casa— no
 * hay nada que contar: la luz y las sombras se dibujan como se han descrito.
 * Sobre la ortofoto y sobre la carta topográfica sí, y ahí es cuando se enseña.
 * Antes estaba siempre puesto, así que quien mirara el relieve leía un párrafo
 * sobre un fondo de satélite que no tenía puesto.
 */

import type { BasemapId } from '../../../lib/basemaps'

interface Props {
  basemap: BasemapId
  /** Habla de estas dos: sin ninguna encendida no hay nada que matizar. */
  on: boolean
  shadows: boolean
}

export function BasemapNote({ basemap, on, shadows }: Props) {
  if (!on && !shadows) return null

  if (basemap === 'satelite') {
    return (
      <p className="dim small">
        Sobre el fondo de <strong>satélite</strong>, la ortofoto es opaca y tapa
        el sombreado del relieve, así que ahí la luz se vuelve a dibujar encima
        de la foto, a un tercio de fuerza: lo justo para mandar sobre la luz del
        día del vuelo —que va cocida en la imagen y tira por donde le da la
        gana— sin borrar lo que se ha venido a ver.
      </p>
    )
  }

  if (basemap === 'topografico') {
    return (
      <p className="dim small">
        Sobre la carta <strong>topográfica</strong> la luz no se dibuja: es
        papel, y sus curvas de nivel ya cuentan el relieve. Las sombras
        arrojadas sí siguen saliendo.
      </p>
    )
  }

  return null
}
