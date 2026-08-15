/**
 * El aviso de que la vista no está en condiciones de ver el cielo — con el
 * botón que la pone.
 *
 * POR QUÉ HAY UN BOTÓN Y NO SOLO UNA FRASE. Porque la frase ya estaba, en su
 * sitio y en presente —«con este fondo la cámara solo se inclina hasta 65°»— y
 * no sirvió: lo que se ve es una casilla marcada y un cielo vacío, y eso se
 * parece demasiado a una avería como para ponerse a leer un párrafo. Explicar un
 * problema que uno mismo puede arreglar de un chasquido es dejar el trabajo a
 * medias.
 *
 * DOS COSAS LO IMPIDEN, y las dos se arreglan con lo mismo: la vista en plano
 * —donde no hay cielo, porque el horizonte está en el infinito— y un fondo de
 * GRAFCAN, donde la cámara se queda en 65° y el horizonte no llega a entrar en
 * pantalla. Ver `lib/sky/sun-screen.ts`.
 *
 * LO USAN LAS DOS CASILLAS QUE DIBUJAN EN EL CIELO, el disco y la carrera, con
 * la misma frase: es el mismo problema y tiene el mismo arreglo.
 */

interface Props {
  /** La vista 3D. En plano no hay cielo donde dibujar. */
  view3d: boolean
  /** Hasta qué altura del cielo llega la pantalla con el fondo puesto. */
  ceilingDeg: number
  onPrepareSky: () => void
}

const EN_PLANO =
  'con la vista en plano no hay cielo donde dibujarlo: el horizonte está en el infinito y lo que se ve es el mapa, mirado desde arriba.'

const SIN_CIELO =
  'con este fondo la cámara solo se inclina hasta 65°, y con esa inclinación el horizonte no llega a entrar en pantalla. Hace falta el fondo de relieve, que llega a 75°.'

/** `null` cuando no hay nada que arreglar, que es lo normal. */
export function SkyFix({ view3d, ceilingDeg, onPrepareSky }: Props) {
  const problema = !view3d ? EN_PLANO : ceilingDeg <= 0 ? SIN_CIELO : null
  if (problema === null) return null

  return (
    <p className="dim small">
      <strong>Ahora mismo: </strong>
      {problema}{' '}
      <button type="button" className="chip-btn" onClick={onPrepareSky}>
        Prepárame la vista
      </button>
    </p>
  )
}
