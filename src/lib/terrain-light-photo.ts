/**
 * La misma luz del sol, pero sobre una foto.
 *
 * POR QUÉ HAY UN SEGUNDO SOMBREADO. El `hillshade` del estilo va DEBAJO de los
 * fondos de GRAFCAN, y la ortofoto es opaca: con el fondo «Satélite» puesto, la
 * luz de `terrain-light.ts` no pinta un solo píxel. Así que sobre los fondos
 * fotográficos el mismo sombreado se dibuja OTRA VEZ, encima del fondo, con la
 * misma dirección, la misma exageración y los mismos colores que abajo. No es
 * otra luz: es la misma capa puesta donde se ve.
 *
 * POR QUÉ NO A PLENA OPACIDAD, que es la única diferencia. **La ortofoto ya
 * viene iluminada**: trae dentro el sol del día del vuelo, cocido en el píxel, y
 * ese sol no se puede apagar. Lo que se dibuja encima tiene que mandar sobre esa
 * luz sin llegar a tapar la foto, que es lo que la gente vino a ver.
 *
 * DE DÓNDE SALE EL 0,35. De medirlo, con `scripts/checks/foto-hillshade.ts`,
 * que reescribe los dos shaders de MapLibre línea a línea —incluida la
 * cuantización a 8 bits de la textura intermedia y la mezcla premultiplicada— y
 * los compone sobre teselas de GRAFCAN pedidas en vivo. Tres recuadros de 6,4 km
 * (pared de la Caldera, colada de Tajogaite y el llano de Aridane), la foto a
 * 8,4 m por píxel, tres alturas de sol. 15 de agosto de 2026.
 *
 * Las dos orillas, en el caso peor —sol a 10° sobre la pared de la Caldera, que
 * es donde el sombreado pega más fuerte porque su opacidad va con el seno de la
 * pendiente—:
 *
 *   opacidad   separación    textura de la foto
 *              luz/sombra    (σ local 5×5, % del original)
 *   0,20       +0,036        81 %
 *   0,30       +0,082        73 %
 *   0,35       +0,105        69 %   ← el elegido
 *   0,40       +0,128        65 %
 *   0,65       +0,243        47 %
 *   1,00       +0,392        34 %
 *
 * LA ORILLA DE ABAJO ESTÁ MEDIDA, no supuesta: a esa hora la luz del vuelo tira
 * en CONTRA —las laderas que miran al sol de ahora salen 0,053 más OSCURAS que
 * las que le dan la espalda, porque el avión pasó con otro sol—. Con 0,20 la luz
 * nueva solo consigue +0,036: no llega a darle la vuelta a la del vuelo. Ese
 * fondo es el que descarta las opacidades tímidas.
 *
 * LA DE ARRIBA ES LA FOTO, y es un presupuesto declarado —como el 0,5 % de daño
 * de `realce/levels.ts`—: en el caso peor tiene que sobrevivir **más de dos
 * tercios** de su textura. Con eso, 0,35 es la opacidad más fuerte que cabe: deja
 * el 69 %, y el siguiente escalón medido, 0,40, ya baja al 65 %.
 *
 * Elegida así, la luz nueva manda **casi el doble** que la del vuelo (0,105
 * contra 0,053, o sea 1,98 veces) en el peor sitio de la isla. Y donde hay foto
 * que mirar en vez de pared vertical, la deja casi entera: **83 % en la colada de
 * Tajogaite y 89 % en el llano de Aridane**.
 *
 * Y no aplasta negros: con 0,35 —y también con 1,00— el 0,00 % de los píxeles de
 * tierra cae por debajo de 0,02 de luminancia sin estar ya ahí. Lo que se pierde
 * es contraste local, no fondo de la imagen.
 *
 * LA EXAGERACIÓN NO SE TOCA. Es la altura del sol traducida a contraste (ver
 * `terrain-light.ts`) y bajarla aquí sería mentir sobre la hora que es. Lo único
 * que cambia entre el sombreado de abajo y el de encima es la opacidad.
 */

import type { TerrainLight } from './terrain-light'

/**
 * Con cuánta fuerza se dibuja el sombreado sobre un fondo fotográfico.
 *
 * Medido; la tabla y las dos orillas están en la cabecera de este fichero.
 */
export const PHOTO_OPACITY = 0.35

/** `#rrggbb` → `rgba(r, g, b, a)`, que es lo que el estilo sabe leer. */
function withAlpha(hex: string, alpha: number): string {
  const ch = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${alpha})`
}

/**
 * La luz de `terrainLight()` tal cual, con los tres colores translúcidos.
 *
 * MapLibre no tiene `hillshade-opacity`: la opacidad de esta capa son los alfas
 * de sus colores, que su shader multiplica por la pendiente igual que multiplica
 * el resto del color. Por eso el ajuste va aquí y no en una propiedad aparte.
 */
export function photoLight(light: TerrainLight, opacity = PHOTO_OPACITY): TerrainLight {
  return {
    direction: light.direction,
    exaggeration: light.exaggeration,
    highlight: withAlpha(light.highlight, opacity),
    shadow: withAlpha(light.shadow, opacity),
    accent: withAlpha(light.accent, opacity),
  }
}
