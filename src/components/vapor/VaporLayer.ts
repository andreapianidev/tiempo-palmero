/**
 * Capa personalizada de MapLibre: la evaporación que sube del terreno.
 *
 * CADA PARTÍCULA LLEVA SU ALTITUD, y eso es lo que la deja existir con la
 * cámara inclinada. Durante un tiempo la capa de viento se apagaba en 3D justo
 * por no tenerla: sus estelas se calculaban a cota cero y sobre el relieve se
 * dibujaban atravesando la montaña por dentro. Ya no —`lib/wind/altitude.ts` le
 * dio la cota y el viento se queda encendido—, así que las dos capas comparten
 * ahora el mismo criterio: nada se dibuja en el aire sin saber a qué altura
 * está. La diferencia que queda es de qué van: el viento sigue el terreno a una
 * altura fija sobre él, y esto ASCIENDE desde el suelo hasta condensar.
 *
 * `renderingMode: '3d'` y no `'2d'`, que es lo que hace la mitad del efecto: en
 * modo 3D MapLibre deja la capa dentro del pase con búfer de profundidad, así
 * que una cresta que quede delante **tapa** la bruma que hay detrás en lugar de
 * dejarla flotar por encima. Sin eso, el vapor se lee como una calcomanía sobre
 * la montaña; con eso, se lee como algo que está dentro del valle.
 *
 * NO PIDE NI UN BYTE. El relieve es el DEM que ya está en memoria, el viento es
 * el campo que ya construye la aplicación y la intensidad es el VPD que ya
 * estiman las estaciones. Esta capa no descarga nada: solo mira.
 */

import {
  type CustomLayerInterface,
  type CustomRenderMethod,
  type Map as MlMap,
} from 'maplibre-gl'
import { VaporParticles } from '../../lib/vapor/particles'
import { breathAt, type Breath } from '../../lib/vapor/breath'
import type { VaporField } from '../../lib/vapor/field'
import type { WindField } from '../../lib/wind/field'
import type { Dem } from '../../lib/dem'
import { metersPerPixel } from '../../lib/geo'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

export const VAPOR_LAYER_ID = 'vapor-particles'

type Gl = Parameters<CustomRenderMethod>[0]
type ViewMatrix = Parameters<CustomRenderMethod>[1]

/**
 * Cuántas motas.
 *
 * 14.000, y se llegó subiendo. Con 5.200 la simulación era correcta —las motas
 * nacían donde el VPD decía y subían cuando el sol decía— y en pantalla se
 * veían ocho penachos sueltos por ladera: la física estaba bien y el dibujo no
 * contaba nada. La densidad no es un adorno aquí, es lo que convierte un puñado
 * de puntos en una masa que se lee como bruma.
 *
 * El coste es lineal y está en la CPU, no en la GPU: cinco consultas al modelo
 * de elevación por mota y por paso. 14.000 vértices por fotograma no los nota
 * ninguna tarjeta.
 */
const PARTICLE_COUNT = 14_000

/** Radio del elipsoide que usa MapLibre para su Mercator, en metros. */
const EARTH_RADIUS_M = 6_371_008.8

/** Techo del paso de integración. */
const MAX_DT = 0.05

/**
 * Diámetro de una mota de bruma, en metros de terreno.
 *
 * 340 m no es el tamaño de una gota: es el tamaño del PENACHO que representa.
 * Con 5.200 motas repartidas por los barrancos de la vertiente activa, esto es
 * lo que hace que se sumen entre ellas hasta parecer una masa continua en vez
 * de un puñado de puntos sueltos. Por debajo de ~150 m se ve el grano; por
 * encima de ~500 m la isla se cubre de una sábana y se pierden las columnas.
 * A zoom 12 sobre esta latitud son 33,5 m por píxel, así que una mota mide ~10
 * px en el centro de la pantalla y crece al acercarse.
 */
const BLOB_METERS = 340

/** Centro de la isla, para evaluar la respiración. No cambia con la vista. */
const ISLAND_LON = -17.86
const ISLAND_LAT = 28.66

function compile(gl: Gl, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('no se pudo crear el shader de vapor')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de vapor no compila: ${log}`)
  }
  return shader
}

/** Mercator normalizado, a mano. Ver el mismo comentario en `WindLayer`. */
function mercatorX(lon: number): number {
  return (180 + lon) / 360
}

function mercatorY(lat: number): number {
  return (
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
  )
}

/**
 * De metros de altitud a la tercera coordenada de Mercator.
 *
 * La escala vertical de Mercator depende de la latitud: un metro ocupa más
 * unidades normalizadas cerca de los polos que en el ecuador, porque la
 * proyección estira. Es exactamente lo que hace `mercatorZfromAltitude` de
 * MapLibre, escrito aquí para no crear un objeto por partícula y por fotograma.
 */
function mercatorZ(altitudeM: number, lat: number): number {
  const circumference = 2 * Math.PI * EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180)
  return altitudeM / circumference
}

/**
 * La cuarta componente de un punto tras la matriz de vista: el divisor de la
 * perspectiva. Se calcula a mano para un solo punto por fotograma —el centro—
 * en vez de arrastrar una biblioteca de matrices por una fila.
 */
function clipW(m: ViewMatrix, x: number, y: number, z: number): number {
  const a = m as unknown as ArrayLike<number>
  return a[3] * x + a[7] * y + a[11] * z + a[15]
}

export class VaporLayer implements CustomLayerInterface {
  readonly id = VAPOR_LAYER_ID
  readonly type = 'custom' as const
  /** El que deja la capa dentro del pase con profundidad. Ver la cabecera. */
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aPos = -1
  private aStyle = -1
  private uMatrix: WebGLUniformLocation | null = null
  private uPixelRatio: WebGLUniformLocation | null = null
  private uBasePx: WebGLUniformLocation | null = null
  private uRefW: WebGLUniformLocation | null = null

  private dem: Dem | null = null
  private field: VaporField | null = null
  private wind: WindField | null = null
  private visible = false
  private exaggeration = 1
  private lastFrame = 0

  /**
   * De qué instante es la respiración que se está dibujando.
   *
   * Normalmente «ahora». La reproducción acelerada de 24 h le pasa otra hora, y
   * es el único sitio donde esta capa deja de estar en tiempo real — por eso la
   * hora sale escrita en pantalla mientras dura.
   */
  private clock: Date = new Date()
  private timeScale = 1

  private readonly particles = new VaporParticles(PARTICLE_COUNT)
  /** `x, y, z` y `alfa, tamaño, tinte` por vértice. Un vértice por mota. */
  private readonly vertices = new Float32Array(PARTICLE_COUNT * 6)

  setSources(dem: Dem | null, field: VaporField | null, wind: WindField | null): void {
    this.dem = dem
    this.field = field
    this.wind = wind
    this.map?.triggerRepaint()
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return
    this.visible = visible
    // Al volver a encenderla el reloj arranca de cero: sin esto, el primer paso
    // usaría el `dt` de todo el rato que ha estado apagada y las partículas
    // saltarían medio valle en un fotograma.
    this.lastFrame = 0
    this.map?.triggerRepaint()
  }

  setExaggeration(exaggeration: number): void {
    this.exaggeration = exaggeration
    this.map?.triggerRepaint()
  }

  /** La hora que se está dibujando y a qué velocidad corre. Ver `clock.ts`. */
  setClock(at: Date, timeScale: number): void {
    this.clock = at
    this.timeScale = timeScale
    this.map?.triggerRepaint()
  }

  /** La respiración que se está dibujando, para que el panel diga la misma. */
  breath(): Breath {
    return breathAt(this.clock, ISLAND_LON, ISLAND_LAT)
  }

  onAdd(map: MlMap, gl: Gl): void {
    this.map = map

    const program = gl.createProgram()
    if (!program) throw new Error('no se pudo crear el programa de vapor')
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`el programa de vapor no enlaza: ${gl.getProgramInfoLog(program)}`)
    }

    this.program = program
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.aStyle = gl.getAttribLocation(program, 'a_style')
    this.uMatrix = gl.getUniformLocation(program, 'u_matrix')
    this.uPixelRatio = gl.getUniformLocation(program, 'u_pixelRatio')
    this.uBasePx = gl.getUniformLocation(program, 'u_basePx')
    this.uRefW = gl.getUniformLocation(program, 'u_refW')

    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW)
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
    if (!this.visible || !this.dem || !this.field) return

    const now = performance.now()
    const dt = this.lastFrame ? Math.min(MAX_DT, (now - this.lastFrame) / 1000) : 0.016
    this.lastFrame = now

    const b = map.getBounds()
    this.particles.step({
      dem: this.dem,
      field: this.field,
      wind: this.wind,
      breath: this.breath(),
      // Se siembra en la vista, no en la isla entera: las partículas que nadie
      // está mirando cuestan exactamente lo mismo que las que sí. Y recortada
      // al rectángulo de la isla, que no es lo mismo: desde una cámara
      // inclinada, la mitad de lo que se ve es océano, y sin el recorte la
      // mitad de los intentos de sembrar caían al agua y se descartaban.
      spawn: {
        west: Math.max(b.getWest(), this.field.bounds[0]),
        south: Math.max(b.getSouth(), this.field.bounds[1]),
        east: Math.min(b.getEast(), this.field.bounds[2]),
        north: Math.min(b.getNorth(), this.field.bounds[3]),
      },
      dt,
      timeScale: this.timeScale,
    })

    const vertexCount = this.fillVertices()
    if (vertexCount === 0) {
      map.triggerRepaint()
      return
    }

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, vertexCount * 6))

    const stride = 6 * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aStyle)
    gl.vertexAttribPointer(this.aStyle, 3, gl.FLOAT, false, stride, 3 * 4)

    gl.uniformMatrix4fv(this.uMatrix, false, matrix as unknown as Float32List)
    gl.uniform1f(this.uPixelRatio, window.devicePixelRatio || 1)
    // Cuántos píxeles mide una mota en el centro del mapa. Sale de metros
    // reales entre metros por píxel de este zoom: el mismo penacho ocupa más
    // pantalla cuando el valle ocupa más pantalla, sin ningún factor mágico.
    const center = map.getCenter()
    gl.uniform1f(
      this.uBasePx,
      BLOB_METERS / metersPerPixel(center.lat, map.getZoom()),
    )
    // Y la referencia de profundidad: la `w` del propio centro, a la altura del
    // terreno que hay bajo él. Sin esto habría que adivinar en qué unidades
    // está la `w` de la matriz de MapLibre, que fue exactamente el error que
    // dejó la capa invisible el primer día.
    gl.uniform1f(
      this.uRefW,
      clipW(matrix, mercatorX(center.lng), mercatorY(center.lat), 0),
    )

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    // Se PRUEBA contra la profundidad —para que una cresta delante tape la
    // bruma de detrás— pero no se ESCRIBE en ella: si cada mota escribiera su
    // profundidad, las de detrás desaparecerían al pasar por donde ya hay otra
    // y la masa se llenaría de agujeros.
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(false)

    gl.drawArrays(gl.POINTS, 0, vertexCount)

    gl.depthMask(true)
    gl.disableVertexAttribArray(this.aPos)
    gl.disableVertexAttribArray(this.aStyle)

    map.triggerRepaint()
  }

  /**
   * Vuelca las partículas al búfer y devuelve cuántas se han escrito.
   *
   * Aquí es donde se decide la opacidad de cada mota, y son tres cosas
   * multiplicadas: cuánto evapora su sitio, cuánto le queda de vida, y cuánto
   * le falta para el techo de condensación. La tercera es la que hace que la
   * bruma se DESHAGA al llegar arriba en vez de cortarse en una línea recta:
   * por encima del nivel de condensación esto ya no es vapor invisible, es la
   * manta, y la manta la dibuja otra cosa.
   */
  private fillVertices(): number {
    const p = this.particles
    const field = this.field!
    const out = this.vertices
    let n = 0

    for (let i = 0; i < p.capacity; i++) {
      if (p.weight[i] <= 0 || p.age[i] >= p.life[i]) continue
      const alt = p.alt[i]
      const ground = p.ground[i]
      if (alt > field.ceilingM) continue

      const t = p.age[i] / p.life[i]
      // Entra en el primer 15 % de su vida y se va en el último 45 %.
      const fadeLife = Math.min(1, t / 0.15) * Math.min(1, (1 - t) / 0.45)
      // Y se deshace en los últimos 250 m antes del techo.
      const room = field.ceilingM - alt
      const fadeCeiling = Math.min(1, room / 250)
      // La demanda NO multiplica sola: entra con suelo. Multiplicando en crudo,
      // una ladera con 0,5 kPa —que es la mediana de la isla— salía a 0,10 de
      // opacidad y no se veía nada. Lo que la demanda tiene que cambiar es
      // cuánto vapor hay y hasta dónde llega, no si se ve o no se ve; de la
      // cantidad ya se encarga que nazcan más motas donde más evapora.
      const alpha = 0.38 * (0.45 + 0.55 * p.weight[i]) * fadeLife * fadeCeiling
      if (alpha < 0.005) continue

      // Sube de tamaño con la altura: una columna se abre al ascender.
      const climb = Math.min(1, Math.max(0, (alt - ground) / 700))
      const size = (0.55 + 0.9 * p.seed[i]) * (0.6 + 0.9 * climb)

      const lat = p.lat[i]
      out[n++] = mercatorX(p.lon[i])
      out[n++] = mercatorY(lat)
      // La exageración vertical se aplica AQUÍ, y tiene que aplicarse: MapLibre
      // estira la malla del terreno pero no toca la geometría de una capa
      // personalizada, así que sin esto la bruma se quedaría hundida dentro de
      // la montaña en cuanto alguien pulsara 1,5×.
      out[n++] = mercatorZ(alt * this.exaggeration, lat)
      out[n++] = alpha
      out[n++] = size
      // El tinte va con la altura relativa dentro de la columna.
      out[n++] = climb
    }
    return n / 6
  }
}
