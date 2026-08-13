/**
 * Campo de CO₂ de la red DEMASE: qué se puede pintar entre sensores y qué no.
 *
 * POR QUÉ ESTE CAMPO NO PASA POR `interpolate.ts`. El motor de la isla hace
 * tres cosas que aquí serían un error: ajusta el valor contra la altitud,
 * reparte por IDW hasta 15 km y promedia lo que encuentra. El CO₂ volcánico no
 * sigue ninguna de las tres. Sale del suelo por fracturas, es más denso que el
 * aire y se acumula en hoyos y sótanos: dos sensores separados 20 m dieron
 * 400 y 69 301 ppm el mismo minuto. Un IDW entre esos dos dibuja una pluma que
 * no existe, y —lo que importa de verdad— PROMEDIA A LA BAJA un valor que es
 * de seguridad. Bajar un peligro por interpolar es el único error que este
 * mapa no puede cometer.
 *
 * QUÉ SE PINTA ENTONCES. El valor del sensor MÁS CERCANO, y solo hasta
 * `CO2_NEAR_M`. Nada se promedia y nada se inventa: el color de cada píxel es
 * una medida real tomada a menos de 80 m de ahí. Eso se sostiene porque la red
 * es densa de verdad —209 sensores con una separación mediana de 15 m, medida
 * el 13 ago 2026—, no porque el método sea generoso.
 *
 * Y FUERA DE LA ZONA, NADA. La red cubre Puerto Naos, La Bombilla y el
 * entorno de Los Llanos; en el resto de la isla no hay ni un sensor de CO₂, ni
 * en la red del Cabildo (`airqualityobserved` trae la columna `co2` vacía en
 * las 20 estaciones) ni en ningún otro sitio. Lo único disponible ahí es el
 * fondo atmosférico del modelo CAMS, que da 436–439 ppm en TODA la isla
 * —3 ppm de diferencia sobre una malla de 40 km, o sea ruido de celda—. Un
 * mapa de eso sería un color plano fingiendo estructura, así que no se pinta:
 * el número de fondo se dice con letras en el panel y ya está.
 */

/**
 * Lo que este módulo necesita de un sensor. `Co2Point` lo cumple sin
 * adaptador, y la firma estructural evita que `lib/` acabe importando de
 * `hooks/`, que es la dirección contraria a la que van las dependencias.
 */
export interface Co2Observation {
  lon: number
  lat: number
  /** Los de interior miden una habitación, no el aire de la calle. */
  outdoor: boolean
  /** Lectura de hace más de 15 min: para gas volcánico no vale. */
  stale: boolean
  reading: { ppm: number; at: number } | null
}

/**
 * Hasta dónde llega una medida, en metros.
 *
 * Es ~5 veces la separación mediana de la red (15 m) y ~3 veces el percentil
 * 90 (27 m): dentro de la zona vigilada no deja huecos, y en cuanto la malla
 * se acaba —el sensor suelto de un pozo, el borde del casco— el campo se corta
 * en seco en lugar de estirarse sobre terreno sin vigilar.
 */
export const CO2_NEAR_M = 80

export interface Co2Node {
  lon: number
  lat: number
  ppm: number
  /** Epoch ms de la medida. El campo entero se fecha por la más vieja. */
  at: number
}

export interface Co2Field {
  nodes: Co2Node[]
  /** [[oeste, sur], [este, norte]] en grados, con el margen de máscara sumado. */
  bounds: [[number, number], [number, number]]
  /** El ppm más alto que sostiene el campo ahora mismo. */
  max: number
  /** La más vieja de las lecturas que lo sostienen. */
  oldestAt: number
}

const M_PER_DEG_LAT = 110_574

function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180)
}

/**
 * Los sensores que pueden sostener un campo, y el marco que ocupan.
 *
 * Se cae fuera por tres motivos, y los tres son de fondo: sin lectura no hay
 * nada que pintar; una lectura rancia de gas volcánico es peor que un hueco; y
 * un sensor de interior mide una habitación cerrada, así que dejar que tiña
 * 80 m de calle a su alrededor sería trasladar el aire de un sótano a la acera.
 */
export function buildCo2Field(obs: readonly Co2Observation[]): Co2Field | null {
  const nodes: Co2Node[] = []
  for (const o of obs) {
    if (!o.outdoor || o.stale || !o.reading) continue
    if (!Number.isFinite(o.lon) || !Number.isFinite(o.lat)) continue
    if (!Number.isFinite(o.reading.ppm)) continue
    nodes.push({ lon: o.lon, lat: o.lat, ppm: o.reading.ppm, at: o.reading.at })
  }
  if (!nodes.length) return null

  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  let max = -Infinity
  let oldestAt = Infinity
  for (const p of nodes) {
    if (p.lon < west) west = p.lon
    if (p.lon > east) east = p.lon
    if (p.lat < south) south = p.lat
    if (p.lat > north) north = p.lat
    if (p.ppm > max) max = p.ppm
    if (p.at < oldestAt) oldestAt = p.at
  }

  const padLat = CO2_NEAR_M / M_PER_DEG_LAT
  const padLon = CO2_NEAR_M / mPerDegLon((south + north) / 2)

  return {
    nodes,
    bounds: [
      [west - padLon, south - padLat],
      [east + padLon, north + padLat],
    ],
    max,
    oldestAt,
  }
}

/**
 * El CO₂ en un punto: el del sensor más cercano, o nada.
 *
 * `null` no es un fallo, es la respuesta correcta en casi toda la isla, y la
 * interfaz la pinta como lo que es —transparente— en vez de rellenarla con el
 * vecino más próximo a dos kilómetros.
 */
export function co2At(field: Co2Field, lon: number, lat: number): number | null {
  const kx = mPerDegLon(lat)
  let best = CO2_NEAR_M
  let ppm: number | null = null
  for (const p of field.nodes) {
    const dx = (p.lon - lon) * kx
    const dy = (p.lat - lat) * M_PER_DEG_LAT
    const d = Math.hypot(dx, dy)
    if (d <= best) {
      best = d
      ppm = p.ppm
    }
  }
  return ppm
}
