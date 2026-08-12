/**
 * Capa personalizada de MapLibre que anima el viento con partículas en WebGL.
 *
 * Dibuja estelas, no puntos: una partícula sola no dice hacia dónde va, y la
 * dirección es la mitad de lo que un mapa de viento tiene que comunicar. Cada
 * partícula guarda sus últimas posiciones y se pintan como segmentos con la
 * opacidad cayendo hacia la cola.
 *
 * SE DIBUJA CON `gl.LINES` Y ANCHO 1 a propósito. Un trazo grueso exigiría
 * generar triángulos por segmento —cuatro veces los vértices y el doble de
 * código— y `lineWidth` mayor que 1 lo ignoran casi todas las implementaciones
 * de WebGL. Con suficientes partículas finas el campo se lee mejor que con
 * pocas gruesas.
 *
 * NO USA FRAMEBUFFERS PROPIOS. La técnica clásica de estelas —acumular en una
 * textura que se desvanece— obliga a cambiar el framebuffer activo en mitad
 * del ciclo de dibujo de MapLibre y a devolverlo exactamente como estaba. La
 * estela explícita cuesta unos pocos vértices más y no toca el estado del
 * mapa.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { degPerSecondPerMs, ParticleSystem, TAIL_LENGTH } from '../../lib/wind/particles'
import type { WindField } from '../../lib/wind/field'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

export const WIND_LAYER_ID = 'wind-particles'

/** El contexto y la matriz tal como los declara MapLibre, sin volver a
 *  escribirlos: la matriz es un `mat4` de gl-matrix que la librería no
 *  reexporta, así que se toma de la firma. */
type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/**
 * Cuántas partículas. 4200 llenan la isla sin que el campo se vea granulado, y
 * son ~76 000 vértices por fotograma: nada para una GPU, y el coste real está
 * en la simulación en JavaScript, que es lineal en este número.
 */
const PARTICLE_COUNT = 4200

/**
 * Grosor, en píxeles CSS, de las dos pasadas.
 *
 * `gl.LINES` dibuja siempre un píxel —`lineWidth` mayor que 1 lo ignoran casi
 * todas las implementaciones de WebGL— así que el grosor se consigue repitiendo
 * el mismo buffer con el vértice desplazado. El trazo se dibuja cinco veces en
 * medio píxel, que a efectos visuales son dos píxeles de línea clara; el halo,
 * cuatro veces a 1,7 px alrededor.
 *
 * Las proporciones importan y costaron dos intentos: con el halo a un píxel y
 * el trazo a uno solo, a zoom alto —donde la estela mide cuatro píxeles— las
 * cuatro pasadas oscuras pesaban más que la clara y el viento se veía NEGRO
 * sobre la malla. La regla es que la tinta clara supere siempre a la oscura.
 */
const CASING_PX = 1.7
const CORE_PX = 0.5

/** Las cuatro direcciones del halo. Con dos —solo vertical— las estelas
 *  horizontales, que en esta isla son casi todas, se quedaban sin contraste. */
const CASING_OFFSETS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]

/** El trazo: el centro y cuatro diagonales a medio píxel. */
const CORE_OFFSETS: [number, number][] = [
  [0, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
]

/** Escala de color: a partir de aquí una racha se pinta del tono más fuerte. */
const STRONG_WIND_MS = 14

/** Techo del paso de integración. Sin esto, volver a una pestaña dormida
 *  teletransportaría todas las partículas de golpe. */
const MAX_DT = 0.05

/**
 * Mercator normalizado, a mano.
 *
 * Es exactamente lo que hace `MercatorCoordinate.fromLngLat`, pero sin devolver
 * un objeto: a 4200 partículas con estela de diez son 76 000 objetos por
 * fotograma, y el recolector de basura se notaba en la animación más que el
 * dibujo.
 */
function mercatorX(lon: number): number {
  return (180 + lon) / 360
}

function mercatorY(lat: number): number {
  return (
    (180 -
      (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
    360
  )
}

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('no se pudo crear el shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader no compila: ${log}`)
  }
  return shader
}

export class WindLayer implements CustomLayerInterface {
  readonly id = WIND_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aPos = -1
  private aStyle = -1
  private uMatrix: WebGLUniformLocation | null = null
  private uOpacity: WebGLUniformLocation | null = null
  private uOffset: WebGLUniformLocation | null = null
  private uCasing: WebGLUniformLocation | null = null

  private field: WindField | null = null
  private visible = true
  private lastFrame = 0

  private readonly particles = new ParticleSystem(PARTICLE_COUNT)
  /** `x, y, alpha, speed, station` por vértice; dos vértices por segmento. */
  private readonly vertices = new Float32Array(PARTICLE_COUNT * (TAIL_LENGTH - 1) * 2 * 5)

  setField(field: WindField | null): void {
    const first = this.field === null
    this.field = field
    if (field && (first || this.particles.count === 0)) this.resetParticles()
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.map?.triggerRepaint()
  }

  private resetParticles(): void {
    const b = this.spawnBounds()
    if (b) this.particles.reset(b)
  }

  /** Dónde pueden nacer: la vista actual recortada al campo. */
  private spawnBounds() {
    if (!this.field) return null
    const [fw, fs, fe, fn] = this.field.bounds
    const map = this.map
    if (!map) return { west: fw, south: fs, east: fe, north: fn }
    const b = map.getBounds()
    const west = Math.max(fw, b.getWest())
    const east = Math.min(fe, b.getEast())
    const south = Math.max(fs, b.getSouth())
    const north = Math.min(fn, b.getNorth())
    // Si la vista no toca el campo, se siembra en el campo entero: mejor que
    // devolver un rectángulo invertido donde nacerían partículas imposibles.
    if (east <= west || north <= south) return { west: fw, south: fs, east: fe, north: fn }
    return { west, south, east, north }
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map

    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de viento')
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    // Los shaders ya están enlazados en el programa; sueltos solo ocupan.
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa de viento no enlaza: ${gl.getProgramInfoLog(program)}`)
    }

    this.program = program
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.aStyle = gl.getAttribLocation(program, 'a_style')
    this.uMatrix = gl.getUniformLocation(program, 'u_matrix')
    this.uOpacity = gl.getUniformLocation(program, 'u_opacity')
    this.uOffset = gl.getUniformLocation(program, 'u_offset')
    this.uCasing = gl.getUniformLocation(program, 'u_casing')

    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW)

    this.resetParticles()
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.program) gl.deleteProgram(this.program)
    if (this.buffer) gl.deleteBuffer(this.buffer)
    this.program = null
    this.buffer = null
    this.map = null
  }

  render(gl: Gl, matrix: ViewMatrix): void {
    if (!this.program || !this.buffer || !this.field || !this.visible) return
    const map = this.map
    if (!map) return

    const now = performance.now()
    const dt = this.lastFrame ? Math.min(MAX_DT, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now

    const spawn = this.spawnBounds()
    if (!spawn) return
    const bounds = map.getBounds()
    const viewportHeightDeg = Math.max(0.001, bounds.getNorth() - bounds.getSouth())

    this.particles.step(this.field, {
      spawn,
      degPerSecondPerMs: degPerSecondPerMs(viewportHeightDeg),
      dt,
    })

    const vertexCount = this.fillVertices()
    if (vertexCount === 0) {
      map.triggerRepaint()
      return
    }

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, vertexCount * 5))

    const stride = 5 * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aStyle)
    gl.vertexAttribPointer(this.aStyle, 3, gl.FLOAT, false, stride, 2 * 4)

    gl.uniformMatrix4fv(this.uMatrix, false, matrix as unknown as Float32List)
    gl.uniform1f(this.uOpacity, 1)

    // Alpha premultiplicado: es lo que espera el compositor de MapLibre, y el
    // shader ya multiplica el color por su alpha.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.disable(gl.DEPTH_TEST)

    // Primero el halo, en cuatro desplazamientos de un píxel, y encima el
    // trazo. Es el mismo buffer cinco veces: no cuesta un vértice más de CPU,
    // que es donde esta capa tiene el límite.
    const canvas = gl.canvas as HTMLCanvasElement
    const ratio = window.devicePixelRatio || 1
    // De píxeles CSS a espacio de recorte: la ventana mide 2 unidades de ancho.
    const ux = 2 / Math.max(1, canvas.width / ratio)
    const uy = 2 / Math.max(1, canvas.height / ratio)

    gl.uniform1f(this.uCasing, 1)
    for (const [ox, oy] of CASING_OFFSETS) {
      gl.uniform2f(this.uOffset, ox * CASING_PX * ux, oy * CASING_PX * uy)
      gl.drawArrays(gl.LINES, 0, vertexCount)
    }

    gl.uniform1f(this.uCasing, 0)
    for (const [ox, oy] of CORE_OFFSETS) {
      gl.uniform2f(this.uOffset, ox * CORE_PX * ux, oy * CORE_PX * uy)
      gl.drawArrays(gl.LINES, 0, vertexCount)
    }

    gl.disableVertexAttribArray(this.aPos)
    gl.disableVertexAttribArray(this.aStyle)

    // La animación no la mueve un `requestAnimationFrame` propio: se pide otro
    // fotograma al mapa, que así conserva el control del ciclo de dibujo.
    map.triggerRepaint()
  }

  /**
   * Vuelca las estelas al buffer y devuelve cuántos vértices se han escrito.
   *
   * La conversión a coordenadas Mercator se hace aquí, en CPU, porque el
   * `u_matrix` de MapLibre espera Mercator normalizado, no grados. Son dos
   * operaciones por vértice y ocurre una vez por fotograma.
   */
  private fillVertices(): number {
    const p = this.particles
    const out = this.vertices
    let n = 0

    for (let i = 0; i < p.count; i++) {
      const fill = p.tailFill[i]
      if (fill < 2) continue
      const speed = Math.min(1, p.speed[i] / STRONG_WIND_MS)
      const station = p.station[i]
      const base = i * TAIL_LENGTH

      for (let k = 0; k < fill - 1; k++) {
        // La cabeza de la estela es la más opaca; la cola se apaga.
        const a0 = 1 - k / TAIL_LENGTH
        const a1 = 1 - (k + 1) / TAIL_LENGTH
        out[n++] = mercatorX(p.tailLon[base + k])
        out[n++] = mercatorY(p.tailLat[base + k])
        out[n++] = a0
        out[n++] = speed
        out[n++] = station

        out[n++] = mercatorX(p.tailLon[base + k + 1])
        out[n++] = mercatorY(p.tailLat[base + k + 1])
        out[n++] = a1
        out[n++] = speed
        out[n++] = station
      }
    }
    return n / 5
  }
}
