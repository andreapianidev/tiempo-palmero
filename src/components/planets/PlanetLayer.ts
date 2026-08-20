/**
 * Los planetas, dibujados con el sombreador de las estrellas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NO HAY SOMBREADOR DE PLANETAS, Y ESA ES LA DECISIÓN DE ESTE FICHERO. Se
 * compila el mismo programa que las estrellas y se le suben seis vértices en el
 * mismo formato: ascensión recta y declinación J2000, magnitud y color.
 *
 * POR QUÉ. Un planeta a simple vista es exactamente lo mismo que una estrella
 * —un punto sin tamaño resoluble; Júpiter mide 50 segundos de arco y el ojo
 * resuelve 60— y tiene que recibir el mismo trato en las seis cosas que ese
 * sombreador hace: aberración, precesión, nutación, refracción, extinción con
 * la masa de aire y desvanecido contra la magnitud límite de la noche. Escribir
 * un segundo sombreador con esas seis cuentas otra vez habría creado la
 * posibilidad de que Júpiter y la estrella que tiene al lado se refracten
 * distinto, que es un error que nadie vería y que estaría ahí todas las noches.
 *
 * Comparten el CÁLCULO, no una copia del cálculo. Es la misma razón por la que
 * la paralaje vive en un fichero y no en dos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS PLANETAS NO CENTELLEAN, y aquí eso no es un detalle estético: es la única
 * diferencia de trato, y está en el uniforme `u_twinkle`, que va a cero.
 *
 * La razón es física. Una estrella es un punto: la turbulencia desvía todo su
 * haz a la vez y el brillo salta. Un planeta es un disco de decenas de segundos
 * de arco, o sea muchos puntos independientes cuyos parpadeos se promedian y se
 * cancelan. Por eso, mirando al cielo, lo que no titila es un planeta — es la
 * forma clásica de distinguirlos sin saber nada de astronomía, y dibujarlos
 * temblando habría borrado la única pista que tiene alguien a simple vista.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEIS VÉRTICES POR FOTOGRAMA. La posición se recalcula con el reloj del
 * navegador en cada `render`, igual que la matriz del cielo y que la luna, y por
 * el mismo motivo: el estado de React late una vez por minuto y en un minuto la
 * Tierra gira 0,25°.
 *
 * ESTO ERA EL ARGUMENTO A FAVOR DE LA TABLA DE CHEBYSHEV QUE HUBO AQUÍ, y se
 * midió antes de quitarla: seis planetas por VSOP87 entero cuestan 0,0735 ms
 * por fotograma contra los 0,0103 del polinomio. Siete veces más, y el 0,44 %
 * de un fotograma de 16,7 ms. Ver `lib/planets/ephemeris.ts`.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { planetAstrometric } from '../../lib/planets/sight'
import { VISIBLE_PLANETS, type PlanetEphemeris } from '../../lib/planets/ephemeris'
import { skyFrame } from '../../lib/stars/frame'
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from '../stars/star-shaders'

export const PLANET_LAYER_ID = 'cielo-planetas'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/** Los mismos seis números por astro que usa el búfer de las estrellas. */
const STRIDE_FLOATS = 6

export interface PlanetSceneState {
  /** Dónde está quien mira. La posición se calcula por fotograma. */
  lon: number
  lat: number
  /** Magnitud límite de esta noche, del fotómetro o del modelo. */
  limitMag: number
  extinctionK: number
  /** Horizonte visible del observador, grados. Negativo desde una cumbre. */
  floorDeg: number
  /** Densidad relativa del aire para la refracción. */
  density: number
}

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('no se pudo crear el shader de los planetas')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de los planetas no compila: ${log}`)
  }
  return shader
}

export class PlanetLayer implements CustomLayerInterface {
  readonly id = PLANET_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aStar = -1
  private aColor = -1
  private u: Record<string, WebGLUniformLocation | null> = {}

  private eph: PlanetEphemeris | null = null
  private state: PlanetSceneState | null = null
  private visible = false
  private vertices = new Float32Array(VISIBLE_PLANETS.length * STRIDE_FLOATS)
  private slowRepaint: ReturnType<typeof setTimeout> | null = null

  /** Cuántos planetas hay por encima de la magnitud límite ahora mismo. */
  private drawn = 0

  setEphemeris(eph: PlanetEphemeris): void {
    this.eph = eph
    this.map?.triggerRepaint()
  }

  setState(state: PlanetSceneState): void {
    this.state = state
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.map?.triggerRepaint()
  }

  /** Cuántos se están dibujando. Para el panel. */
  get count(): number {
    return this.visible ? this.drawn : 0
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map
    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de los planetas')
    const vs = compile(gl, gl.VERTEX_SHADER, STAR_VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, STAR_FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa de los planetas no enlaza: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    this.aStar = gl.getAttribLocation(program, 'a_star')
    this.aColor = gl.getAttribLocation(program, 'a_color')
    for (const name of [
      'u_sky',
      'u_aberration',
      'u_view',
      'u_limitMag',
      'u_extinction',
      'u_floorDeg',
      'u_density',
      'u_pixelRatio',
      'u_time',
      'u_twinkle',
    ]) {
      this.u[name] = gl.getUniformLocation(program, name)
    }
    this.buffer = gl.createBuffer()
  }

  /**
   * Repintado perezoso, cinco segundos, con la misma cuenta que la luna: la
   * Tierra gira 0,25° por minuto, así que en cinco segundos un planeta se corre
   * 1,25 minutos de arco. Sin esto se quedarían clavados hasta que alguien
   * tocara el mapa.
   */
  private scheduleSlowRepaint(): void {
    if (this.slowRepaint !== null) return
    this.slowRepaint = setTimeout(() => {
      this.slowRepaint = null
      if (this.visible) this.map?.triggerRepaint()
    }, 5_000)
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.slowRepaint !== null) clearTimeout(this.slowRepaint)
    this.slowRepaint = null
    if (this.program) gl.deleteProgram(this.program)
    if (this.buffer) gl.deleteBuffer(this.buffer)
    this.program = null
    this.buffer = null
    this.map = null
  }

  render(gl: Gl, matrix: ViewMatrix): void {
    const map = this.map
    const state = this.state
    const eph = this.eph
    if (!map || !state || !eph || !this.visible || !this.program) return
    if (map.getPitch() <= 0) return

    const at = Date.now()
    let n = 0
    for (const id of VISIBLE_PLANETS) {
      const p = planetAstrometric(eph, id, at)
      // El corte por magnitud lo hace el sombreador con su desvanecido, igual
      // que con las estrellas. Aquí solo se descartan los que están tan por
      // debajo del límite que no llegarían ni a un píxel, para no subirlos.
      if (p.magnitude > state.limitMag + 1) continue
      const v = n * STRIDE_FLOATS
      this.vertices[v] = p.raRad
      this.vertices[v + 1] = p.decRad
      this.vertices[v + 2] = p.magnitude
      this.vertices[v + 3] = p.color[0]
      this.vertices[v + 4] = p.color[1]
      this.vertices[v + 5] = p.color[2]
      n++
    }
    this.drawn = n
    if (n === 0) {
      this.scheduleSlowRepaint()
      return
    }

    const frame = skyFrame(at, state.lon, state.lat)
    const m = frame.matrix
    // Columna mayor, como espera GLSL. `Mat3` viene por filas.
    const sky = new Float32Array([
      m[0][0], m[1][0], m[2][0],
      m[0][1], m[1][1], m[2][1],
      m[0][2], m[1][2], m[2][2],
    ])
    const view = new Float32Array(matrix as unknown as ArrayLike<number>)
    const pixelRatio = map.getCanvas().width / Math.max(1, map.getContainer().clientWidth)

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, n * STRIDE_FLOATS), gl.DYNAMIC_DRAW)
    const stride = STRIDE_FLOATS * 4
    gl.enableVertexAttribArray(this.aStar)
    gl.vertexAttribPointer(this.aStar, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aColor)
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, stride, 12)

    gl.uniformMatrix3fv(this.u.u_sky, false, sky)
    gl.uniform3f(
      this.u.u_aberration,
      frame.aberration[0],
      frame.aberration[1],
      frame.aberration[2],
    )
    gl.uniformMatrix4fv(this.u.u_view, false, view)
    gl.uniform1f(this.u.u_limitMag, state.limitMag)
    gl.uniform1f(this.u.u_extinction, state.extinctionK)
    gl.uniform1f(this.u.u_floorDeg, state.floorDeg)
    gl.uniform1f(this.u.u_density, state.density)
    gl.uniform1f(this.u.u_pixelRatio, pixelRatio)
    gl.uniform1f(this.u.u_time, 0)
    // CERO, y es la única diferencia con las estrellas. Ver la cabecera: un
    // planeta no centellea, y eso es lo que lo delata a simple vista.
    gl.uniform1f(this.u.u_twinkle, 0)

    // Aditiva, como las estrellas: un planeta suma luz al cielo, no lo tapa.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.POINTS, 0, n)

    gl.disableVertexAttribArray(this.aStar)
    gl.disableVertexAttribArray(this.aColor)
    gl.depthMask(true)
    this.scheduleSlowRepaint()
  }
}
