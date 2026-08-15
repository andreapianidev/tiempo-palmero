/**
 * Lo que hay que decir de «Sombras arrojadas», y solo cuando están puestas.
 *
 * EL PÁRRAFO DE LAS NUBES PIDE ADEMÁS LA ESCENA ATMOSFÉRICA, que es de donde
 * salen: sin ella no hay ni una nube que proyecte, y contar cómo se estira una
 * sombra de nube al atardecer mientras no hay ninguna en pantalla es exactamente
 * el párrafo que no venía a cuento.
 */

interface Props {
  on: boolean
  /** Si la escena atmosférica está encendida: sin ella no hay sombras de nube. */
  clouds: boolean
}

export function ShadowNotes({ on, clouds }: Props) {
  if (!on) {
    return (
      <p className="dim small">
        Contestan la otra mitad de la pregunta: no hacia dónde mira una ladera,
        sino <strong>qué tiene delante</strong>. Son cosa del sol bajo —por
        encima de 60° de altura no hay ni una— y no dependen de la casilla de
        arriba: sobre la ortofoto son lo único que ilumina la isla.
      </p>
    )
  }

  return (
    <>
      <p className="dim small">
        Las <strong>sombras arrojadas</strong> contestan la otra mitad de la
        pregunta: no hacia dónde mira una ladera, sino qué tiene delante. Se
        calculan sobre el mismo modelo de elevación que pone las cotas, sin pedir
        nada, y son lo que hace que la pared de la Caldera le quite el sol al
        barranco de al lado y que el Roque se proyecte hacia el este al amanecer.
      </p>

      <p className="dim small">
        Son cosa del sol bajo. Medido sobre el modelo: con el sol a 5° hay un{' '}
        <strong>50 % de la isla en sombra propia</strong>, a 10° un 45 %, a 20°
        un 13 %, a 30° un 4 % y por encima de 60° ya no hay ninguna. Y cuanto más
        bajo está el sol, más suaves son —dentro de una sombra sigue entrando la
        luz del cielo, que a esas horas ya es la mayor parte de la que hay—.
      </p>

      {clouds && (
        <p className="dim small">
          Con la <strong>escena atmosférica</strong> encendida, las nubes también
          echan la suya. Cada una cae a <span className="mono">altura ÷ tg(altura
          del sol)</span> de distancia y se estira en la dirección de la luz: a
          mediodía la mancha está casi debajo de la nube, y con el sol a 10° una
          nube a 1.200 m proyecta a 6,8 km, que es por lo que al atardecer aparecen
          sombras donde no hay ninguna nube encima.
        </p>
      )}
    </>
  )
}
