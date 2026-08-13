/**
 * De estelas a vértices: lo único de la capa de viento que se puede afirmar sin
 * mirar una pantalla.
 *
 * Sale de `components/wind/WindLayer.ts` por lo mismo que la simulación salió a
 * `particles.ts`: el dibujo necesita un contexto WebGL y una ventana, y esto no
 * necesita ninguna de las dos cosas. Lo que hay aquí es aritmética y un orden de
 * escritura, y las dos se prueban con números.
 *
 * Y HAY QUE PROBARLAS, porque desde que el halo va perpendicular al segmento
 * cada vértice lleva TAMBIÉN el extremo contrario y un signo. Si el extremo
 * contrario se escribe mal, el halo se desplaza en la dirección equivocada; si
 * el signo no se invierte entre los dos vértices, los extremos se van cada uno a
 * un lado y la estela sale girada en vez de desplazada —que es exactamente el
 * aspa que se estaba corrigiendo—. Ninguna de las dos cosas la caza el
 * compilador: las dos son un número en su sitio.
 */

import { TAIL_LENGTH, type ParticleSystem } from './particles'
import { mercatorZ, windAltitudeM } from './altitude'

/**
 * Flotantes por vértice: `x, y, z, otherX, otherY, otherZ, side, alpha, speed,
 * station`.
 */
export const VERTEX_FLOATS = 10

/** Escala de color: a partir de aquí una racha se pinta del tono más fuerte. */
export const STRONG_WIND_MS = 14

/**
 * Mercator normalizado, a mano.
 *
 * Es exactamente lo que hace `MercatorCoordinate.fromLngLat`, pero sin devolver
 * un objeto: a 4200 partículas con estela de catorce son 118.000 objetos por
 * fotograma, y el recolector de basura se notaba en la animación más que el
 * dibujo.
 */
export function mercatorX(lon: number): number {
  return (180 + lon) / 360
}

export function mercatorY(lat: number): number {
  return (
    (180 -
      (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
    360
  )
}

/** Cuántos flotantes hacen falta para un sistema de `count` partículas. */
export function trailBufferSize(count: number): number {
  return count * TAIL_LENGTH * 2 * VERTEX_FLOATS
}

/**
 * Vuelca las estelas a `out` y devuelve cuántos VÉRTICES se han escrito.
 *
 * La conversión a coordenadas Mercator se hace aquí, en CPU, porque el
 * `u_matrix` de MapLibre espera Mercator normalizado, no grados. Son tres
 * operaciones por vértice y ocurre una vez por fotograma.
 *
 * `exaggeration` a cero significa mapa plano: la Z se escribe a cero y ni
 * siquiera se mira la cota. Es el mismo camino de código de siempre.
 */
export function fillTrailVertices(
  p: ParticleSystem,
  out: Float32Array,
  exaggeration: number,
): number {
  const flat = exaggeration <= 0
  let n = 0

  for (let i = 0; i < p.count; i++) {
    const fill = p.tailFill[i]
    if (fill < 1) continue
    const speed = Math.min(1, p.speed[i] / STRONG_WIND_MS)
    const station = p.station[i]
    const base = i * TAIL_LENGTH
    for (let k = 0; k < fill; k++) {
      // El extremo de delante del primer segmento es la posición actual, que
      // todavía no está apuntada; el de los demás, la estela.
      const lon0 = k === 0 ? p.lon[i] : p.tailLon[base + k - 1]
      const lat0 = k === 0 ? p.lat[i] : p.tailLat[base + k - 1]
      const ground0 = k === 0 ? p.elevation[i] : p.tailElevation[base + k - 1]
      const lon1 = p.tailLon[base + k]
      const lat1 = p.tailLat[base + k]
      const ground1 = p.tailElevation[base + k]
      // La cabeza de la estela es la más opaca; la cola se apaga.
      const a0 = 1 - k / (TAIL_LENGTH + 1)
      const a1 = 1 - (k + 1) / (TAIL_LENGTH + 1)

      // Los dos extremos se proyectan una vez y se escriben dos: cada vértice
      // lleva el suyo y el del otro lado, que es lo que el shader necesita para
      // saber hacia dónde va el segmento en pantalla.
      const x0 = mercatorX(lon0)
      const y0 = mercatorY(lat0)
      const z0 = flat ? 0 : mercatorZ(windAltitudeM(ground0, exaggeration), lat0)
      const x1 = mercatorX(lon1)
      const y1 = mercatorY(lat1)
      const z1 = flat ? 0 : mercatorZ(windAltitudeM(ground1, exaggeration), lat1)

      out[n++] = x0
      out[n++] = y0
      out[n++] = z0
      out[n++] = x1
      out[n++] = y1
      out[n++] = z1
      out[n++] = 1
      out[n++] = a0
      out[n++] = speed
      out[n++] = station

      out[n++] = x1
      out[n++] = y1
      out[n++] = z1
      out[n++] = x0
      out[n++] = y0
      out[n++] = z0
      out[n++] = -1
      out[n++] = a1
      out[n++] = speed
      out[n++] = station
    }
  }
  return n / VERTEX_FLOATS
}
