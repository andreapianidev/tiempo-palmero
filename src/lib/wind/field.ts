/**
 * Campo de viento continuo sobre la isla.
 *
 * POR QUÉ ESTO ES DISTINTO DEL RESTO DEL MOTOR. La temperatura se interpola
 * entre estaciones porque la altitud explica casi toda su variación y esa
 * relación se puede ajustar y validar. El viento no: en La Palma el alisio del
 * noreste, el efecto föhn a sotavento de la Cumbre y las brisas de ladera
 * hacen que dos estaciones a 5 km puedan soplar en direcciones opuestas, y eso
 * es físicamente cierto, no ruido. Rellenar ese hueco con una media ponderada
 * de las dos inventa un viento que no existe en ningún sitio.
 *
 * LA REGLA, entonces, no es «no se interpola» sino **de dónde sale cada celda**:
 *
 *  1. Cada estación manda en su entorno inmediato, con un radio de influencia
 *     corto (`STATION_SCALE_KM`). Más allá, su peso cae a nada.
 *  2. Donde no llega ninguna estación NO se extiende la más cercana: entra un
 *     MODELO —Open-Meteo, que sí resuelve la orografía— como capa de fondo.
 *  3. Cada celda guarda qué parte de su valor sostienen las estaciones
 *     (`station`, de 0 a 1), y la interfaz lo declara. Un mapa que no distingue
 *     lo medido de lo modelado es exactamente lo que esta aplicación no hace.
 *
 * Se trabaja en componentes u/v, nunca en grados: promediar 350° y 10° da 180°,
 * que es el viento contrario al real.
 */

export interface WindSample {
  lon: number
  lat: number
  /** Componente este, m/s. */
  u: number
  /** Componente norte, m/s. */
  v: number
  source: 'cabildo' | 'model'
}

export interface WindField {
  /** `[oeste, sur, este, norte]`. */
  bounds: [number, number, number, number]
  width: number
  height: number
  /** Fila 0 = norte, como una imagen. */
  u: Float32Array
  v: Float32Array
  /** Cuánto de cada celda sostienen estaciones reales, de 0 a 1. */
  station: Float32Array
  maxSpeed: number
  counts: { stations: number; model: number }
  /**
   * Fracción de la ISLA, de 0 a 1, que sostiene mayoritariamente el modelo.
   *
   * Se cuenta solo sobre tierra, y esto no es un detalle: el rectángulo del
   * campo es bastante más grande que La Palma, así que promediando el mar
   * entero salía un 89 % cuando la parte que de verdad importa —donde vive
   * gente y donde alguien pregunta qué viento hace— está mucho mejor cubierta.
   * Una cifra de cobertura que incluye océano no describe la cobertura de
   * nada.
   */
  modelShare: number
}

/**
 * Radio de influencia de una estación, en km.
 *
 * 3 km no es un número redondo elegido a ojo: es aproximadamente la distancia
 * a la que en esta isla se cruza un barranco o una divisoria, que es donde el
 * viento deja de parecerse al de la estación. Con un radio grande el mapa sale
 * más suave y más falso.
 */
export const STATION_SCALE_KM = 3

/**
 * Peso del modelo en cada celda. Constante y siempre presente: es el fondo
 * sobre el que las estaciones pintan encima. Que valga 1 significa que una
 * estación a distancia 0 aporta la mitad del valor, y a 3 km aporta un 27 %.
 */
const MODEL_WEIGHT = 1

/** Grados → componentes. La dirección meteorológica dice DE DÓNDE viene. */
export function toComponents(speed: number, directionDeg: number): { u: number; v: number } {
  const rad = (directionDeg * Math.PI) / 180
  return { u: -speed * Math.sin(rad), v: -speed * Math.cos(rad) }
}

/** Componentes → dirección meteorológica en grados (de dónde viene). */
export function toDirection(u: number, v: number): number {
  return (270 - (Math.atan2(v, u) * 180) / Math.PI + 360) % 360
}

export function speedOf(u: number, v: number): number {
  return Math.hypot(u, v)
}

/** Distancia rápida en km, buena a esta escala. */
function distanceKm(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const dLat = (aLat - bLat) * 110.574
  const dLon = (aLon - bLon) * 111.32 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLon)
}

/**
 * Construye la malla.
 *
 * El fondo del modelo se resuelve con IDW entre los puntos del modelo —que son
 * una rejilla regular y suave, así que interpolarlos es legítimo— y encima se
 * mezclan las estaciones con peso gaussiano de escala `STATION_SCALE_KM`.
 */
export function buildWindField(
  samples: readonly WindSample[],
  bounds: [number, number, number, number],
  width: number,
  height: number,
  /**
   * Qué celdas son tierra. Solo se usa para `modelShare`: el campo se calcula
   * en todo el rectángulo —las partículas cruzan la costa y tienen que seguir
   * moviéndose— pero la cobertura se mide donde hay isla.
   */
  isLand?: (lon: number, lat: number) => boolean,
): WindField {
  const stations = samples.filter((s) => s.source === 'cabildo')
  const model = samples.filter((s) => s.source === 'model')

  const u = new Float32Array(width * height)
  const v = new Float32Array(width * height)
  const station = new Float32Array(width * height)
  const [west, south, east, north] = bounds

  let maxSpeed = 0
  let modelCells = 0
  let landCells = 0

  for (let j = 0; j < height; j++) {
    const lat = north - ((j + 0.5) / height) * (north - south)
    for (let i = 0; i < width; i++) {
      const lon = west + ((i + 0.5) / width) * (east - west)
      const k = j * width + i

      // Fondo del modelo: IDW sobre la rejilla regular.
      let mu = 0
      let mv = 0
      let mw = 0
      for (const m of model) {
        const d = distanceKm(lon, lat, m.lon, m.lat)
        const w = 1 / (d * d + 0.25)
        mu += m.u * w
        mv += m.v * w
        mw += w
      }
      if (mw > 0) {
        mu /= mw
        mv /= mw
      }

      // Estaciones: influencia local, no global.
      let su = 0
      let sv = 0
      let sw = 0
      for (const s of stations) {
        const d = distanceKm(lon, lat, s.lon, s.lat)
        const w = Math.exp(-((d / STATION_SCALE_KM) ** 2))
        // Por debajo de esto la estación no aporta nada y solo añade ruido.
        if (w < 0.01) continue
        su += s.u * w
        sv += s.v * w
        sw += w
      }

      const modelWeight = model.length ? MODEL_WEIGHT : 0
      const total = sw + modelWeight
      if (total === 0) {
        u[k] = 0
        v[k] = 0
        station[k] = 0
        continue
      }
      u[k] = (su + mu * modelWeight) / total
      v[k] = (sv + mv * modelWeight) / total
      station[k] = sw / total
      if (!isLand || isLand(lon, lat)) {
        landCells++
        if (station[k] < 0.5) modelCells++
      }

      const sp = speedOf(u[k], v[k])
      if (sp > maxSpeed) maxSpeed = sp
    }
  }

  return {
    bounds,
    width,
    height,
    u,
    v,
    station,
    maxSpeed,
    counts: { stations: stations.length, model: model.length },
    // Sin una sola celda de tierra no hay cobertura que declarar; decir 0 %
    // sonaría a «todo medido», que es lo contrario de lo que pasa.
    modelShare: landCells ? modelCells / landCells : 1,
  }
}

export interface FieldReading {
  u: number
  v: number
  /** 0 = solo modelo, 1 = solo estaciones. */
  station: number
}

/**
 * Lee el campo en un punto, con interpolación bilineal.
 *
 * Devuelve `null` fuera de los límites en vez de repetir el borde: una
 * partícula que sale del campo se muere y renace dentro, en vez de arrastrar
 * para siempre el último viento conocido.
 */
export function sampleField(field: WindField, lon: number, lat: number): FieldReading | null {
  const [west, south, east, north] = field.bounds
  if (lon < west || lon > east || lat < south || lat > north) return null

  const fx = ((lon - west) / (east - west)) * field.width - 0.5
  const fy = ((north - lat) / (north - south)) * field.height - 0.5
  const x0 = Math.max(0, Math.min(field.width - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(field.height - 1, Math.floor(fy)))
  const x1 = Math.min(field.width - 1, x0 + 1)
  const y1 = Math.min(field.height - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))

  const mix = (a: number, b: number, c: number, d: number) =>
    (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

  const i00 = y0 * field.width + x0
  const i10 = y0 * field.width + x1
  const i01 = y1 * field.width + x0
  const i11 = y1 * field.width + x1

  return {
    u: mix(field.u[i00], field.u[i10], field.u[i01], field.u[i11]),
    v: mix(field.v[i00], field.v[i10], field.v[i01], field.v[i11]),
    station: mix(field.station[i00], field.station[i10], field.station[i01], field.station[i11]),
  }
}
