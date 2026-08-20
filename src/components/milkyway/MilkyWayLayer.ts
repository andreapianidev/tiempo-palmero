/**
 * La capa que dibuja la Vía Láctea, debajo de todo lo demás del cielo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ES LA PRIMERA QUE SE DIBUJA, y el orden importa: es fondo. Las estrellas van
 * encima —con mezcla aditiva, así que se SUMAN a ella, que es lo que pasa de
 * verdad— y la luna y los planetas encima de las estrellas. Puesta después,
 * un velo del 55 % de blanco taparía las estrellas más débiles justo en la
 * región del cielo donde más hay.
 *
 * SE APAGA SOLA CUANDO EL CIELO NO LA DEJA VER, y no con una regla escrita
 * aquí: el sombreador divide su luminancia entre la del fondo que miden los
 * fotómetros del Cabildo, y con luna llena esa fracción vale 0,025. La cuenta,
 * y de dónde sale cada número, están en `lib/sky/vialactea.ts`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA TEXTURA TIENE TRES DETALLES QUE NO SON OPCIONALES:
 *
 *  - **`UNPACK_FLIP_Y_WEBGL` en falso, puesto a mano.** MapLibre lo deja en
 *    verdadero para sus propios iconos, y el estado del contexto es compartido:
 *    heredarlo pondría la Vía Láctea del sur en el norte. Es el error que sale
 *    como un cielo perfectamente plausible del hemisferio equivocado.
 *  - **`CLAMP_TO_EDGE` en las dos direcciones**, porque 1440 × 720 no es
 *    potencia de dos y WebGL 1 no admite `REPEAT` ahí. No hace falta: la malla
 *    lleva `s` de 0 a 1 con vértices propios en la costura, así que nunca se
 *    pide fuera del rango. Ver `mesh.ts`.
 *  - **Sin mipmaps.** Tampoco los admitiría siendo NPOT, y no los quiere: el
 *    mapa está cinco veces por debajo de la resolución de la pantalla, así que
 *    siempre se está ampliando, nunca reduciendo.
 *
 * FALLA EN ABIERTO. Si el PNG no llega, la capa no dibuja y el resto de la
 * escena nocturna sigue entera; el panel dice por qué.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { skyFrame } from '../../lib/stars/frame'
import { starColor } from '../../lib/stars/color'
import {
  MW_COLOR_INDEX,
  MW_DISPLAY_GAIN,
  MW_PEAK_MAG,
  MW_PEAK_VALUE,
} from '../../lib/sky/vialactea'
import { buildMilkyWayMesh, MW_STRIDE_FLOATS } from './mesh'
import { MILKYWAY_FRAGMENT_SHADER, MILKYWAY_VERTEX_SHADER } from './milkyway-shaders'

export const MILKYWAY_LAYER_ID = 'cielo-vialactea'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

export interface MilkyWaySceneState {
  /** Dónde está el observador. La matriz del cielo se calcula por fotograma. */
  lon: number
  lat: number
  /** El fondo de cielo, mag/arcsec². Del fotómetro o del modelo. */
  skyMag: number
  /** Coeficiente de extinción del sitio, mag por masa de aire. */
  extinctionK: number
  /** Horizonte visible del observador, grados. Negativo desde una cumbre. */
  floorDeg: number
  /** Densidad relativa del aire para la refracción. */
  density: number
}

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('no se pudo crear el sombreador de la Vía Láctea')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`la Vía Láctea no compila: ${log}`)
  }
  return shader
}

export class MilkyWayLayer implements CustomLayerInterface {
  readonly id = MILKYWAY_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private vertexBuffer: WebGLBuffer | null = null
  private indexBuffer: WebGLBuffer | null = null
  private texture: WebGLTexture | null = null
  private indexCount = 0
  private hasMap = false

  private state: MilkyWaySceneState | null = null
  private visible = false
  private aVertex = -1
  private u: Record<string, WebGLUniformLocation | null> = {}
  private slowRepaint: ReturnType<typeof setTimeout> | null = null

  /** El bitmap del mapa. Lo trae el gancho; la capa solo lo sube. */
  private pending: ImageBitmap | HTMLImageElement | null = null

  setMap(image: ImageBitmap | HTMLImageElement): void {
    this.pending = image
    this.map?.triggerRepaint()
  }

  setState(state: MilkyWaySceneState): void {
    this.state = state
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.map?.triggerRepaint()
  }

  /** Si está dibujando algo ahora mismo. Para el panel. */
  get drawing(): boolean {
    return this.visible && this.hasMap
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map
    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de la Vía Láctea')
    const v = compile(gl, gl.VERTEX_SHADER, MILKYWAY_VERTEX_SHADER)
    const f = compile(gl, gl.FRAGMENT_SHADER, MILKYWAY_FRAGMENT_SHADER)
    gl.attachShader(program, v)
    gl.attachShader(program, f)
    gl.linkProgram(program)
    gl.deleteShader(v)
    gl.deleteShader(f)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`la Vía Láctea no enlaza: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program

    this.aVertex = gl.getAttribLocation(program, 'a_vertex')
    for (const name of [
      'u_sky',
      'u_view',
      'u_density',
      'u_map',
      'u_peakValue',
      'u_peakMag',
      'u_skyMag',
      'u_extinction',
      'u_floorDeg',
      'u_gain',
      'u_color',
    ]) {
      this.u[name] = gl.getUniformLocation(program, name)
    }

    const mesh = buildMilkyWayMesh()
    this.indexCount = mesh.indices.length
    this.vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW)
    this.indexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)

    this.texture = gl.createTexture()
  }

  /** Sube el bitmap si ha llegado uno nuevo. Idempotente. */
  private uploadMap(gl: Gl): void {
    if (!this.pending || !this.texture) return
    const image = this.pending
    this.pending = null
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    // Ver la cabecera: heredar el `FLIP_Y` de MapLibre daría el hemisferio
    // cambiado, que es un cielo perfectamente creíble y equivocado.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.hasMap = true
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.slowRepaint !== null) clearTimeout(this.slowRepaint)
    this.slowRepaint = null
    if (this.program) gl.deleteProgram(this.program)
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer)
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer)
    if (this.texture) gl.deleteTexture(this.texture)
    this.program = null
    this.vertexBuffer = null
    this.indexBuffer = null
    this.texture = null
    this.hasMap = false
    this.map = null
  }

  /** El cielo gira aunque nadie toque el mapa. Ver `StarLayer`. */
  private scheduleSlowRepaint(): void {
    if (this.slowRepaint !== null) return
    this.slowRepaint = setTimeout(() => {
      this.slowRepaint = null
      if (this.visible) this.map?.triggerRepaint()
    }, 10_000)
  }

  render(gl: Gl, matrix: ViewMatrix): void {
    const map = this.map
    const state = this.state
    if (!map || !state || !this.visible || !this.program) return
    if (map.getPitch() <= 0) return
    this.uploadMap(gl)
    if (!this.hasMap) return

    const frame = skyFrame(Date.now(), state.lon, state.lat)
    const m = frame.matrix
    // GLSL espera COLUMNA mayor y `Mat3` está por filas: se transpone al
    // subirla. Es el error que giraría el cielo entero de forma plausible.
    const sky = new Float32Array([
      m[0][0], m[1][0], m[2][0],
      m[0][1], m[1][1], m[2][1],
      m[0][2], m[1][2], m[2][2],
    ])
    const view = new Float32Array(matrix as unknown as ArrayLike<number>)
    const color = starColor(MW_COLOR_INDEX)

    gl.useProgram(this.program)
    gl.enable(gl.BLEND)
    // Aditiva, igual que las estrellas: no tapa el cielo, le suma luz.
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.enableVertexAttribArray(this.aVertex)
    gl.vertexAttribPointer(this.aVertex, 4, gl.FLOAT, false, MW_STRIDE_FLOATS * 4, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.texture)
    gl.uniform1i(this.u.u_map, 0)

    gl.uniformMatrix3fv(this.u.u_sky, false, sky)
    gl.uniformMatrix4fv(this.u.u_view, false, view)
    gl.uniform1f(this.u.u_density, state.density)
    // El valor del mapa se lee de 0 a 1, así que el pico entra normalizado.
    gl.uniform1f(this.u.u_peakValue, MW_PEAK_VALUE / 255)
    gl.uniform1f(this.u.u_peakMag, MW_PEAK_MAG)
    gl.uniform1f(this.u.u_skyMag, state.skyMag)
    gl.uniform1f(this.u.u_extinction, state.extinctionK)
    gl.uniform1f(this.u.u_floorDeg, state.floorDeg)
    gl.uniform1f(this.u.u_gain, MW_DISPLAY_GAIN)
    gl.uniform3f(this.u.u_color, color[0], color[1], color[2])

    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)

    gl.disableVertexAttribArray(this.aVertex)
    gl.depthMask(true)

    // No hay centelleo que pedir fotogramas, pero el cielo gira igual.
    this.scheduleSlowRepaint()
  }
}
