/**
 * El cielo de la vista 3D, a la hora que es.
 *
 * QUÉ ES ESTO Y QUÉ NO. Es la cúpula de MapLibre —`map.setSky()`: color del
 * cenit, color del horizonte y la bruma de distancia— y nada más. Las nubes son
 * otra cosa y viven en `lib/sky/`; esto es el aire vacío que hay detrás de
 * ellas, que en vista inclinada es media pantalla.
 *
 * EL CUARTO SOL. La aplicación ya dibujaba el reflejo sobre el mar desde la
 * posición real del sol, las nubes encendidas por la cara que les toca y —desde
 * hace poco— el relieve iluminado desde donde está. El cielo detrás de todo eso
 * seguía siendo un color fijo: `#070a12` de cenit, `#3a4152` de horizonte y una
 * bruma `#141924`, a las tres de la tarde igual que a medianoche. O sea un cielo
 * nocturno permanente encima de un mar que sí sabía qué hora era.
 *
 * DE DÓNDE SALEN LOS COLORES, que es la única decisión importante de este
 * fichero: **de `ocean/light.ts`, sin recalcular nada.** Ese módulo ya computa
 * el cenit y el horizonte para el agua, y lo hace con más de lo que tiene la
 * geometría — el índice de claridad de la radiación MEDIDA por las estaciones y
 * el PM10 de la calima—. Reproducir aquí ese cálculo sería un quinto sol, y de
 * los caros: el mar refleja el cielo, así que dos cielos distintos se ven
 * contradiciéndose en el mismo fotograma, uno encima del horizonte y otro debajo.
 *
 * LO ÚNICO QUE SE AÑADE ES UN SUELO, y está en la cabecera de `SKY`: el
 * horizonte tiene que separarse del mar lo justo para que la silueta de la isla
 * se lea. El mar puede irse a negro de noche porque debajo sigue estando el
 * mapa; la línea del horizonte no, porque es la que dice dónde acaba la isla.
 * Así que la noche de esta cúpula NO es la noche física del mar —que es más
 * oscura— sino los colores de casa, y el día sí es el medido. Se mezclan con
 * `dayFactor`, la misma rampa de crepúsculo que apaga las nubes y la lluvia.
 *
 * Es la misma estructura que `terrain-light.ts`: un extremo de casa, un extremo
 * real, y una mezcla continua entre los dos que no hay que vigilar porque no
 * tiene ramas.
 *
 * LA BRUMA ES EL COLOR DEL HORIZONTE, y no un tercer color a elegir. La
 * perspectiva aérea converge exactamente a la radiancia del cielo en la
 * dirección en que se mira: una cumbre infinitamente lejana se ve del color del
 * horizonte, ni más claro ni más oscuro. Cuánto se llega a fundir por los 45 km
 * que mide esta isla no es cosa del color sino de la geometría —
 * `fog-ground-blend` y `horizon-fog-blend`—, y esos dos se quedan como estaban.
 */

import type { SkySpecification } from 'maplibre-gl'
import type { OceanLight, Rgb } from './ocean/light'
import { dayFactor, type SkyPosition } from './sun'
import { SKY } from './terrain'

/** `#rrggbb` → 0-1 por canal. */
function fromHex(hex: string): Rgb {
  const ch = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return [ch(0), ch(1), ch(2)]
}

/** 0-1 por canal → `#rrggbb`. */
function toHex(c: Rgb): string {
  const ch = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${ch(c[0])}${ch(c[1])}${ch(c[2])}`
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/**
 * La noche de esta cúpula: los colores fijos que había antes de todo esto.
 *
 * Se leen de `SKY` en vez de copiarse porque son el mismo cielo —el que se ve
 * con el interruptor apagado— y con dos copias, cambiar el de fábrica dejaría la
 * noche del cielo real yéndose a un color que ya no es de nadie. Es la misma
 * razón por la que `HILLSHADE_DEFAULT` vive en `terrain-light.ts`.
 */
const NIGHT = {
  zenith: fromHex(SKY['sky-color'] as string),
  horizon: fromHex(SKY['horizon-color'] as string),
  fog: fromHex(SKY['fog-color'] as string),
}

/**
 * El cielo de ahora mismo, listo para `map.setSky()`.
 *
 * `light` es el mismo objeto que ilumina el agua: quien lo llame tiene que
 * pasarle el de este instante, no el de `Date.now()`, o el cielo y el sol dejan
 * de estar a la misma hora en cuanto alguien mueva la barra del tiempo.
 */
export function skyDome(light: OceanLight, sun: SkyPosition): SkySpecification {
  const day = dayFactor(sun.elevationDeg)
  const horizon = mix(NIGHT.horizon, light.horizon, day)
  return {
    ...SKY,
    'sky-color': toHex(mix(NIGHT.zenith, light.zenith, day)),
    'horizon-color': toHex(horizon),
    // La bruma converge al horizonte, así que de día ES el horizonte. De noche
    // no: ahí manda el color de casa, que es más oscuro que su horizonte a
    // propósito —el suelo de legibilidad es para la línea del horizonte, no
    // para la ladera de delante—.
    'fog-color': toHex(mix(NIGHT.fog, light.horizon, day)),
  }
}
