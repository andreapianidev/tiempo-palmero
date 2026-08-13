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
 * EN 3D LAS PARTÍCULAS VAN SOBRE EL TERRENO, NO POR DENTRO. Cada vértice lleva
 * su cota —la del modelo de elevación que ya está en memoria— convertida a la Z
 * conforme que espera la matriz de MapLibre, y la capa se declara con
 * `renderingMode: '3d'`, que es lo que hace que comparta el búfer de
 * profundidad con el relieve: una estela detrás de una cresta queda TAPADA por
 * la cresta, que es la diferencia entre viento en tres dimensiones y viento
 * pintado encima de una foto en tres dimensiones. En el mapa plano la Z vale
 * cero y no se toca la profundidad, así que se dibuja exactamente como antes.
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
import { mercatorZ, viewportHeightDeg, windAltitudeM } from '../../lib/wind/altitude'
import { elevationAt, type Dem } from '../../lib/dem'
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
 * cuatro pasadas del halo pesaban más que la del trazo y el viento se veía como
 * una mancha del color del halo. La regla es que el trazo supere siempre al
 * halo; cuál de los dos es el claro lo decide el shader mirando el fondo.
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
 * Cada cuánto se copia el fondo ya dibujado a la textura que decide el
 * contraste, en milisegundos.
 *
 * No hace falta una copia por fotograma: lo que hay debajo solo cambia al
 * mover el mapa, al cambiar de fondo o al refrescar la malla, y 80 ms de
 * retraso en la DECISIÓN de contraste —no en el dibujo— no se ve ni arrastrando
 * el mapa. Copiar a 60 Hz una ventana retina son 6 millones de píxeles por
 * fotograma compitiendo con el resto del mapa por el mismo bus.
 */
const BACKGROUND_REFRESH_MS = 80

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
  /**
   * `3d` y no `2d`: es lo que hace que MapLibre le dé a esta capa el búfer de
   * profundidad compartido con el relieve —lo pone él, con `LEQUAL`— y que la Z
   * de la matriz sea conforme. En el mapa plano se desactiva la prueba de
   * profundidad a mano, así que declararlo así no cambia nada de lo de antes.
   */
  readonly renderingMode = '3d' as const

  private map: MlMap | null = null
  private program: WebGLProgram | null = null
  private buffer: WebGLBuffer | null = null
  private aPos = -1
  private aStyle = -1
  private uMatrix: WebGLUniformLocation | null = null
  private uOpacity: WebGLUniformLocation | null = null
  private uOffset: WebGLUniformLocation | null = null
  private uCasing: WebGLUniformLocation | null = null
  private uBackground: WebGLUniformLocation | null = null
  private uResolution: WebGLUniformLocation | null = null

  /** Copia del mapa ya dibujado bajo esta capa. Ver `captureBackground`. */
  private background: WebGLTexture | null = null
  private backgroundW = 0
  private backgroundH = 0
  private backgroundAt = 0

  private field: WindField | null = null
  /** El modelo de elevación, para saber por dónde va el suelo. */
  private dem: Dem | null = null
  private visible = true
  private lastFrame = 0

  private readonly particles = new ParticleSystem(PARTICLE_COUNT)
  /**
   * `x, y, z, alpha, speed, station` por vértice; dos vértices por segmento.
   *
   * `TAIL_LENGTH` segmentos y no `TAIL_LENGTH - 1`: el primero va de la
   * posición actual —que no está en la estela todavía— a la última apuntada.
   * Sin él la cabeza se quedaba clavada hasta el siguiente apunte y la estela
   * crecía a saltos de 40 ms en vez de deslizarse.
   */
  private readonly vertices = new Float32Array(PARTICLE_COUNT * TAIL_LENGTH * 2 * 6)

  /**
   * El modelo de elevación. Sin él la capa sigue funcionando: dibuja plano, que
   * es lo que hacía antes de que existiera la vista 3D.
   */
  setDem(dem: Dem | null): void {
    this.dem = dem
  }

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
    if (!b) return
    const dem = this.dem
    this.particles.reset(b, dem ? (lon, lat) => elevationAt(dem, lon, lat) ?? 0 : undefined)
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
    this.uBackground = gl.getUniformLocation(program, 'u_background')
    this.uResolution = gl.getUniformLocation(program, 'u_resolution')

    this.background = gl.createTexture()
    if (this.background) {
      gl.bindTexture(gl.TEXTURE_2D, this.background)
      // Sin mipmaps y con los bordes fijados: la textura tiene el tamaño exacto
      // de la ventana, que casi nunca es potencia de dos, y en WebGL 1 eso solo
      // se puede muestrear así.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.bindTexture(gl.TEXTURE_2D, null)
    }

    this.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW)

    this.resetParticles()
  }

  onRemove(_map: MlMap, gl: Gl): void {
    if (this.program) gl.deleteProgram(this.program)
    if (this.buffer) gl.deleteBuffer(this.buffer)
    if (this.background) gl.deleteTexture(this.background)
    this.program = null
    this.buffer = null
    this.background = null
    this.backgroundW = 0
    this.backgroundH = 0
    this.map = null
  }

  /**
   * Copia a una textura lo que ya hay dibujado debajo de esta capa.
   *
   * ES LA RESPUESTA A «EL VIENTO NO SE VE». Un trazo claro con halo oscuro se
   * lee sobre el relieve sombreado y desaparece sobre la carta topográfica, que
   * es papel casi blanco; y ninguna paleta fija sirve para las dos, porque
   * además la malla de temperatura pinta encima naranjas claros y azules
   * oscuros en la misma pantalla. En vez de enumerar los casos —fondo claro,
   * fondo oscuro, con malla, sin malla— la capa MIRA el fondo y decide píxel a
   * píxel: sobre lo claro, trazo oscuro con halo blanco; sobre lo oscuro, al
   * revés. El shader hace la cuenta; aquí solo se le pasa la foto.
   *
   * Se copia del framebuffer que esté activo, que en mitad del ciclo de dibujo
   * es justo el que lleva el mapa hasta esta capa. No hay realimentación
   * posible: MapLibre repinta desde cero cada fotograma, así que las partículas
   * del fotograma anterior no están ahí.
   */
  private captureBackground(gl: Gl, now: number): boolean {
    if (!this.background) return false
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    if (w === 0 || h === 0) return false

    const resized = w !== this.backgroundW || h !== this.backgroundH
    if (!resized && now - this.backgroundAt < BACKGROUND_REFRESH_MS) return true

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.background)
    if (resized) {
      // Al cambiar de tamaño hay que reservar de nuevo: `copyTexSubImage2D`
      // escribe dentro de lo ya reservado y no puede crecer.
      //
      // RGB y no RGBA: en WebGL 1 los canales que se piden tienen que estar
      // TODOS en el framebuffer del que se copia, y no está garantizado que el
      // del mapa lleve alfa. El shader solo mira el color, así que pedir el
      // canal que puede faltar sería arriesgar un INVALID_OPERATION —y con él,
      // la capa entera— a cambio de nada.
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, w, h, 0)
      this.backgroundW = w
      this.backgroundH = h
    } else {
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h)
    }
    this.backgroundAt = now
    return true
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

    // Cuánto abarca la pantalla se mide POR EL ZOOM, en el centro, y no por el
    // rectángulo envolvente de la vista: con la cámara inclinada ese rectángulo
    // llega hasta el horizonte y es tres veces más alto, así que inclinar el
    // mapa habría triplicado la velocidad de las partículas sin que el viento
    // cambiara. Ver `lib/wind/altitude.ts`.
    const canvas = gl.canvas as HTMLCanvasElement
    const ratio = window.devicePixelRatio || 1
    const heightCss = Math.max(1, canvas.height / ratio)
    const viewDeg = viewportHeightDeg(map.getZoom(), map.getCenter().lat, heightCss)

    // La exageración de la escena, tal como la tiene puesta el mapa AHORA. Sin
    // terreno es `null`, y entonces todo esto vale cero y se dibuja plano.
    const terrain = map.getTerrain()
    const exaggeration = terrain ? (terrain.exaggeration ?? 1) : 0
    const dem = exaggeration > 0 ? this.dem : null

    this.particles.step(this.field, {
      spawn,
      degPerSecondPerMs: degPerSecondPerMs(viewDeg),
      dt,
      // Fuera de la cobertura del modelo, nivel del mar: el campo de viento se
      // extiende un poco más allá de la costa y ahí el suelo es el agua.
      elevationAt: dem ? (lon, lat) => elevationAt(dem, lon, lat) ?? 0 : undefined,
    })

    const vertexCount = this.fillVertices(exaggeration)
    if (vertexCount === 0) {
      map.triggerRepaint()
      return
    }

    // La foto del fondo se toma ANTES de dibujar nada nuestro, que es lo que la
    // hace fondo. Si la copia no se puede hacer, la textura queda a negro y el
    // shader se comporta como la versión de siempre: trazo claro, halo oscuro.
    this.captureBackground(gl, now)

    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, vertexCount * 6))

    const stride = 6 * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aStyle)
    gl.vertexAttribPointer(this.aStyle, 3, gl.FLOAT, false, stride, 3 * 4)

    gl.uniformMatrix4fv(this.uMatrix, false, matrix as unknown as Float32List)
    gl.uniform1f(this.uOpacity, 1)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.background)
    gl.uniform1i(this.uBackground, 0)
    gl.uniform2f(
      this.uResolution,
      Math.max(1, gl.drawingBufferWidth),
      Math.max(1, gl.drawingBufferHeight),
    )

    // Alpha premultiplicado: es lo que espera el compositor de MapLibre, y el
    // shader ya multiplica el color por su alpha.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    /*
     * PROFUNDIDAD. MapLibre deja puesto, antes de llamar aquí, `LEQUAL` con
     * escritura para las capas `3d`. Eso es justo lo que hace falta con el
     * relieve encendido —una estela detrás de una cresta se descarta contra la
     * profundidad de la cresta— con UNA corrección: no se escribe. Las estelas
     * son translúcidas y se cruzan entre ellas; si escribieran, la primera que
     * pasa por un píxel taparía a las de detrás aunque fuera casi transparente,
     * y el campo se llenaría de agujeros con forma de estela.
     *
     * En plano se apaga entera, como estaba. Y se apaga y se restaura leyendo
     * el estado real: MapLibre lleva su propia caché de estado de GL, y dejarlo
     * distinto de como estaba le rompería el dibujo a la capa siguiente.
     */
    const depthWasOn = gl.isEnabled(gl.DEPTH_TEST)
    const depthMaskWas = gl.getParameter(gl.DEPTH_WRITEMASK) as boolean
    if (exaggeration > 0) {
      gl.depthMask(false)
    } else {
      gl.disable(gl.DEPTH_TEST)
    }

    // Primero el halo, en cuatro desplazamientos de un píxel, y encima el
    // trazo. Es el mismo buffer cinco veces: no cuesta un vértice más de CPU,
    // que es donde esta capa tiene el límite.
    //
    // De píxeles CSS a espacio de recorte: la ventana mide 2 unidades de ancho.
    const ux = 2 / Math.max(1, canvas.width / ratio)
    const uy = 2 / heightCss

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

    // Se devuelve el estado de profundidad exactamente como estaba.
    if (exaggeration > 0) gl.depthMask(depthMaskWas)
    else if (depthWasOn) gl.enable(gl.DEPTH_TEST)

    // La animación no la mueve un `requestAnimationFrame` propio: se pide otro
    // fotograma al mapa, que así conserva el control del ciclo de dibujo.
    map.triggerRepaint()
  }

  /**
   * Vuelca las estelas al buffer y devuelve cuántos vértices se han escrito.
   *
   * La conversión a coordenadas Mercator se hace aquí, en CPU, porque el
   * `u_matrix` de MapLibre espera Mercator normalizado, no grados. Son tres
   * operaciones por vértice y ocurre una vez por fotograma.
   *
   * `exaggeration` a cero significa mapa plano: la Z se escribe a cero y ni
   * siquiera se mira la cota. Es el mismo camino de código de siempre.
   */
  private fillVertices(exaggeration: number): number {
    const p = this.particles
    const out = this.vertices
    const flat = exaggeration <= 0
    let n = 0

    for (let i = 0; i < p.count; i++) {
      const fill = p.tailFill[i]
      if (fill < 1) continue
      const speed = Math.min(1, p.speed[i] / STRONG_WIND_MS)
      const station = p.station[i]
      const base = i * TAIL_LENGTH
      for (let k = 0; k < fill; k++) {
        // El extremo de delante del primer segmento es la posición actual, que
        // todavía no está apuntada; el de los demás, la estela.
        const lon0 = k === 0 ? p.lon[i] : p.tailLon[base + k - 1]
        const lat0 = k === 0 ? p.lat[i] : p.tailLat[base + k - 1]
        const ground0 = k === 0 ? p.elevation[i] : p.tailElevation[base + k - 1]
        const lon1 = p.tailLon[base + k]
        const lat1 = p.tailLat[base + k]
        const ground1 = p.tailElevation[base + k]
        // La cabeza de la estela es la más opaca; la cola se apaga.
        const a0 = 1 - k / (TAIL_LENGTH + 1)
        const a1 = 1 - (k + 1) / (TAIL_LENGTH + 1)

        out[n++] = mercatorX(lon0)
        out[n++] = mercatorY(lat0)
        out[n++] = flat ? 0 : mercatorZ(windAltitudeM(ground0, exaggeration), lat0)
        out[n++] = a0
        out[n++] = speed
        out[n++] = station

        out[n++] = mercatorX(lon1)
        out[n++] = mercatorY(lat1)
        out[n++] = flat ? 0 : mercatorZ(windAltitudeM(ground1, exaggeration), lat1)
        out[n++] = a1
        out[n++] = speed
        out[n++] = station
      }
    }
    return n / 6
  }
}
