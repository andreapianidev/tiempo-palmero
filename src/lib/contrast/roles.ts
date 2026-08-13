/**
 * Las líneas de referencia del mapa, como tinta y no como cadena de texto.
 *
 * Son las mismas de siempre —el gris cálido de las carreteras, el ámbar de los
 * senderos, el azul frío de las guaguas—, escritas aquí una vez en forma de
 * tono más transparencia para que además de pintarse se puedan **calcular**.
 * `mapStyle.ts` sigue exportando `COLORS` con exactamente los mismos valores;
 * lo único que cambia es de dónde salen.
 *
 * La jerarquía entre ellas es deliberada y está explicada en `mapStyle.ts`: el
 * viario de OSM son 19.770 trazados contra 61 carreteras insulares, y pintados
 * con la misma fuerza convertirían el mapa en un callejero con el tiempo de
 * fondo. Esa jerarquía es lo que `palette.ts` tiene que conservar cuando cambia
 * el fondo — no es un efecto secundario, es el requisito.
 */

import type { Ink } from './ratio'
import { cssRgba } from './ratio'

export type RoleId =
  | 'road'
  | 'osmMain'
  | 'osmLocal'
  | 'osmTrack'
  | 'osmService'
  | 'trail'
  | 'trailNotice'
  | 'trailWarning'
  | 'guagua'
  | 'guaguaBright'
  | 'canal'
  | 'boundary'

const ink = (r: number, g: number, b: number, alpha: number): Ink => ({
  rgb: [r / 255, g / 255, b / 255],
  alpha,
})

export const ROLES: Record<RoleId, Ink> = {
  road: ink(214, 201, 183, 0.42),
  osmMain: ink(208, 196, 178, 0.34),
  osmLocal: ink(200, 190, 175, 0.26),
  osmTrack: ink(190, 174, 150, 0.3),
  osmService: ink(196, 188, 176, 0.2),
  trail: ink(226, 197, 106, 0.5),
  // Los dos avisos van opacos: un aviso que se ve tenue no es un aviso. Y
  // opacos siguen necesitando esta cuenta — sobre papel blanco, el ámbar
  // #e2b45c contrasta 1,7 veces menos que sobre el relieve.
  trailNotice: ink(226, 180, 92, 1),
  trailWarning: ink(209, 72, 63, 1),
  guagua: ink(127, 178, 217, 0.45),
  guaguaBright: ink(168, 210, 239, 1),
  canal: ink(111, 176, 216, 0.55),
  boundary: ink(255, 255, 255, 0.11),
}

export const ROLE_IDS = Object.keys(ROLES) as RoleId[]

/** El color tal cual, para quien solo quiera pintarlo. */
export const roleCss = (id: RoleId): string => cssRgba(ROLES[id])
