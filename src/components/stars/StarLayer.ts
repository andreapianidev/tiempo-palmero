/**
 * La capa que dibuja el cielo nocturno sobre la isla.
 *
 * DOS LLAMADAS DE DIBUJO PARA TODO: una de puntos con las 8920 estrellas y otra
 * de líneas con las 743 aristas de las figuras. No hay bucle por estrella en
 * JavaScript en ningún sitio; lo único que la CPU hace por fotograma es una
 * matriz de 3 × 3 y un puñado de uniformes.
 *
 * SE ESCONDE SOLA, tres veces y por tres motivos distintos:
 *
 *  - **De día no se dibuja.** El corte no es «el sol bajo el horizonte» sino la
 *    magnitud límite: cuando el crepúsculo deja el cielo por encima de las
 *    estrellas más brillantes, no queda ninguna que dibujar y la capa no gasta
 *    ni una llamada. Es el mismo criterio que gobierna cuántas se ven, así que
 *    el encendido y el contenido no pueden desincronizarse.
 *  - **Con la vista en plano tampoco.** Mirando el mapa desde arriba no hay
 *    cielo en pantalla, igual que le pasa al disco del sol.
 *  - **Detrás de la montaña, sola.** Los puntos van a profundidad 1 con la
 *    prueba en LEQUAL, así que el relieve las tapa por estar delante. No hay
 *    cálculo de oclusión que pueda desincronizarse de lo que se ve.
 *
 * LA MEZCLA ES ADITIVA y no la premultiplicada del resto de la aplicación. Una
 * estrella no tapa el cielo: le suma luz. Por eso, sobre el resplandor de Los
 * Llanos, las mismas estrellas se ven menos —y eso es exactamente lo que pasa
 * mirando hacia arriba desde allí.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { skyFrame } from '../../lib/stars/frame'
import type { ConstellationFigures, StarCatalog } from '../../lib/stars/catalog'
import { STRIDE_FLOATS } from '../../lib/stars/catalog'
import { visibleCount } from '../../lib/stars/visibility'
import {
  FIGURE_FRAGMENT_SHADER,
  FIGURE_VERTEX_SHADER,
  STAR_FRAGMENT_SHADER,
  STAR_VERTEX_SHADER,
} from './star-shaders'

export const STAR_LAYER_ID = 'cielo-estrellas'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

export interface StarSceneState {
  /**
   * Dónde está el observador. La MATRIZ del cielo no llega desde fuera: se
   * calcula aquí, en cada fotograma, con el reloj del propio navegador.
   *
   * POR QUÉ NO SE PASA YA CALCULADA. La primera versión la recibía de React
   * junto con el resto del estado, y ese estado late una vez por minuto —el
   * mismo pulso que mueve el resto de la interfaz—. La Tierra gira 0,25° por
   * minuto: el cielo daba un salto de un cuarto de grado cada vez, medio
   * diámetro lunar, y entre salto y salto se quedaba clavado mientras las
   * estrellas centelleaban. Calcular la matriz aquí cuesta una decena de
   * multiplicaciones por fotograma y el cielo se mueve como se mueve.
   */
  lon: number
  lat: number
  /** Magnitud límite de esta noche, del fotómetro o del modelo. */
  limitMag: number
  /** Coeficiente de extinción del sitio, mag por masa de aire. */
  extinctionK: number
  /** Horizonte visible del observador, grados. Negativo desde una cumbre. */
  floorDeg: number
  /** Densidad relativa del aire para la refracción: (P/1010)·(283/(273+T)). */
  density: number
  /** 0 apaga el centelleo. */
  twinkle: number
  /** Opacidad de las figuras. 0 las apaga. */
  figureOpacity: number
}

function compile(gl: Gl, type: number, source: string, what: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error(`no se pudo crear el shader de ${what}`)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de ${what} no compila: ${log}`)
  }
  return shader
}

function link(gl: Gl, vs: string, fs: string, what: string): WebGLProgram {
  const program = gl.createProgram()
  if (!program) throw new Error(`no se pudo crear el programa de ${what}`)
  const v = compile(gl, gl.VERTEX_SHADER, vs, what)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs, what)
  gl.attachShader(program, v)
  gl.attachShader(program, f)
  gl.linkProgram(program)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`el programa de ${what} no enlaza: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

export class StarLayer implements CustomLayerInterface {
  readonly id = STAR_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private starProgram: WebGLProgram | null = null
  private figureProgram: WebGLProgram | null = null
  private starBuffer: WebGLBuffer | null = null
  private figureBuffer: WebGLBuffer | null = null

  private catalog: StarCatalog | null = null
  private figures: ConstellationFigures | null = null
  private state: StarSceneState | null = null
  private visible = false
  /** Cuántas estrellas entran con la magnitud límite de ahora. */
  private drawCount = 0
  private startedAt = 0

  private uStars: Record<string, WebGLUniformLocation | null> = {}
  private uFigures: Record<string, WebGLUniformLocation | null> = {}
  private aStar = -1
  private aColor = -1
  private aDir = -1

  setData(catalog: StarCatalog, figures: ConstellationFigures): void {
    this.catalog = catalog
    this.figures = figures
    // Si la capa ya está en el mapa, los búferes se rellenan en el próximo
    // render; `upload` es idempotente.
    this.map?.triggerRepaint()
  }

  setState(state: StarSceneState): void {
    this.state = state
    if (this.catalog) {
      this.drawCount = visibleCount(this.catalog.magnitudes, state.limitMag)
    }
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.map?.triggerRepaint()
  }

  /** Cuántas estrellas se están dibujando ahora mismo. Para el panel. */
  get drawn(): number {
    return this.visible ? this.drawCount : 0
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map
    this.startedAt = performance.now()
    this.starProgram = link(gl, STAR_VERTEX_SHADER, STAR_FRAGMENT_SHADER, 'estrellas')
    this.figureProgram = link(gl, FIGURE_VERTEX_SHADER, FIGURE_FRAGMENT_SHADER, 'figuras')

    this.aStar = gl.getAttribLocation(this.starProgram, 'a_star')
    this.aColor = gl.getAttribLocation(this.starProgram, 'a_color')
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
      this.uStars[name] = gl.getUniformLocation(this.starProgram, name)
    }

    this.aDir = gl.getAttribLocation(this.figureProgram, 'a_dir')
    for (const name of ['u_sky', 'u_view', 'u_floorDeg', 'u_density', 'u_opacity']) {
      this.uFigures[name] = gl.getUniformLocation(this.figureProgram, name)
    }

    this.starBuffer = gl.createBuffer()
    this.figureBuffer = gl.createBuffer()
    this.upload(gl)
  }

  private uploaded = false
  private slowRepaint: ReturnType<typeof setTimeout> | null = null

  /** Repintado perezoso para que el cielo gire con el centelleo apagado. */
  private scheduleSlowRepaint(): void {
    if (this.slowRepaint !== null) return
    this.slowRepaint = setTimeout(() => {
      this.slowRepaint = null
      if (this.visible) this.map?.triggerRepaint()
    }, 10_000)
  }

  private upload(gl: Gl): void {
    if (this.uploaded || !this.catalog || !this.figures) return
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.catalog.vertices, gl.STATIC_DRAW)

    // Las figuras se expanden a coordenadas aquí y no en la GPU: son 743
    // segmentos, o sea 1486 vértices de dos floats. Doce kilobytes, una vez.
    const segs = this.figures.segments
    const dirs = new Float32Array(segs.length * 2)
    for (let i = 0; i < segs.length; i++) {
      const v = segs[i] * STRIDE_FLOATS
      dirs[i * 2] = this.catalog.vertices[v]
      dirs[i * 2 + 1] = this.catalog.vertices[v + 1]
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.figureBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, dirs, gl.STATIC_DRAW)
    this.uploaded = true
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.slowRepaint !== null) clearTimeout(this.slowRepaint)
    this.slowRepaint = null
    if (this.starProgram) gl.deleteProgram(this.starProgram)
    if (this.figureProgram) gl.deleteProgram(this.figureProgram)
    if (this.starBuffer) gl.deleteBuffer(this.starBuffer)
    if (this.figureBuffer) gl.deleteBuffer(this.figureBuffer)
    this.starProgram = null
    this.figureProgram = null
    this.starBuffer = null
    this.figureBuffer = null
    this.uploaded = false
    this.map = null
  }

  render(gl: Gl, matrix: ViewMatrix): void {
    const map = this.map
    const state = this.state
    if (!map || !state || !this.visible || !this.catalog) return
    // Sin inclinación no hay cielo en pantalla.
    if (map.getPitch() <= 0) return
    this.upload(gl)
    if (this.drawCount <= 0) return

    // La hora es la del reloj, no la del estado de React: ver `lon`/`lat`.
    const frame = skyFrame(Date.now(), state.lon, state.lat)
    const m = frame.matrix
    // GLSL espera las matrices en COLUMNA mayor. `Mat3` está por filas, así que
    // se transpone al subirla. Es el error que giraría el cielo entero de forma
    // plausible: seguiría saliendo un cielo, y sería el de otro sitio.
    const sky = new Float32Array([
      m[0][0], m[1][0], m[2][0],
      m[0][1], m[1][1], m[2][1],
      m[0][2], m[1][2], m[2][2],
    ])
    const view = new Float32Array(matrix as unknown as ArrayLike<number>)
    const seconds = (performance.now() - this.startedAt) / 1000
    const pixelRatio = map.getCanvas().width / Math.max(1, map.getContainer().clientWidth)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    // ------------------------------------------------------------- figuras
    // Primero, para que las estrellas se dibujen encima de sus propias líneas.
    if (state.figureOpacity > 0.001 && this.figures) {
      gl.useProgram(this.figureProgram)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.figureBuffer)
      gl.enableVertexAttribArray(this.aDir)
      gl.vertexAttribPointer(this.aDir, 2, gl.FLOAT, false, 0, 0)
      gl.uniformMatrix3fv(this.uFigures.u_sky, false, sky)
      gl.uniformMatrix4fv(this.uFigures.u_view, false, view)
      gl.uniform1f(this.uFigures.u_floorDeg, state.floorDeg)
      gl.uniform1f(this.uFigures.u_density, state.density)
      gl.uniform1f(this.uFigures.u_opacity, state.figureOpacity)
      gl.drawArrays(gl.LINES, 0, this.figures.segments.length)
      gl.disableVertexAttribArray(this.aDir)
    }

    // ----------------------------------------------------------- estrellas
    gl.useProgram(this.starProgram)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuffer)
    const stride = STRIDE_FLOATS * 4
    gl.enableVertexAttribArray(this.aStar)
    gl.vertexAttribPointer(this.aStar, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aColor)
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, stride, 12)

    gl.uniformMatrix3fv(this.uStars.u_sky, false, sky)
    gl.uniform3f(
      this.uStars.u_aberration,
      frame.aberration[0],
      frame.aberration[1],
      frame.aberration[2],
    )
    gl.uniformMatrix4fv(this.uStars.u_view, false, view)
    gl.uniform1f(this.uStars.u_limitMag, state.limitMag)
    gl.uniform1f(this.uStars.u_extinction, state.extinctionK)
    gl.uniform1f(this.uStars.u_floorDeg, state.floorDeg)
    gl.uniform1f(this.uStars.u_density, state.density)
    gl.uniform1f(this.uStars.u_pixelRatio, pixelRatio)
    gl.uniform1f(this.uStars.u_time, seconds)
    gl.uniform1f(this.uStars.u_twinkle, state.twinkle)

    gl.drawArrays(gl.POINTS, 0, this.drawCount)

    gl.disableVertexAttribArray(this.aStar)
    gl.disableVertexAttribArray(this.aColor)
    gl.depthMask(true)

    // El centelleo pide el siguiente fotograma sin descanso. Sin centelleo, el
    // cielo sigue girando y hay que repintarlo de vez en cuando o se quedaría
    // clavado hasta que alguien tocara el mapa: cada 10 s son 0,04° de
    // rotación, veinte veces por debajo de lo que un ojo nota. Es la diferencia
    // entre gastar una GPU entera y gastar seis fotogramas por minuto.
    if (state.twinkle > 0) map.triggerRepaint()
    else this.scheduleSlowRepaint()
  }
}
