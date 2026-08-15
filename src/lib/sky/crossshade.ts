/**
 * La sombra que una nube le echa a OTRA.
 *
 * `selfshade.ts` resuelve lo que una nube se tapa a sí misma y ahí se paraba:
 * cada nube se iluminaba como si estuviera sola en el cielo. Con el alisio
 * apretando eso es justo lo que no pasa —lo que hay es una manta, y en una manta
 * la nube de sotavento está a la sombra de la de barlovento—, y con el sol bajo
 * una hilera de cúmulos se enciende por la punta y se apaga hacia dentro.
 *
 * POR QUÉ NO ES EL MISMO BARRIDO. Hacer esto mota contra mota sería n² sobre la
 * escena entera: 7.074 motas son cincuenta millones de pruebas, y eso ya no cabe
 * ni cada dos minutos. Aquí cada nube es UN volumen —un elipsoide con el radio
 * que tiene y el espesor que tiene— y el barrido es nube contra nube: 290 nubes
 * son 84.000 pruebas, tres órdenes de magnitud menos.
 *
 * Que sea un elipsoide y no una esfera no es un refinamiento: una nube baja mide
 * 2,6 km de radio y 500 m de espesor, y tratarla como esfera la haría dar sombra
 * a dos kilómetros y medio por encima y por debajo de donde de verdad está.
 *
 * LA EXTINCIÓN, otra vez, NO ES UNA CONSTANTE NUEVA: un rayo que cruza una nube
 * de arriba abajo tiene que apagarse exactamente lo que esa nube tapa cuando se
 * dibuja —su `density`—, así que el coeficiente por metro es −ln(1−densidad)
 * dividido por su espesor. Es el mismo principio que en la autosombra, un piso
 * más arriba.
 */

import { M_PER_DEG_LAT, M_PER_DEG_LON } from '../geo'
import { dayFactor, skyVector, type SkyPosition } from '../sun'
import type { Cloud } from './scene'

/**
 * Cuánta luz le queda a cada nube después de atravesar las demás, en el orden en
 * que llegan. 1 = ninguna nube delante.
 *
 * Devuelve el factor del HAZ, no la luz final: quien lo use se lo pasa a
 * `selfShade`, que es quien sabe lo que la nube se tapa a sí misma y cuál es el
 * suelo de dispersión múltiple. Si se aplicara aquí, el suelo se contaría dos
 * veces y una manta cerrada acabaría más clara que una nube suelta.
 */
export function crossShade(
  clouds: readonly Cloud[],
  sun: SkyPosition,
  out?: Float32Array,
): Float32Array {
  const n = clouds.length
  const beam = out && out.length >= n ? out : new Float32Array(n)

  // La misma luz que la autosombra: el sol de día, el cenit de noche, girando
  // entre los dos por el crepúsculo. Tienen que ser la misma o una nube estaría
  // iluminada desde un sitio y sombreada desde otro.
  const day = dayFactor(sun.elevationDeg)
  const [se, sn, su] = skyVector(sun)
  let dx = se * day
  let dy = sn * day
  let dz = su * day + (1 - day)
  const norm = Math.hypot(dx, dy, dz) || 1
  dx /= norm
  dy /= norm
  dz /= norm

  // Todo en metros sobre un plano local. La isla mide 45 km y las nubes se
  // reparten sobre el recuadro del mapa: a esa escala, la curvatura no cambia
  // una sombra.
  const lat0 = clouds.length ? clouds[0].lat : 28.7
  const mPerLon = M_PER_DEG_LON * Math.cos((lat0 * Math.PI) / 180)
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const z = new Float64Array(n)
  const rh = new Float64Array(n)
  const rv = new Float64Array(n)
  const k = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const c = clouds[i]
    x[i] = c.lon * mPerLon
    y[i] = c.lat * M_PER_DEG_LAT
    z[i] = (c.base + c.top) / 2
    rh[i] = c.radiusM
    const thickness = Math.max(1, c.top - c.base)
    rv[i] = thickness / 2
    k[i] = -Math.log(Math.max(1e-6, 1 - Math.min(0.999, c.density))) / thickness
  }

  for (let i = 0; i < n; i++) {
    // EL RAYO SALE DE LA SUPERFICIE DE ESTA NUBE, no de su centro, y es la misma
    // lección que la autosombra: lo que se quiere saber es cuánta luz llega a la
    // cara que mira al sol. Con el origen en el centro, en una manta —donde las
    // nubes se solapan por definición— cada nube arrancaba dentro de dos o tres
    // vecinas y el barrido devolvía 0,18 de luz media para un cielo cubierto de
    // mediodía, que es un cielo cubierto pintado de noche.
    //
    // Dónde está esa superficie sale de la propia ecuación del elipsoide: el
    // rayo unitario la cruza en `1/√((dx/rh)² + (dy/rh)² + (dz/rv)²)`.
    const exit =
      1 /
      Math.sqrt(
        (dx * dx) / (rh[i] * rh[i]) +
          (dy * dy) / (rh[i] * rh[i]) +
          (dz * dz) / (rv[i] * rv[i]),
      )
    const ox = x[i] + dx * exit
    const oy = y[i] + dy * exit
    const oz = z[i] + dz * exit
    let tau = 0
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      // El elipsoide se resuelve como una esfera: se estira el eje vertical
      // hasta que los dos radios coinciden, y con él la dirección del rayo.
      const s = rh[j] / rv[j]
      const lx = x[j] - ox
      const ly = y[j] - oy
      const lz = (z[j] - oz) * s
      const ex = dx
      const ey = dy
      const ez = dz * s
      const len = Math.hypot(ex, ey, ez)
      if (!len) continue
      const ux = ex / len
      const uy = ey / len
      const uz = ez / len
      const tca = lx * ux + ly * uy + lz * uz
      const r2 = rh[j] * rh[j]
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca
      if (d2 >= r2) continue
      const thc = Math.sqrt(r2 - d2)
      const far = tca + thc
      if (far <= 0) continue
      // La cuerda vuelve al espacio real deshaciendo el estirado: la longitud
      // medida en el espacio deformado no son metros de aire.
      const chord = (far - Math.max(0, tca - thc)) / len
      tau += k[j] * chord
    }
    beam[i] = Math.exp(-tau)
  }

  return beam
}
