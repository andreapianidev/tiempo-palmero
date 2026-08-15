/**
 * Capa personalizada de MapLibre: la lluvia.
 *
 * VA APARTE DE LAS NUBES a propósito, aunque las dos dibujen el mismo tiempo. No
 * es solo que una use puntos y la otra líneas: es que responden a preguntas
 * distintas —dónde hay nube y dónde llega el agua al suelo— y tienen ritmos
 * distintos. Los hilos nacen y mueren varias veces por minuto contra el
 * terreno; las nubes solo se mueven. Juntarlas en una clase habría sido un
 * fichero con dos simulaciones, dos programas de GL y dos formas de fallar.
 *
 * `renderingMode: '3d'`, por lo mismo que las nubes: la lluvia que cae detrás de
 * una cresta tiene que quedar tapada por ella. Es lo que hace que una cortina se
 * vea metida en un valle y no pegada sobre él.
 *
 * Y SE DIBUJA DESPUÉS DE LAS NUBES, que es el orden en que se añaden las capas
 * en `MapView`: la lluvia cuelga POR DEBAJO de la base de su nube, así que casi
 * nunca compiten por el mismo píxel; donde compiten —mirando una cortina de
 * frente con la nube detrás— lo correcto es que se vea el agua delante.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import type { Dem } from '../../lib/dem'
import { mercatorZ } from '../../lib/wind/altitude'
import { RainDrops, RAIN_CAPACITY, RAIN_STREAK_M } from '../../lib/sky/rain'
import type { Cloud } from '../../lib/sky/scene'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './rain-shaders'

export const RAIN_LAYER_ID = 'sky-rain'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/** Techo del paso de integración. */
const MAX_DT = 0.1

/** Floats por vértice: `x, y, z` y `alfa, cabeza`. Dos vértices por hilo. */
const STRIDE_FLOATS = 5

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('no se pudo crear el shader de lluvia')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de lluvia no compila: ${log}`)
  }
  return shader
}

function mercatorX(lon: number): number {
  return (180 + lon) / 360
}

function mercatorY(lat: number): number {
  return (
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
  )
}

/**
 * El azar de la lluvia, determinista como el de las nubes.
 *
 * Aquí la semilla no evita un parpadeo —los hilos nacen y mueren de todos modos—
 * sino que hace la escena reproducible: el mismo dato y el mismo tiempo
 * transcurrido dan la misma lluvia, que es lo que permite comparar dos capturas
 * de pantalla y saber si un cambio ha hecho algo.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class RainLayer implements CustomLayerInterface {
  readonly id = RAIN_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aPos = -1
  private aStyle = -1
  private uMatrix: WebGLUniformLocation | null = null
  private uDay: WebGLUniformLocation | null = null

  private dem: Dem | null = null
  private visible = false
  private exaggeration = 1
  private day = 1
  private lastFrame = 0
  private raining = false

  private readonly drops = new RainDrops()
  private readonly rand = mulberry32(0x5eed)
  /** Dos vértices por hilo, y el cupo de hilos no cambia nunca. */
  private readonly buf = new Float32Array(RAIN_CAPACITY * 2 * STRIDE_FLOATS)

  setScene(clouds: readonly Cloud[], dem: Dem | null): void {
    this.dem = dem
    this.drops.setClouds(clouds)
    this.raining = clouds.some((c) => c.precipMm > 0)
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    this.lastFrame = 0
    this.map?.triggerRepaint()
  }

  setExaggeration(exaggeration: number): void {
    this.exaggeration = exaggeration
    this.map?.triggerRepaint()
  }

  /** 1 de día, 0 de noche. La calcula la capa de nubes con la misma regla. */
  setDay(day: number): void {
    this.day = day
    this.map?.triggerRepaint()
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map

    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de lluvia')
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa de lluvia no enlaza: ${gl.getProgramInfoLog(program)}`)
    }

    this.program = program
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.aStyle = gl.getAttribLocation(program, 'a_style')
    this.uMatrix = gl.getUniformLocation(program, 'u_matrix')
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
    // Sin una sola nube que llueva no se hace absolutamente nada: no se integra,
    // no se rellena búfer y no se pide otro fotograma. Es el caso normal en esta
    // isla —el sotavento tiene lluvia el 10 % de las horas— y tiene que costar
    // cero, no «poco».
    if (!this.visible || !this.raining) return

    const now = performance.now()
    const dt = this.lastFrame ? Math.min(MAX_DT, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now

    this.drops.step(dt, this.dem, this.rand)

    const vertexCount = this.fillVertices()
    if (vertexCount === 0) {
      map.triggerRepaint()
      return
    }

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.buf.subarray(0, vertexCount * STRIDE_FLOATS),
      gl.DYNAMIC_DRAW,
    )

    const stride = STRIDE_FLOATS * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aStyle)
    gl.vertexAttribPointer(this.aStyle, 2, gl.FLOAT, false, stride, 3 * 4)

    gl.uniformMatrix4fv(this.uMatrix, false, matrix as unknown as Float32List)
    gl.uniform1f(this.uDay, this.day)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.LINES, 0, vertexCount)

    gl.depthMask(true)
    gl.disableVertexAttribArray(this.aPos)
    gl.disableVertexAttribArray(this.aStyle)

    map.triggerRepaint()
  }

  /** Vuelca los hilos vivos al búfer. Devuelve cuántos VÉRTICES se han escrito. */
  private fillVertices(): number {
    const d = this.drops
    const out = this.buf
    let n = 0

    for (let i = 0; i < d.capacity; i++) {
      const alpha = d.alpha[i]
      if (alpha <= 0) continue

      const lon = d.lon[i]
      const lat = d.lat[i]
      const x = mercatorX(lon)
      const y = mercatorY(lat)
      const head = d.alt[i]
      // La cola va por encima de la cabeza, pero nunca por debajo del suelo: un
      // hilo a punto de morir se acorta contra el terreno en vez de hundirse.
      const tail = head + RAIN_STREAK_M

      out[n * STRIDE_FLOATS + 0] = x
      out[n * STRIDE_FLOATS + 1] = y
      out[n * STRIDE_FLOATS + 2] = mercatorZ(head * this.exaggeration, lat)
      out[n * STRIDE_FLOATS + 3] = alpha
      out[n * STRIDE_FLOATS + 4] = 1
      n++

      out[n * STRIDE_FLOATS + 0] = x
      out[n * STRIDE_FLOATS + 1] = y
      out[n * STRIDE_FLOATS + 2] = mercatorZ(tail * this.exaggeration, lat)
      out[n * STRIDE_FLOATS + 3] = alpha
      out[n * STRIDE_FLOATS + 4] = 0
      n++
    }
    return n
  }
}
