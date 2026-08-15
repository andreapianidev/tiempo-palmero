/**
 * Lo que hay que decir de «Luz del sol real», y solo eso.
 *
 * APAGADA SE EXPLICA POR QUÉ NO VIENE PUESTA; encendida, qué está pasando. Son
 * dos preguntas distintas y nunca se hacen a la vez: quien no la ha encendido
 * quiere saber qué gana y qué pierde, y quien la tiene encendida ya lo decidió y
 * lo que quiere es entender lo que ve. Enseñar los dos textos siempre era lo que
 * llenaba el panel de párrafos que no venían a cuento.
 */

import type { SkyPosition } from '../../../lib/sun'

interface Props {
  on: boolean
  sun: SkyPosition
  moon: SkyPosition | null
  moonPhase: number
}

export function LightNotes({ on, sun, moon, moonPhase }: Props) {
  if (!on) {
    return (
      <p className="dim small">
        <strong>Se ve mejor y se lee peor</strong>, y por eso no viene puesta. La
        luz fija del noroeste no es un descuido: es una convención con dos siglos
        detrás que deja el mapa igual de legible a cualquier hora. La real hunde
        media isla en sombra al amanecer.
      </p>
    )
  }

  const isDay = sun.elevationDeg > -6
  const moonUp = moon !== null && moon.elevationDeg > -2

  return (
    <>
      <p className="dim small">
        El relieve se ilumina desde donde está el sol ahora mismo, en vez de
        desde el noroeste fijo de la convención cartográfica. Es la misma
        posición con la que ya se dibuja el reflejo sobre el mar y la cara
        encendida de las nubes: con esto, las tres cosas dejan de contradecirse.
      </p>

      <p className="dim small">
        Y con ellas <strong>el cielo de la vista 3D</strong>, que era el cuarto:
        un azul de noche fijo y una bruma gris a cualquier hora. Ahora es el
        mismo cielo que refleja el agua —de los mismos números, no de una copia—,
        así que al atardecer el horizonte se calienta y la bruma con él, y con
        calima el aire se vuelve lechoso porque lo dice el PM10 que miden las
        estaciones.
      </p>

      {!isDay && (
        <p className="dim small">
          {moonUp && moonPhase > 0.15
            ? 'De noche ilumina la luna, desde donde está y con la luz que le corresponde a su fase: fría, floja y de sombras suaves.'
            : 'Sin luna que ilumine, el relieve queda apenas insinuado por la luz del cielo. Se deja un mínimo de sombreado a propósito: la isla se sigue usando de noche para leer la temperatura, y sin forma se lee peor.'}
        </p>
      )}
    </>
  )
}
