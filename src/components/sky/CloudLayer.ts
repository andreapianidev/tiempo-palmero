/**
 * Capa personalizada de MapLibre: las nubes.
 *
 * `renderingMode: '3d'`, que es la mitad del efecto — la misma razón que en la
 * capa de vapor. En modo 3D MapLibre deja la capa dentro del pase con búfer de
 * profundidad, así que la Cumbre **tapa** la nube que hay detrás en vez de
 * dejarla flotar por encima del relieve. Con eso, una manta a 1200 m se ve
 * cortada por las paredes de la Caldera exactamente por donde las corta de
 * verdad, y las cumbres de más de 1600 m salen POR ENCIMA de la manta. Sin eso,
 * la escena entera se lee como una calcomanía pegada sobre la montaña.
 *
 * TODO SE ORDENA DE ATRÁS ADELANTE cada fotograma, en dos niveles: primero las
 * nubes entre sí, después las motas dentro de cada nube. Se prueba contra la
 * profundidad pero no se escribe en ella —si cada mota escribiera la suya, las
 * de detrás desaparecerían al cruzar por donde ya hay otra y la masa se llenaría
 * de agujeros—, y sin escritura de profundidad el orden de mezcla pasa a ser
 * cosa nuestra.
 *
 * El segundo nivel se dejó fuera al principio, con el argumento de que dentro de
 * una nube todas las motas tienen el mismo color y el desorden no se vería. Es
 * falso, y se vio en cuanto se miró: NO tienen el mismo color —la base va oscura
 * y la cima iluminada— y con veintidós motas al 45 % de opacidad las últimas que
 * se dibujan deciden prácticamente el resultado. Sin ordenarlas, la que mandaba
 * era una cualquiera y toda la escena salía del gris medio del interior de las
 * nubes. Ordenar por grupos, además, es más barato que ordenar las motas de la
 * escena entera de una vez.
 *
 * NO PIDE NI UN BYTE POR SU CUENTA. La escena viene de `lib/sky/`, que se
 * construye con la rejilla del modelo que ya descarga el hook. Esta clase
 * mueve, ordena y dibuja.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { metersPerPixel } from '../../lib/geo'
import { mercatorZ } from '../../lib/wind/altitude'
import { RAIN_HEAVY_MM } from '../../lib/sky/field'
import { driftClouds, type Cloud } from '../../lib/sky/scene'
import { dayFactor, type SolarPosition } from '../../lib/sun'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

export const CLOUD_LAYER_ID = 'sky-clouds'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

const RAD = Math.PI / 180

/** Techo del paso de integración, como en el vapor. */
const MAX_DT = 0.1

/** Floats por vértice: `x, y, z` y `radio, alfa, sombra, semilla`. */
const STRIDE_FLOATS = 7

/**
 * Cuántas motas se solapan, de media, sobre un punto del interior de una nube.
 *
 * Sirve para repartir la opacidad: para que una nube de espesor óptico `D` salga
 * con ese espesor y no completamente blanca, cada una de las `n` motas que se
 * apilan tiene que valer `1 − (1 − D)^(1/n)`, que es la inversa de componer `n`
 * capas translúcidas. Sin esto, veintidós motas al 95 % dan blanco puro y un
 * cirro tenue se vuelve indistinguible de un estratocúmulo.
 *
 * 5 es una estimación de dibujo, no una medida: las motas no se solapan igual en
 * el centro que en el borde. Es la cifra con la que la diferencia entre los tres
 * estratos se ve como lo que es —el cirro deja pasar el fondo, la manta no.
 */
const EFFECTIVE_OVERLAP = 5

/**
 * Cuánto oscurece la base de cada estrato, de 0 a 1.
 *
 * Sube con el espesor óptico: la manta baja es la que más luz para antes de
 * llegar abajo, el cirro casi ninguna. Dibujo, con la física detrás explicada en
 * la cabecera de `shaders.ts`.
 */
const BASE_SHADE: Record<Cloud['etage'], number> = { low: 0.45, mid: 0.32, high: 0.1 }

/**
 * Qué fracción de la nube, desde la base, participa del oscurecimiento.
 *
 * 0,55: la mitad de abajo larga. Por encima de esa altura la mota se dibuja
 * plenamente iluminada. Ver el comentario en `fillVertices`, que es donde se
 * explica por qué una rampa lineal apagaba la nube entera.
 */
const SHADE_DEPTH = 0.55

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('no se pudo crear el shader de nubes')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de nubes no compila: ${log}`)
  }
  return shader
}

/**
 * Mercator normalizado, a mano. Igual que en `WindLayer` y `VaporLayer`: se
 * escribe aquí en vez de crear un `MercatorCoordinate` por mota y por fotograma.
 */
function mercatorX(lon: number): number {
  return (180 + lon) / 360
}

function mercatorY(lat: number): number {
  return (
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
  )
}

/** La `w` de un punto tras la matriz de vista: el divisor de la perspectiva. */
function clipW(m: ViewMatrix, x: number, y: number, z: number): number {
  const a = m as unknown as ArrayLike<number>
  return a[3] * x + a[7] * y + a[11] * z + a[15]
}

/**
 * El sol, pasado a la base de la cámara.
 *
 * ESTO NO ES UNA APROXIMACIÓN. Una luz direccional está en el infinito, así que
 * lo único que hace falta es expresar su dirección en los ejes del observador, y
 * eso son tres productos escalares con la base que definen el rumbo y la
 * inclinación del mapa. El resultado es exacto para cualquier orientación:
 * girando el mapa, la cara iluminada de las nubes gira con el sol y no con la
 * pantalla.
 *
 * La base, con `b` el rumbo (la dirección que queda arriba) y `p` la
 * inclinación:
 *
 *   - horizontal hacia arriba de la pantalla: `f = (sin b, cos b, 0)`
 *   - derecha de la pantalla: `f` girada 90° a la derecha = `(cos b, −sin b, 0)`
 *   - arriba de la pantalla: `f·cos p + arriba·sin p`
 *   - hacia el observador: `−f·sin p + arriba·cos p`
 *
 * Se comprueba sola en los extremos: sin inclinación —cámara cenital— «hacia el
 * observador» es el arriba del mundo, y con 90° de inclinación es el sur si se
 * mira al norte.
 */
function sunToCamera(
  sun: SolarPosition,
  bearingDeg: number,
  pitchDeg: number,
): [number, number, number] {
  const b = bearingDeg * RAD
  const p = pitchDeg * RAD
  const el = sun.elevation * RAD
  const az = sun.azimuth * RAD

  // El sol en la base local: este, norte, arriba.
  const se = Math.cos(el) * Math.sin(az)
  const sn = Math.cos(el) * Math.cos(az)
  const su = Math.sin(el)

  const fe = Math.sin(b)
  const fn = Math.cos(b)

  const x = se * Math.cos(b) + sn * -Math.sin(b)
  const y = se * (fe * Math.cos(p)) + sn * (fn * Math.cos(p)) + su * Math.sin(p)
  const z = se * (-fe * Math.sin(p)) + sn * (-fn * Math.sin(p)) + su * Math.cos(p)
  return [x, y, z]
}


export class CloudLayer implements CustomLayerInterface {
  readonly id = CLOUD_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aPos = -1
  private aShape = -1
  private uMatrix: WebGLUniformLocation | null = null
  private uPixelRatio: WebGLUniformLocation | null = null
  private uPxPerMeter: WebGLUniformLocation | null = null
  private uRefW: WebGLUniformLocation | null = null
  private uSunDir: WebGLUniformLocation | null = null
  private uDay: WebGLUniformLocation | null = null

  private clouds: Cloud[] = []
  private visible = false
  private exaggeration = 1
  private lastFrame = 0
  private sun: SolarPosition = { elevation: 45, azimuth: 180 }

  private vertices = new Float32Array(0)
  /** Índices de nube ordenados de atrás adelante. Se reutiliza el array. */
  private order: number[] = []
  /**
   * Índices de las motas de UNA nube, para ordenarlas dentro de ella. Se
   * reutiliza entre nubes y entre fotogramas: reservarlo aquí evita crear un
   * array por nube y por fotograma, que con 300 nubes a 60 Hz son 18 000
   * objetos por segundo para el recolector de basura.
   */
  private puffOrder: number[] = []
  private puffDepth: number[] = []

  setScene(clouds: Cloud[]): void {
    this.clouds = clouds
    let puffs = 0
    for (const c of clouds) puffs += c.puffs.length
    const needed = puffs * STRIDE_FLOATS
    // El búfer solo crece. Una escena que encoja no merece reasignar, y una que
    // vuelva a crecer se encuentra el sitio ya hecho.
    if (this.vertices.length < needed) this.vertices = new Float32Array(needed)
    this.order = clouds.map((_, i) => i)
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    // Al encenderla otra vez el reloj arranca de cero: sin esto, el primer paso
    // usaría el `dt` de todo el rato apagada y las nubes cruzarían la isla de
    // un salto. Mismo cuidado que en la capa de vapor.
    this.lastFrame = 0
    this.map?.triggerRepaint()
  }

  setExaggeration(exaggeration: number): void {
    this.exaggeration = exaggeration
    this.map?.triggerRepaint()
  }

  setSun(sun: SolarPosition): void {
    this.sun = sun
    this.map?.triggerRepaint()
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map

    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de nubes')
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa de nubes no enlaza: ${gl.getProgramInfoLog(program)}`)
    }

    this.program = program
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.aShape = gl.getAttribLocation(program, 'a_shape')
    this.uMatrix = gl.getUniformLocation(program, 'u_matrix')
    this.uPixelRatio = gl.getUniformLocation(program, 'u_pixelRatio')
    this.uPxPerMeter = gl.getUniformLocation(program, 'u_pxPerMeter')
    this.uRefW = gl.getUniformLocation(program, 'u_refW')
    this.uSunDir = gl.getUniformLocation(program, 'u_sunDir')
    this.uDay = gl.getUniformLocation(program, 'u_day')

    this.buffer = gl.createBuffer()
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.program) gl.deleteProgram(this.program)
    if (this.buffer) gl.deleteBuffer(this.buffer)
    this.program = null
    this.buffer = null
    this.map = null
  }

  render(gl: Gl, matrix: ViewMatrix): void {
    const map = this.map
    if (!map || !this.program || !this.buffer) return
    if (!this.visible || !this.clouds.length) return

    const now = performance.now()
    const dt = this.lastFrame ? Math.min(MAX_DT, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now

    driftClouds(this.clouds, dt)

    const vertexCount = this.fillVertices(matrix)
    if (vertexCount === 0) {
      map.triggerRepaint()
      return
    }

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.vertices.subarray(0, vertexCount * STRIDE_FLOATS),
      gl.DYNAMIC_DRAW,
    )

    const stride = STRIDE_FLOATS * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aShape)
    gl.vertexAttribPointer(this.aShape, 4, gl.FLOAT, false, stride, 3 * 4)

    gl.uniformMatrix4fv(this.uMatrix, false, matrix as unknown as Float32List)
    gl.uniform1f(this.uPixelRatio, window.devicePixelRatio || 1)

    const center = map.getCenter()
    gl.uniform1f(this.uPxPerMeter, 1 / metersPerPixel(center.lat, map.getZoom()))
    gl.uniform1f(this.uRefW, clipW(matrix, mercatorX(center.lng), mercatorY(center.lat), 0))

    const [sx, sy, sz] = sunToCamera(this.sun, map.getBearing(), map.getPitch())
    gl.uniform3f(this.uSunDir, sx, sy, sz)
    gl.uniform1f(this.uDay, dayFactor(this.sun.elevation))

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.POINTS, 0, vertexCount)

    gl.depthMask(true)
    gl.disableVertexAttribArray(this.aPos)
    gl.disableVertexAttribArray(this.aShape)

    map.triggerRepaint()
  }

  /**
   * Vuelca las motas al búfer, de la nube más lejana a la más cercana, y
   * devuelve cuántas se han escrito.
   */
  private fillVertices(matrix: ViewMatrix): number {
    const clouds = this.clouds
    const out = this.vertices

    // Profundidad de cada nube por su centro, y orden de atrás adelante. La `w`
    // crece con la distancia, así que se ordena de mayor a menor.
    const depth = clouds.map((c) =>
      clipW(
        matrix,
        mercatorX(c.lon),
        mercatorY(c.lat),
        mercatorZ(((c.base + c.top) / 2) * this.exaggeration, c.lat),
      ),
    )
    this.order.sort((a, b) => depth[b] - depth[a])

    let n = 0
    for (const ci of this.order) {
      const c = clouds[ci]
      // Opacidad por mota: la inversa de apilar `EFFECTIVE_OVERLAP` capas hasta
      // llegar al espesor de la nube. Ver la constante.
      const puffAlpha = 1 - Math.pow(1 - Math.min(0.999, c.density), 1 / EFFECTIVE_OVERLAP)
      // La nube que llueve va más negra por debajo, y tanto más cuanto más
      // llueve. El tope es 0,85: por encima la base se vuelve un agujero negro y
      // deja de leerse como nube.
      const rain = c.precipMm > 0 ? Math.min(1, c.precipMm / RAIN_HEAVY_MM) : 0
      const baseShade = Math.min(0.85, BASE_SHADE[c.etage] + 0.3 * rain)

      const thickness = c.top - c.base
      const lat = c.lat
      const mPerDegLon = 111_320 * Math.cos((lat * Math.PI) / 180)

      // Y DENTRO DE LA NUBE, las motas también van de atrás adelante.
      //
      // Esto NO es un refinamiento: es lo que decide de qué color se ve la
      // nube. Con veintidós motas al 45 % de opacidad apiladas, las cinco
      // últimas que se dibujan se comen prácticamente todo el resultado; si el
      // orden es el de generación —o sea, ninguno—, la mota que manda es una
      // cualquiera, y la nube sale del gris promedio de su interior. Ordenadas,
      // manda la que está más cerca del observador: mirando desde arriba, la de
      // la cima iluminada; mirando desde abajo, la de la base en sombra. Que es
      // exactamente lo que hace una nube de verdad.
      //
      // Ordenar por grupos es además más barato que ordenar las motas de toda
      // la escena juntas: veintidós elementos se ordenan en log₂22 ≈ 4,5
      // comparaciones por elemento, contra las 11 de un montón de dos mil.
      const puffs = c.puffs
      // Se ajusta la longitud en vez de cortar con `slice`, que crearía un array
      // por nube y por fotograma y dejaría sin sentido tener el búfer aquí.
      this.puffOrder.length = puffs.length
      for (let k = 0; k < puffs.length; k++) {
        const p = puffs[k]
        this.puffDepth[k] = clipW(
          matrix,
          mercatorX(c.lon + p.dx / mPerDegLon),
          mercatorY(lat + p.dy / 110_574),
          mercatorZ((c.base + p.h * thickness) * this.exaggeration, lat),
        )
        this.puffOrder[k] = k
      }
      const puffDepth = this.puffDepth
      this.puffOrder.sort((a, b) => puffDepth[b] - puffDepth[a])

      for (const pi of this.puffOrder) {
        const p = puffs[pi]
        const lon = c.lon + p.dx / mPerDegLon
        const plat = lat + p.dy / 110_574
        const alt = c.base + p.h * thickness

        out[n++] = mercatorX(lon)
        out[n++] = mercatorY(plat)
        // La exageración vertical se aplica AQUÍ, y tiene que aplicarse:
        // MapLibre estira la malla del terreno pero no toca la geometría de una
        // capa personalizada. Sin esto, a 1,5× la Cumbre atravesaría una manta
        // que se habría quedado a su altura real.
        out[n++] = mercatorZ(alt * this.exaggeration, plat)
        out[n++] = p.radiusM
        out[n++] = puffAlpha
        // La sombra NO cae linealmente con la altura dentro de la nube: solo
        // oscurece el tercio de abajo, y de ahí para arriba la mota está
        // plenamente iluminada.
        //
        // Con una rampa lineal la nube entera salía apagada, y no por un error
        // de color sino por dónde están las motas: repartidas en una cúpula, su
        // altura media dentro de la nube es ~0,38, así que la mota TÍPICA se
        // llevaba el 62 % del oscurecimiento y el resultado era una masa gris
        // uniforme con la cima igual de sucia que la base. Lo que hay que
        // oscurecer es la panza, que es la que no ve el sol; el resto de la
        // nube sí lo ve.
        const hs = Math.min(1, p.h / SHADE_DEPTH)
        out[n++] = 1 - baseShade * (1 - hs * hs * (3 - 2 * hs))
        out[n++] = p.seed
      }
    }
    return n / STRIDE_FLOATS
  }
}
