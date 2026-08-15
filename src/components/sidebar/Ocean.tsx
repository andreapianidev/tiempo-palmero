/**
 * Las cartas del mar: balizamiento y profundidad.
 *
 * ESTE FICHERO ERA MÁS GRANDE. Tenía además el interruptor del mar en
 * movimiento, su ajuste de calidad y sus avisos, y eso eran dos
 * responsabilidades en un sitio: aquí se encienden CARTAS —cartografía ajena,
 * publicada, que se pide y se dibuja tal cual— y allí se encendía una
 * SUPERFICIE CALCULADA. El mar en movimiento se ha ido a «Experimental», que es
 * donde están las funciones que dibujan más de lo que miden, y este fichero se
 * queda con lo que sí es dato de otro: `SeaMotion.tsx`.
 *
 * NINGUNA DE LAS DOS DEPENDE YA DEL MAR SIMULADO. Estaban deshabilitadas
 * mientras estuviera apagado, razonando que sin agua debajo serían dos capas
 * sueltas sobre el color de fondo. No es cierto —se dibujan sobre cualquier
 * fondo— y el precio era absurdo: para ver la batimetría publicada de EMODnet
 * había que encender antes una simulación.
 *
 * Lo que este archivo NO hace es contar cómo está el mar; eso es otra cosa y
 * está en `OceanStatus`. Aquí solo hay decisiones.
 */

interface Props {
  /** Faros, boyas y puertos de OpenSeaMap: la carta náutica de verdad. */
  seamarks: boolean
  onSeamarks: () => void
  /** La escala de color de profundidad de EMODnet. Otra cosa, y muy visible. */
  depth: boolean
  onDepth: () => void
  /** El mar simulado está puesto. Solo cambia lo que se ADVIERTE, no qué se ve. */
  seaOn: boolean
}

export function Ocean({ seamarks, onSeamarks, depth, onDepth, seaOn }: Props) {
  return (
    <>
      <ul className="switches">
        <li>
          <label>
            <input type="checkbox" checked={seamarks} onChange={onSeamarks} />
            <span>Faros, boyas y puertos</span>
          </label>
        </li>
        <li>
          <label>
            <input type="checkbox" checked={depth} onChange={onDepth} />
            <span>Profundidad en color</span>
          </label>
        </li>
      </ul>

      {seamarks && (
        <p className="dim small">
          Balizamiento de OpenSeaMap, cartografiado por navegantes: faros con su
          característica, boyas cardinales y laterales, puertos y zonas
          restringidas. Por debajo del zoom 9 no hay balizas que enseñar.
        </p>
      )}

      {depth && (
        <p className="dim small">
          La escala de color de EMODnet, la misma batimetría con la que el motor
          decide dónde rompe la ola. <strong>Rojo es somero, azul es hondo:</strong>{' '}
          la franja roja pegada a la costa es lo poco que hay de plataforma antes
          de que el talud caiga, de 0 a 4.000 m en veinte kilómetros. No es una
          carta náutica ni son rutas —es un mapa de profundidad—.
          {seaOn && ' Mientras esté puesta tapa el agua en movimiento, que es lo que hay debajo.'}
        </p>
      )}
    </>
  )
}
