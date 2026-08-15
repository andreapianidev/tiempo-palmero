/**
 * El camino que recorre el sol hoy, dibujado sobre el cielo.
 *
 * POR QUÉ EXISTE. El disco del sol solo entra en cuadro con el sol por debajo
 * de 3,4° —el borde de arriba de la pantalla con la vista inclinada al tope— y
 * mirando hacia él. El resto del día la casilla del disco está encendida y no
 * se dibuja nada: el sol está ahí, encima de la pantalla, iluminando todo lo
 * demás. Esta capa dibuja el CAMINO, que sí baja hasta el horizonte por los dos
 * extremos y contesta la pregunta que se hace de verdad delante de un mapa de
 * la isla: por dónde sale y por dónde se pone HOY.
 *
 * LO IMPORTANTE ES LO QUE NO SE VE. La línea va a profundidad 1 y el relieve la
 * tapa, así que el trozo escondido detrás de la Cumbre es exactamente el rato
 * que el sol tarda en asomar por encima del filo. En el valle de Aridane eso es
 * más de una hora de diferencia entre el orto del almanaque y el amanecer de
 * verdad, y aquí se ve dibujado sin calcular nada.
 *
 * LA GEOMETRÍA NO ESTÁ AQUÍ. Dónde pasa el sol lo dice `lib/sky/sun-path.ts`;
 * dónde cae cada dirección en la pantalla, `lib/sky/sun-screen.ts`; y cómo se
 * convierte una tira de puntos en triángulos con grosor, `lib/sky/track-
 * ribbon.ts`. Los tres se prueban sin tarjeta gráfica. Lo que queda en este
 * fichero es el enchufe: un programa, un búfer y una llamada de dibujo.
 *
 * SE RECONSTRUYE EN CADA FOTOGRAMA, y sale gratis: son 43 puntos en el día más
 * largo del año, o sea unos 60 cuadriláteros. Guardarlos entre fotogramas
 * obligaría a invalidarlos cada vez que la cámara se mueve —que es siempre que
 * importa— a cambio de ahorrar medio microsegundo.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { sunColorAt, type OceanLight, type Rgb } from '../../lib/ocean/light'
import { sunScreen } from '../../lib/sky/sun-screen'
import type { TrackMark, TrackPoint } from '../../lib/sky/sun-path'
import { RIBBON_STRIDE, trackRibbon, type RibbonPoint } from '../../lib/sky/track-ribbon'
import { SUN_PATH_FRAGMENT_SHADER, SUN_PATH_VERTEX_SHADER } from './sun-path-shaders'

export const SUN_PATH_LAYER_ID = 'sky-sun-path'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/**
 * Grosores, en píxeles de CSS —o sea los que ve el usuario, no los del lienzo,
 * que en una pantalla Retina son el doble—.
 *
 * 3,4 px de ancho total con 1,6 de núcleo deja el reborde en 0,9 px por lado, o
 * sea casi dos píxeles de lienzo en una pantalla Retina. Ése es el suelo de
 * verdad: un reborde de menos de un píxel de lienzo no separa nada, se mezcla
 * con el núcleo al suavizar el borde y la línea vuelve a perderse contra un
 * cielo claro, que es lo que el reborde venía a evitar.
 *
 * Los brazos de las marcas cruzan el camino y por eso se miden a cada lado: 4 px
 * la hora en punto, 9 px el sol de ahora, que es más del doble y se distingue de
 * un vistazo sin ser otro dibujo distinto.
 */
const LINE_PX = 3.4
const CORE_PX = 1.6
const HOUR_ARM_PX = 4
const NOW_ARM_PX = 9

/**
 * Cuánto se suaviza el borde, en píxeles de lienzo.
 *
 * Medio píxel y no uno entero: con la línea entera midiendo 6,8 píxeles de
 * lienzo, un píxel de suavizado a cada lado se come el reborde y deja el trazo
 * difuminado. Medio recorta lo justo para que no se vean los escalones.
 */
const EDGE_AA_PX = 0.6

/**
 * Cuánta calima se supone mientras no llegue la medida.
 *
 * Cero: aire limpio. Es lo mismo que hace `oceanLight` cuando no hay PM10, y lo
 * que hace es no enrojecer el camino de más.
 */
const CLEAR_AIR = 0

interface PathPoint {
  color: Rgb
  mark: TrackMark
  elevationDeg: number
  azimuthDeg: number
}

export class SunPathLayer implements CustomLayerInterface {
  readonly id = SUN_PATH_LAYER_ID
  readonly type = 'custom' as const
  // 3d: entra en el pase con búfer de profundidad, que es lo que hace que el
  // relieve tape el trozo de camino que tiene delante.
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aPos = -1
  private aAcross = -1
  private aColor = -1
  private uCore: WebGLUniformLocation | null = null
  private uAa: WebGLUniformLocation | null = null
  private uOpacity: WebGLUniformLocation | null = null

  private track: readonly TrackPoint[] = []
  private calima = CLEAR_AIR
  private points: PathPoint[] = []
  private visible = false

  setTrack(track: readonly TrackPoint[]): void {
    this.track = track
    this.recolor()
  }

  /**
   * La luz de la escena, de la que solo se usa la calima: es lo que decide
   * cuánto se enrojece el sol a cada altura. Sale de la misma función que pinta
   * el disco (`sunColorAt`), para que el camino y el sol no se separen.
   */
  setLight(light: OceanLight | null): void {
    this.calima = light?.calima ?? CLEAR_AIR
    this.recolor()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.map?.triggerRepaint()
  }

  private recolor(): void {
    this.points = this.track.map((p) => ({
      color: sunColorAt(p.elevationDeg, this.calima),
      mark: p.mark,
      elevationDeg: p.elevationDeg,
      azimuthDeg: p.azimuthDeg,
    }))
    this.map?.triggerRepaint()
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map
    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa del camino del sol')
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('no se pudo crear el shader del camino del sol')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`shader del camino del sol no compila: ${log}`)
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, SUN_PATH_VERTEX_SHADER)
    const fs = compile(gl.FRAGMENT_SHADER, SUN_PATH_FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa del camino del sol no enlaza: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.aAcross = gl.getAttribLocation(program, 'a_across')
    this.aColor = gl.getAttribLocation(program, 'a_color')
    this.uCore = gl.getUniformLocation(program, 'u_core')
    this.uAa = gl.getUniformLocation(program, 'u_aa')
    this.uOpacity = gl.getUniformLocation(program, 'u_opacity')
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
    if (!map || !this.program || !this.visible) return
    if (this.points.length < 2) return
    // Con la vista en plano no hay cielo donde ponerlo: el horizonte está en el
    // infinito y lo que se ve es el mapa, mirado desde arriba.
    if (map.getPitch() <= 0) return

    const canvas = map.getCanvas()
    const height = Math.max(1, canvas.height)
    const aspect = canvas.width / height
    // Del píxel de CSS al del lienzo: en una pantalla Retina son dos.
    const dpr = canvas.width / Math.max(1, canvas.clientWidth || canvas.width)
    // Y del píxel del lienzo a las coordenadas normalizadas, que reparten dos
    // unidades sobre todo el alto.
    const ndc = 2 / height
    const halfWidth = (LINE_PX / 2) * dpr * ndc

    const ribbon: RibbonPoint[] = this.points.map((p) => {
      const screen = sunScreen(matrix as unknown as ArrayLike<number>, p)
      return { x: screen.x, y: screen.y, ahead: screen.ahead, color: p.color, mark: p.mark }
    })
    const data = trackRibbon(ribbon, {
      halfWidth,
      aspect,
      hourArm: HOUR_ARM_PX * dpr * ndc,
      nowArm: NOW_ARM_PX * dpr * ndc,
    })
    if (data.length === 0) return

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    const stride = RIBBON_STRIDE * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aAcross)
    gl.vertexAttribPointer(this.aAcross, 1, gl.FLOAT, false, stride, 8)
    gl.enableVertexAttribArray(this.aColor)
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, stride, 12)

    gl.uniform1f(this.uCore, CORE_PX / LINE_PX)
    // El suavizado, medido en el través: ahí el semiancho entero vale 1.
    gl.uniform1f(this.uAa, Math.min(0.9, EDGE_AA_PX / ((LINE_PX / 2) * dpr)))
    gl.uniform1f(this.uOpacity, 0.9)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.TRIANGLES, 0, data.length / RIBBON_STRIDE)

    gl.depthMask(true)
    gl.disableVertexAttribArray(this.aPos)
    gl.disableVertexAttribArray(this.aAcross)
    gl.disableVertexAttribArray(this.aColor)
  }
}
