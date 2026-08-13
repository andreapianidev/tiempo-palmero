/**
 * Qué marcadores quedan escondidos detrás de la montaña, con la vista 3D.
 *
 * POR QUÉ ESTO NO LO HACE MAPLIBRE. Sí lo hace, y ahí está el problema. Con el
 * terreno encendido, cada marcador pregunta por su cuenta si está tapado, y lo
 * pregunta LEYENDO UN PÍXEL DEL BÚFER DE PROFUNDIDAD de la tarjeta gráfica
 * (`Marker._updateOpacity` → `terrain.depthAtPoint` → `gl.readPixels`). Un
 * `readPixels` obliga a la CPU a esperar a que la GPU termine todo lo que
 * tuviera pendiente: es una barrera completa, y cuesta mucho más que dibujar el
 * marcador.
 *
 * Medido sobre esta aplicación: la vista 3D con la isla entera en pantalla
 * tiene del orden de 130 marcadores —pines de estación, topónimos, aforos,
 * cámaras—, cada uno pregunta hasta dos veces y su propio limitador los deja en
 * diez veces por segundo. Son hasta 2.600 barreras por segundo, y por eso la
 * 3D se iba frenando conforme aparecían más marcadores al arrastrar el mapa.
 *
 * LA ALTERNATIVA. El modelo de elevación ya está en memoria: es el mismo con el
 * que se interpola la temperatura y con el que se sombrea el relieve. Recorrer
 * la línea entre la cámara y el marcador y mirar si el terreno la corta cuesta
 * unas decenas de consultas a un `Float32Array`, sin tocar la GPU y sin esperar
 * a nadie. La respuesta es además MÁS estable, porque no depende de qué teselas
 * de relieve hayan terminado de cargar.
 */

/** Metros por grado. A esta latitud sobra con la aproximación plana. */
const M_PER_DEG_LAT = 110_574
const M_PER_DEG_LON = 111_320

export interface Viewpoint {
  lon: number
  lat: number
  /** Altura de la cámara sobre el nivel del mar, m. */
  altitudeM: number
}

export interface Target {
  lon: number
  lat: number
  /** Cota del terreno donde está el marcador, m. */
  elevationM: number
}

/**
 * Cuántos puntos se miran entre la cámara y el marcador.
 *
 * 48 sobre los 45 km que puede medir la isla de punta a punta son 940 m por
 * paso, y sobre los 3 km de un caso normal, 62 m: del orden del propio DEM, que
 * tiene 33,5 m. Subir a 96 dobla el coste y no cambia ninguna respuesta, porque
 * lo que tapa un pin en esta isla son crestas de cientos de metros de ancho, no
 * agujas de sesenta.
 */
const SAMPLES = 48

/**
 * Margen vertical, en metros, antes de dar un marcador por tapado.
 *
 * 12 m. Sin margen, la propia ladera en la que ESTÁ el pin lo tapa a sí mismo
 * en cuanto la vista se pone rasante, porque la línea de visión sale justo del
 * suelo. Doce metros son un pelo por encima del error del DEM (33,5 m de celda
 * en un terreno que sube 300 m en esa distancia) y por debajo de la altura de
 * cualquier cresta que de verdad tape algo.
 */
const CLEARANCE_M = 12

/**
 * ¿Hay terreno entre la cámara y el marcador?
 *
 * `elevationAt` devuelve `null` fuera del modelo; ahí se supone nivel del mar,
 * que es lo que hay: mar abierto no tapa nada.
 */
export function isOccluded(
  camera: Viewpoint,
  target: Target,
  elevationAt: (lon: number, lat: number) => number | null,
  exaggeration = 1,
): boolean {
  const dLon = target.lon - camera.lon
  const dLat = target.lat - camera.lat
  const cosLat = Math.cos((((camera.lat + target.lat) / 2) * Math.PI) / 180)
  const distanceM = Math.hypot(dLat * M_PER_DEG_LAT, dLon * M_PER_DEG_LON * cosLat)
  // Con la cámara casi encima del punto no hay nada que se interponga, y la
  // cuenta se volvería sensible a un metro de error.
  if (distanceM < 150) return false

  const cameraZ = camera.altitudeM
  const targetZ = target.elevationM * exaggeration

  // Se salta el primer y el último 4 % del trayecto: en los dos extremos la
  // línea de visión sale del propio suelo y cualquier ruido la corta.
  for (let i = 1; i < SAMPLES; i++) {
    const t = 0.04 + (i / SAMPLES) * 0.92
    const lon = camera.lon + dLon * t
    const lat = camera.lat + dLat * t
    const ground = elevationAt(lon, lat)
    if (ground === null) continue
    const sight = cameraZ + (targetZ - cameraZ) * t
    if (ground * exaggeration > sight + CLEARANCE_M) return true
  }
  return false
}
