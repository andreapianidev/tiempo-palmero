/**
 * La misma isla, en marcado, para la pestaña del navegador.
 *
 * ES LA VERSIÓN PLANA A PROPÓSITO. El SVG lo pinta el navegador a 16 o a 32 px
 * —y a 64 en una pestaña anclada—, tamaños en los que el relieve sombreado de
 * los PNG no es detalle sino grano. Es la misma silueta, la misma esquina y la
 * misma rampa ámbar vista de lejos: `raster.ts` dibuja exactamente esto cuando
 * le piden un tamaño pequeño, y así la familia no se rompe por el camino.
 *
 * SIN ATRIBUTO `style` NI `<style>`: la CSP del sitio no admite estilo en línea
 * —lo dice también la cabecera de `web-island.ts`—, y los atributos de
 * presentación no cuentan como tal.
 */

import { FLAT_BOTTOM, FLAT_TOP, INK, type IconArt } from './art.js'

/** Lado del lienzo. Es solo el `viewBox`: escala a cualquier tamaño. */
const VIEW = 512

const n = (v: number): string => String(Math.round(v * 10) / 10)

export function toSvg(art: IconArt): string {
  const path =
    art.island.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x * VIEW)} ${n(y * VIEW)}`).join('') + 'Z'

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${VIEW}" height="${VIEW}">
  <defs>
    <linearGradient id="cumbre" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${FLAT_TOP}"/>
      <stop offset="1" stop-color="${FLAT_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${VIEW}" height="${VIEW}" rx="${n(art.corner * VIEW)}" fill="${INK}"/>
  <path d="${path}" fill="url(#cumbre)"/>
</svg>
`
}
