/**
 * La luna en el cielo de la isla, del tamaño y con la fase que le tocan.
 *
 * UNA LLAMADA DE DIBUJO, seis vértices, y toda la astronomía hecha antes:
 * `moon.ts` dice dónde está, `moon-screen.ts` dónde cae en pantalla y hacia
 * dónde mira el cuerno, `moon-look.ts` de qué color sale. Aquí solo quedan los
 * uniformes. Es el mismo reparto que el disco del sol, y por el mismo motivo:
 * lo que se puede probar sin tarjeta gráfica no vive dentro de una capa.
 *
 * EL TAMAÑO NO ES UNA CONSTANTE, y es la diferencia con el sol. El disco solar
 * varía un 3 % entre el perihelio y el afelio y se dibuja con 0,533° fijos
 * porque esa diferencia es medio píxel. El lunar varía un **17 %** entre el
 * perigeo y el apogeo —de 28,9' a 34,1' vistos desde aquí—, que a cualquier
 * zoom razonable son píxeles de sobra. Sale de la distancia topocéntrica de
 * cada instante, así que la superluna sale grande porque está cerca y no porque
 * alguien lo haya decidido.
 *
 * SE ESCONDE SOLA, por los mismos tres caminos que las estrellas:
 *
 *  - **Bajo el horizonte del observador no se dibuja.** El corte es `floorDeg`,
 *    que desde el Roque es −1,43°: desde una cumbre se ve salir la luna antes
 *    que desde la playa, y eso ya lo sabe `refraction.ts`.
 *  - **Con la vista en plano tampoco**, porque no hay cielo en pantalla.
 *  - **Detrás de la montaña, sola**: profundidad 1 con la prueba en LEQUAL.
 *
 * Y UNA CUARTA QUE NO ES ESCONDERSE SINO NO GASTAR: fuera del encuadre, con
 * margen para la aureola, no se llama a dibujar. Pasa casi siempre, porque la
 * pantalla solo enseña hasta 3,4° de altura con el relieve de casa.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { moonSight, type MoonObserver } from '../../lib/moon'
import { CAMERA_FOV_DEG } from '../../lib/sky/sun-screen'
import { moonScreen } from '../../lib/sky/moon-screen'
import { moonLook } from '../../lib/sky/moon-look'
import { MOON_FRAGMENT_SHADER, MOON_VERTEX_SHADER } from './moon-shaders'

export const MOON_LAYER_ID = 'cielo-luna'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/**
 * Cuántas veces el radio del disco mide el cuadrilátero.
 *
 * Seis, contra los cuarenta del sol. La aureola lunar no es la del sol dividida
 * por cien mil: es un halo cerrado de un par de grados, y pintarla ancha
 * convierte la luna en una farola.
 */
const GLOW_RADII = 6

export interface MoonSceneState {
  /**
   * Dónde está quien mira. La POSICIÓN DE LA LUNA NO ENTRA POR AQUÍ: se calcula
   * en cada fotograma con el reloj del navegador, por el mismo motivo que la
   * matriz del cielo de `StarLayer`. El estado de React late una vez por
   * minuto, y en un minuto la Tierra gira 0,25°: medio diámetro lunar. La luna
   * daría un salto de medio disco cada vez y se quedaría clavada entre salto y
   * salto. Calcularla aquí cuesta ciento veinte senos por fotograma, que es
   * nada, y se mueve como se mueve.
   */
  observer: MoonObserver
  /** Horizonte visible del observador. Negativo desde una cumbre. */
  floorDeg: number
  /** Extinción del sitio, mag por masa de aire. */
  extinctionK: number
  /** Altura del sol, grados. Decide cuánta luna de día se ve. */
  sunElevationDeg: number
}

export class MoonLayer implements CustomLayerInterface {
  readonly id = MOON_LAYER_ID
  readonly type = 'custom' as const
  // 3d: entra en el pase con búfer de profundidad, que es lo que hace que el
  // relieve la tape. En 2d se dibujaría por encima de la montaña.
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aQuad = -1
  private u: Record<string, WebGLUniformLocation | null> = {}

  private state: MoonSceneState | null = null
  private visible = false

  setState(state: MoonSceneState): void {
    this.state = state
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.map?.triggerRepaint()
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map
    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de la luna')
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('no se pudo crear el shader de la luna')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`shader de la luna no compila: ${log}`)
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, MOON_VERTEX_SHADER)
    const fs = compile(gl.FRAGMENT_SHADER, MOON_FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa de la luna no enlaza: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    this.aQuad = gl.getAttribLocation(program, 'a_quad')
    for (const name of [
      'u_center',
      'u_radius',
      'u_color',
      'u_luminance',
      'u_earthshine',
      'u_disc',
      'u_limb',
      'u_cosPhase',
      'u_sinPhase',
      'u_dayness',
      'u_soft',
    ]) {
      this.u[name] = gl.getUniformLocation(program, name)
    }

    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
  }

  private slowRepaint: ReturnType<typeof setTimeout> | null = null

  /**
   * Repintado perezoso para que la luna se mueva sin tocar el mapa.
   *
   * CINCO SEGUNDOS, con la cuenta hecha: la Tierra gira 0,25° por minuto, o sea
   * que en cinco segundos la luna se corre 1,25 minutos de arco, un 4 % de su
   * propio diámetro. Sin esto se quedaría clavada hasta que alguien arrastrara
   * el mapa, y con repintado continuo costaría una GPU entera para dibujar seis
   * vértices — con la agravante de que un repintado aquí redibuja el relieve
   * entero, que es lo caro.
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
    if (!map || !state || !this.visible || !this.program) return
    // Sin inclinación no hay cielo en pantalla.
    if (map.getPitch() <= 0) return

    // La hora es la del reloj, no la del estado de React: ver `observer`.
    const moon = moonSight(Date.now(), state.observer)
    // Debajo del horizonte de QUIEN MIRA, que no es el horizonte a secas.
    if (moon.apparentElevationDeg <= state.floorDeg) {
      this.scheduleSlowRepaint()
      return
    }

    const canvas = map.getCanvas()
    const aspect = canvas.width / Math.max(1, canvas.height)
    const screen = moonScreen(
      matrix as unknown as ArrayLike<number>,
      moon.direction,
      moon.brightLimb,
      aspect,
    )
    if (!screen.ahead) {
      this.scheduleSlowRepaint()
      return
    }

    // El campo de visión de MapLibre no es API pública: se lee si está y si no
    // se usa el de fábrica.
    const fovDeg =
      (map.transform as unknown as { fov?: number } | undefined)?.fov ?? CAMERA_FOV_DEG
    const halfFov = (fovDeg / 2) * (Math.PI / 180)
    const discRadius =
      Math.tan(((moon.angularDiameterDeg / 2) * Math.PI) / 180) / Math.tan(halfFov)
    const quadRadius = discRadius * GLOW_RADII
    if (Math.abs(screen.x) > 1 + quadRadius || Math.abs(screen.y) > 1 + quadRadius) {
      this.scheduleSlowRepaint()
      return
    }

    const look = moonLook({
      apparentElevationDeg: moon.apparentElevationDeg,
      illumination: moon.illumination,
      extinctionK: state.extinctionK,
      sunElevationDeg: state.sunElevationDeg,
    })

    // El ángulo de fase, del que salen la elipse del terminador y el sombreado.
    // `cos α = 2k − 1` es exacto; el seno es no negativo porque α va de 0 a 180.
    const cosPhase = Math.max(-1, Math.min(1, 2 * moon.illumination - 1))
    const sinPhase = Math.sqrt(Math.max(0, 1 - cosPhase * cosPhase))

    // Medio píxel, en unidades del cuadrilátero. Es lo que evita que el borde
    // del disco salga escalonado cuando la luna es pequeña, que es siempre.
    const soft = quadRadius > 0 ? 1 / Math.max(1, quadRadius * canvas.height * 0.5) : 0

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(this.aQuad)
    gl.vertexAttribPointer(this.aQuad, 2, gl.FLOAT, false, 0, 0)

    gl.uniform2f(this.u.u_center, screen.x, screen.y)
    // El radio en x se corrige por la relación de aspecto: si no, la luna sale
    // ovalada en cuanto la ventana no es cuadrada.
    gl.uniform2f(this.u.u_radius, quadRadius / aspect, quadRadius)
    gl.uniform3f(this.u.u_color, look.color[0], look.color[1], look.color[2])
    gl.uniform1f(this.u.u_luminance, look.luminance)
    gl.uniform1f(this.u.u_earthshine, look.earthshine)
    gl.uniform1f(this.u.u_disc, 1 / GLOW_RADII)
    // Sin cuerno que apuntar —eclipse o luna nueva exacta— se manda el eje x y
    // da igual: con `cos α` en ±1 el disco sale entero lleno o entero vacío.
    gl.uniform2f(
      this.u.u_limb,
      screen.limb[0] || 1,
      screen.limb[1],
    )
    gl.uniform1f(this.u.u_cosPhase, cosPhase)
    gl.uniform1f(this.u.u_sinPhase, sinPhase)
    gl.uniform1f(this.u.u_dayness, look.dayness)
    gl.uniform1f(this.u.u_soft, soft)

    // Premultiplicada: la luna es un cuerpo opaco y tapa el cielo, al revés que
    // las estrellas, que le suman luz. Ver `moon-shaders.ts`.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.depthMask(true)
    gl.disableVertexAttribArray(this.aQuad)
    this.scheduleSlowRepaint()
  }
}
