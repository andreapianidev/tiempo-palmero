/**
 * De ver un astro desde el centro de la Tierra a verlo desde donde uno está.
 *
 * QUÉ CORRIGE. Las efemérides dan posiciones geocéntricas: la dirección en la
 * que estaría el astro visto desde el centro del planeta. Nadie mira desde ahí.
 * El desplazamiento vale lo que el radio terrestre dividido por la distancia, y
 * en esta aplicación va de lo enorme a lo despreciable:
 *
 * | Astro | Distancia | Paralaje máxima |
 * |---|---:|---:|
 * | Luna | 0,0026 UA | **57'** — casi dos diámetros lunares |
 * | Venus en conjunción | 0,27 UA | 33" |
 * | Marte en oposición | 0,37 UA | 24" |
 * | Júpiter | 4,0 UA | 2,2" |
 * | Urano | 18 UA | 0,5" |
 * | Una estrella | — | 0 |
 *
 * SE HACE CON VECTORES y no con las fórmulas clásicas sobre la ascensión recta.
 * Es el mismo resultado, y tiene la ventaja de que no hay que volver a entrar
 * en el sistema ecuatorial: la dirección geocéntrica ya está girada a la base
 * local, y el observador en esa misma base es un vector que solo tiene
 * componente norte y arriba —está en el plano de su propio meridiano—,
 * inclinado respecto a la vertical justo lo que separa la latitud geodésica de
 * la geocéntrica.
 *
 * ESTE FICHERO EXISTE PORQUE LO NECESITAN DOS. Lo escribió la luna, y cuando
 * llegaron los planetas la alternativa era copiarlo: dos sitios donde
 * equivocarse con el achatamiento, que es lo que separa 11 minutos de arco de
 * cero.
 */

const RAD = Math.PI / 180

/** Radio ecuatorial de la Tierra, km. WGS84. */
export const EARTH_RADIUS_KM = 6378.137
/** Achatamiento de la Tierra, WGS84. Sin él la paralaje se va 11'. */
const FLATTENING = 1 / 298.257223563

/**
 * Dónde está el observador respecto al centro de la Tierra, en km y en la base
 * local (este, norte, arriba) de su propio sitio.
 *
 * La componente este es siempre cero: el observador está, por definición, en su
 * propio meridiano.
 */
export function observerOffsetKm(
  latDeg: number,
  elevationM: number,
): [number, number, number] {
  const phi = latDeg * RAD
  const u = Math.atan2((1 - FLATTENING) * Math.sin(phi), Math.cos(phi))
  const h = elevationM / 1000 / EARTH_RADIUS_KM
  const rhoSin = (1 - FLATTENING) * Math.sin(u) + h * Math.sin(phi)
  const rhoCos = Math.cos(u) + h * Math.cos(phi)
  const rho = Math.hypot(rhoSin, rhoCos)
  const geocentricLat = Math.atan2(rhoSin, rhoCos)
  // Casi hacia arriba, escorado hacia el ecuador —al sur en el hemisferio
  // norte— por la diferencia entre las dos latitudes.
  const tilt = phi - geocentricLat
  const r = rho * EARTH_RADIUS_KM
  return [0, -r * Math.sin(tilt), r * Math.cos(tilt)]
}

export interface Topocentric {
  /** Dirección unitaria desde el observador, en la base local. */
  direction: [number, number, number]
  /** Distancia al observador, km. */
  distanceKm: number
}

/**
 * Pasa una dirección geocéntrica a topocéntrica.
 *
 * `direction` es unitaria y está en la base local; `distanceKm` es la distancia
 * al CENTRO de la Tierra. Sale la dirección desde donde uno está y la distancia
 * a la que de verdad tiene el astro, que para la luna en el cenit es un radio
 * terrestre menos.
 */
export function toTopocentric(
  direction: [number, number, number],
  distanceKm: number,
  observer: [number, number, number],
): Topocentric {
  const x = distanceKm * direction[0] - observer[0]
  const y = distanceKm * direction[1] - observer[1]
  const z = distanceKm * direction[2] - observer[2]
  const d = Math.hypot(x, y, z)
  return { direction: [x / d, y / d, z / d], distanceKm: d }
}
