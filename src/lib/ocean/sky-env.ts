/**
 * Las cuentas del mapa de cielo que refleja el agua, sin navegador.
 *
 * Es el gemelo de \`components/ocean/shaders/sky.ts\`: la GPU no puede llamar a
 * TypeScript y aquí no puede abrirse un WebGL, así que la convención de la
 * textura equirect —acimut en la horizontal desde el norte hacia el este,
 * elevación en la vertical, el horizonte en la línea del medio— vive en los dos
 * sitios y se prueba aquí. Si las dos convenciones se separaran, las nubes del
 * reflejo saldrían giradas o al revés, y a simple vista el mar seguiría
 * pareciendo un mar.
 *
 * El punto de vista es el centro del recuadro insular, a nivel del mar. El
 * cielo está en el infinito, así que una nube lejana no cambia de dirección
 * aunque el agua que la refleja esté a veinte kilómetros de ese centro; la
 * nube del alisio sí se mueve unos grados —su cota es un décimo de la isla— y
 * ese desplazamiento se acepta: es el precio de pintar el cielo UNA vez para
 * todos los píxeles de agua.
 */

import { M_PER_DEG_LAT, M_PER_DEG_LON } from '../geo'

/** Lado de la textura. Ver \`SkyEnv.ts\`: caben cuatro nubes grandes de ancho. */
export const ENV_W = 256
export const ENV_H = 128

export const ENV_LON0 = -17.86
export const ENV_LAT0 = 28.66

/**
 * Dónde cae una nube en la textura, y de qué tamaño.
 *
 * La posición entra en grados y metros, que es como vive la escena; la salida
 * en UV y en texeles, que es como vive la GPU. `radiusTexels` es el DIÁMETRO
 * del disco con el que se pinta, no el radio: así el sombreador no tiene que
 * saber geometría de puntos.
 */
export function cloudEnvRect(
  lon: number,
  lat: number,
  altitudeM: number,
  radiusM: number,
): { u: number; v: number; radiusTexels: number; distanceM: number } {
  const dx = (lon - ENV_LON0) * M_PER_DEG_LON * Math.cos((ENV_LAT0 * Math.PI) / 180)
  const dy = (lat - ENV_LAT0) * M_PER_DEG_LAT
  const dz = Math.max(0, altitudeM)
  const horiz = Math.max(1, Math.hypot(dx, dy))
  const az = Math.atan2(dx, dy)
  const el = Math.atan2(dz, horiz)
  const radius = Math.atan(radiusM / horiz)
  const u = az / (2 * Math.PI) + 0.5
  const v = 0.5 - el / Math.PI
  return {
    u: ((u % 1) + 1) % 1,
    v,
    radiusTexels: Math.max(2, (2 * radius * ENV_W) / (2 * Math.PI)),
    distanceM: horiz,
  }
}

/** La dirección del mundo que corresponde a un texel: el gemelo de \`envUv\`. */
export function envDirection(u: number, v: number): [number, number, number] {
  const az = (u - 0.5) * 2 * Math.PI
  const el = (0.5 - v) * Math.PI
  return [Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az), Math.sin(el)]
}
