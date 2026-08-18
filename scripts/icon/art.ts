/**
 * Dónde va la isla dentro del icono, y con qué colores se pinta.
 *
 * El icono NO es una ilustración. La costa es la isohipsa de 1,5 m del mismo
 * DEM con el que el motor corrige la temperatura por altitud, y el relieve de
 * dentro son las mismas alturas: si el modelo cambia, se vuelve a pasar
 * `npm run web:icons` y el icono cambia con él. El anterior era una montaña con
 * un sol —servía para una aplicación del tiempo de cualquier sitio del mundo—.
 *
 * Aquí solo está la geometría y la paleta. `relief.ts` decide el color de cada
 * punto del terreno, `raster.ts` reparte píxeles y `svg.ts` escribe el marcado.
 */

import type { Pt } from '../contour.js'

/** Fondo: el mismo `--ink` de `src/styles.css` y de `web/css/base.css`. */
export const INK = '#0d0c0b'

/**
 * La rampa del terreno, de la costa al Roque.
 *
 * Sale del ámbar de la aplicación —`--amber` es `#e2b45c`— abierto hacia los
 * dos lados: más quemado abajo, más pálido arriba. No es una paleta
 * hipsométrica de atlas (verde-marrón-blanco): esto tiene que leerse como el
 * icono de ESTA aplicación puesto al lado de los suyos, no como un mapa.
 */
export const TERRAIN_LOW = '#7d4a17'
export const TERRAIN_MID = '#d1974a'
export const TERRAIN_HIGH = '#f4d894'

/** Cota a la que la rampa llega arriba del todo. El Roque son 2.426 m. */
export const TERRAIN_CEILING = 2400

/**
 * Los dos colores de la versión plana, la que se dibuja cuando el icono es tan
 * pequeño que el relieve solo sería ruido: el SVG de la pestaña.
 *
 * Son la misma rampa vista de lejos: el promedio de la mitad alta y el de la
 * mitad baja.
 */
export const FLAT_TOP = '#e9c274'
export const FLAT_BOTTOM = '#bd8237'

export interface IconArt {
  /** La costa, cerrada, en coordenadas de 0 a 1 con el eje Y hacia abajo. */
  island: Pt[]
  /** Radio de la esquina del fondo, en fracción del lado. 0 es a sangre. */
  corner: number
  /** De coordenadas del icono a píxeles del DEM. */
  toDem: (x: number, y: number) => Pt
  /** Metros de terreno que ocupa una unidad de coordenada del icono. */
  metersPerUnit: number
}

/**
 * Coloca la costa dentro del lienzo.
 *
 * `content` es la altura que ocupa la isla, y es lo único que distingue a un
 * icono normal de uno `maskable`: Android puede recortar el segundo con un
 * círculo del 80 % del lado, así que la silueta tiene que caber dentro de un
 * radio de 0,4 del centro. Cuánto cabe no se decide a ojo: lo mide
 * `src/pwa/icons.test.ts` sobre el PNG ya escrito.
 *
 * El anillo entra en píxeles del DEM y sale normalizado; la función inversa se
 * devuelve dentro del propio `IconArt` porque el relieve la necesita para saber
 * qué altura le toca a cada píxel.
 */
export function layout(coast: Pt[], content: number, corner: number, metersPerPixel: number): IconArt {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of coast) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }

  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const scale = content / (y1 - y0) // unidades del icono por píxel del DEM

  return {
    island: coast.map(([x, y]) => [0.5 + (x - cx) * scale, 0.5 + (y - cy) * scale]),
    corner,
    toDem: (x, y) => [cx + (x - 0.5) / scale, cy + (y - 0.5) / scale],
    metersPerUnit: metersPerPixel / scale,
  }
}
