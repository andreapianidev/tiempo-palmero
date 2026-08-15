/**
 * El sol en el cielo. Capa personalizada, del tamaño que le toca.
 *
 * POR QUÉ EXISTE. La cúpula de MapLibre pinta el aire —el degradado del cenit al
 * horizonte— y no la fuente que lo ilumina. Con la luz real encendida, la
 * aplicación dibujaba el reflejo del sol sobre el agua, las nubes encendidas por
 * la cara que le da y el relieve iluminado desde donde está, y en el sitio del
 * que venía todo eso no había nada.
 *
 * MEDIO GRADO, NI UNO MÁS. El disco solar mide 0,53° de diámetro visto desde
 * aquí, y ese es el tamaño con el que se dibuja: no es una decisión estética,
 * es la única que no miente. Un sol más grande convierte el cielo en un cartel,
 * y es el error más repetido en las escenas 3D. La conversión a píxeles sale del
 * campo de visión de la cámara de MapLibre.
 *
 * SE OCULTA SOLO. El cuadrilátero va a profundidad 1 —el fondo del búfer— con la
 * prueba en LEQUAL, así que el relieve, que escribe profundidad, lo tapa cuando
 * se pone delante. No hay ningún cálculo de oclusión y no puede desincronizarse
 * de lo que se ve.
 *
 * NO SE DIBUJA SI NO TOCA: con el sol bajo el horizonte, fuera de la pantalla o
 * con la vista en plano —donde el horizonte no existe— la capa no gasta ni una
 * llamada de dibujo.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import type { OceanLight } from '../../lib/ocean/light'
import { airMass } from '../../lib/shadow/depth'
import type { SkyPosition } from '../../lib/sun'
import { sunScreen } from '../../lib/sky/sun-screen'
import { SUN_FRAGMENT_SHADER, SUN_VERTEX_SHADER } from './sun-shaders'

export const SUN_LAYER_ID = 'sky-sun'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/**
 * Diámetro angular del Sol visto desde la Tierra: 0,533° de media.
 *
 * Varía un 3 % entre el perihelio y el afelio —lo que hace que un eclipse sea
 * total o anular— y esa diferencia aquí no la vería nadie: es medio píxel.
 */
const SUN_ANGULAR_DIAMETER_DEG = 0.533

/**
 * Campo de visión vertical de la cámara de MapLibre: 36,87°, su valor de
 * fábrica (`Transform.fov`, 0,6435 rad).
 *
 * Se lee del transform si está disponible y si no se usa éste. Hace falta para
 * una sola cosa: pasar de grados de cielo a fracción de pantalla, que es lo que
 * decide el tamaño del disco.
 */
const DEFAULT_FOV_DEG = 36.87

/**
 * Cuántas veces el radio del disco mide el cuadrilátero que se dibuja.
 *
 * La aureola no es del tamaño del sol: es la luz dispersada por el aire de
 * alrededor, y se extiende varios grados. 40 radios solares son ~10° de cielo,
 * que es donde el resplandor deja de distinguirse del propio azul.
 */
const GLOW_RADII = 40

export class SunLayer implements CustomLayerInterface {
  readonly id = SUN_LAYER_ID
  readonly type = 'custom' as const
  // 3d: entra en el pase con búfer de profundidad, que es lo que hace que el
  // relieve lo tape. En 2d se dibujaría por encima de la montaña.
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aQuad = -1
  private uCenter: WebGLUniformLocation | null = null
  private uRadius: WebGLUniformLocation | null = null
  private uColor: WebGLUniformLocation | null = null
  private uIntensity: WebGLUniformLocation | null = null
  private uDisc: WebGLUniformLocation | null = null

  private sun: SkyPosition = { elevationDeg: 45, azimuthDeg: 180 }
  private light: OceanLight | null = null
  private visible = false

  setSun(sun: SkyPosition): void {
    this.sun = sun
    this.map?.triggerRepaint()
  }

  setLight(light: OceanLight | null): void {
    this.light = light
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
    if (!program) throw new Error('no se pudo crear el programa del sol')
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('no se pudo crear el shader del sol')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`shader del sol no compila: ${log}`)
      }
      return shader
    }
    const vs = compile(gl.VERTEX_SHADER, SUN_VERTEX_SHADER)
    const fs = compile(gl.FRAGMENT_SHADER, SUN_FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa del sol no enlaza: ${gl.getProgramInfoLog(program)}`)
    }
    this.program = program
    this.aQuad = gl.getAttribLocation(program, 'a_quad')
    this.uCenter = gl.getUniformLocation(program, 'u_center')
    this.uRadius = gl.getUniformLocation(program, 'u_radius')
    this.uColor = gl.getUniformLocation(program, 'u_color')
    this.uIntensity = gl.getUniformLocation(program, 'u_intensity')
    this.uDisc = gl.getUniformLocation(program, 'u_disc')

    // Dos triángulos, una vez. El cuadrilátero no cambia: lo que cambia es
    // dónde y de qué tamaño se dibuja, y eso son dos uniformes.
    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )
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
    // Con la vista en plano no hay cielo donde ponerlo: el horizonte está en el
    // infinito y lo que se ve es el mapa, mirado desde arriba.
    if (map.getPitch() <= 0) return
    const light = this.light
    if (!light) return
    // Bajo el horizonte no hay sol que dibujar. El crepúsculo lo pinta la
    // cúpula, que para eso ya sabe la hora.
    if (this.sun.elevationDeg <= 0) return

    // El punto de fuga de la dirección del sol. La cuenta vive en
    // `lib/sky/sun-screen.ts`, que es la única parte de esta capa que se puede
    // probar sin tarjeta gráfica.
    const screen = sunScreen(matrix as unknown as ArrayLike<number>, this.sun)
    if (!screen.ahead) return
    const ndcX = screen.x
    const ndcY = screen.y

    // Medio grado de cielo, en fracción de media pantalla. El campo de visión de
    // MapLibre no es API pública: se lee si está y si no se usa el de fábrica.
    const fovDeg =
      (map.transform as unknown as { fov?: number } | undefined)?.fov ?? DEFAULT_FOV_DEG
    const halfFov = (fovDeg / 2) * (Math.PI / 180)
    const discRadius =
      Math.tan(((SUN_ANGULAR_DIAMETER_DEG / 2) * Math.PI) / 180) / Math.tan(halfFov)
    const quadRadius = discRadius * GLOW_RADII

    const canvas = map.getCanvas()
    const aspect = canvas.width / Math.max(1, canvas.height)
    // Fuera de la pantalla —con margen para la aureola— no se dibuja nada.
    if (Math.abs(ndcX) > 1 + quadRadius || Math.abs(ndcY) > 1 + quadRadius) return

    // CUÁNTA LUZ LLEGA DE VERDAD. Es la transmitancia del haz directo a través
    // de la masa de aire que el sol tiene delante: la misma fórmula de Meinel
    // con la que se calcula la profundidad de una sombra. A 2° de altura queda
    // el 30 %, y por eso se puede mirar un sol poniente y no uno de mediodía.
    const beam = Math.pow(0.7, Math.pow(airMass(this.sun.elevationDeg), 0.678))

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(this.aQuad)
    gl.vertexAttribPointer(this.aQuad, 2, gl.FLOAT, false, 0, 0)
    gl.uniform2f(this.uCenter, ndcX, ndcY)
    // El radio en x se corrige por la relación de aspecto: si no, el sol sale
    // ovalado en cuanto la ventana no es cuadrada.
    gl.uniform2f(this.uRadius, quadRadius / aspect, quadRadius)
    gl.uniform3f(this.uColor, light.sunColor[0], light.sunColor[1], light.sunColor[2])
    gl.uniform1f(this.uIntensity, beam)
    gl.uniform1f(this.uDisc, 1 / GLOW_RADII)

    // La premultiplicada de siempre: el disco lleva alfa 1 y borra el cielo que
    // tiene detrás; la aureola lleva alfa 0 y se suma. Ver `sun-shaders.ts`.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.depthMask(true)
    gl.disableVertexAttribArray(this.aQuad)
  }
}
