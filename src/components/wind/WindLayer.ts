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
import { degPerSecondPerMs, ParticleSystem } from '../../lib/wind/particles'
import { viewportHeightDeg } from '../../lib/wind/altitude'
import { fillTrailVertices, trailBufferSize, VERTEX_FLOATS } from '../../lib/wind/trails'
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
 * Dónde se dibuja cada pasada, en píxeles CSS PERPENDICULARES al segmento y con
 * signo. El shader calcula la perpendicular; aquí solo se dice a qué distancia.
 *
 * `gl.LINES` dibuja siempre un píxel —`lineWidth` mayor que 1 lo ignoran casi
 * todas las implementaciones de WebGL— así que el grosor se consigue repitiendo
 * el mismo buffer con el vértice desplazado. El trazo son tres líneas en
 * −0,5 / 0 / +0,5, o sea una banda de dos píxeles; el halo, dos líneas a ±1,5
 * que la flanquean sin dejar hueco ni montarse encima.
 *
 * ANTES ERAN NUEVE PASADAS EN CRUZ Y AHORA SON CINCO EN PERPENDICULAR. El halo
 * iba a 1,7 px en las cuatro direcciones de la pantalla y el trazo a 0,5 px en
 * las cuatro diagonales; sobre el relieve, donde de la estela solo sobreviven
 * trozos, esas nueve copias dibujaban una crucecita blanca en vez de una
 * estela. El porqué está entero en `shaders.ts`. La distancia del halo baja de
 * 1,7 a 1,5 porque ya no rodea una cruz sino que va pegada a una banda de dos
 * píxeles: a 1,7 quedaba una rendija de fondo entre el trazo y su contorno.
 *
 * Lo que no cambia es la regla, que costó dos intentos: el trazo tiene que
 * pesar siempre más que el halo, o a zoom alto —donde la estela mide cuatro
 * píxeles— el viento se ve como una mancha del color del contorno. Cuál de los
 * dos es el claro lo decide el shader mirando el fondo.
 */
const CASING_OFFSETS = [-1.5, 1.5]
const CORE_OFFSETS = [-0.5, 0, 0.5]

/**
 * Radio, en píxeles CSS, del entorno del fondo que decide si el trazo va claro
 * u oscuro.
 *
 * 6 px: tiene que cubrir de sobra el ancho de lo que se dibuja —la banda del
 * trazo más su halo son 4 px— para que una estela entera se lleve una sola
 * polaridad, y quedarse muy por debajo del tamaño de las manchas que de verdad
 * hay que distinguir: el mar contra la tierra, o una celda de la malla de
 * color, que a cualquier zoom miden decenas de píxeles. No es un umbral sobre
 * un dato: es cuánto se desenfoca una decisión de contraste.
 */
const LUMA_RADIUS_PX = 6

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
  private aOther = -1
  private aStyle = -1
  private uMatrix: WebGLUniformLocation | null = null
  private uOpacity: WebGLUniformLocation | null = null
  private uOffset: WebGLUniformLocation | null = null
  private uPxToNdc: WebGLUniformLocation | null = null
  private uCasing: WebGLUniformLocation | null = null
  private uBackground: WebGLUniformLocation | null = null
  private uResolution: WebGLUniformLocation | null = null
  private uLumaRadius: WebGLUniformLocation | null = null

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
   * `x, y, z, otherX, otherY, otherZ, side, alpha, speed, station` por vértice;
   * dos vértices por segmento.
   *
   * El otro extremo va REPETIDO en cada vértice, que son cuatro flotantes más
   * por vértice —4,7 MB en vez de 2,8—, porque es lo que le deja al shader
   * medir en pantalla hacia dónde va la estela y desplazar el halo
   * perpendicular a ella. La alternativa, mandar el ángulo ya calculado desde
   * la CPU, no vale: con la cámara inclinada el mismo rumbo geográfico se
   * proyecta con ángulos distintos según lo lejos que esté el segmento.
   *
   * `side` es +1 en el primer vértice y −1 en el segundo, para que los dos
   * extremos se desplacen al MISMO lado. Está explicado en `shaders.ts`.
   *
   * Quién escribe todo esto y con qué orden es `lib/wind/trails.ts`, que se
   * puede probar sin ventana ni contexto de dibujo.
   */
  private readonly vertices = new Float32Array(trailBufferSize(PARTICLE_COUNT))

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
    this.aOther = gl.getAttribLocation(program, 'a_other')
    this.aStyle = gl.getAttribLocation(program, 'a_style')
    this.uMatrix = gl.getUniformLocation(program, 'u_matrix')
    this.uOpacity = gl.getUniformLocation(program, 'u_opacity')
    this.uOffset = gl.getUniformLocation(program, 'u_offset')
    this.uPxToNdc = gl.getUniformLocation(program, 'u_pxToNdc')
    this.uCasing = gl.getUniformLocation(program, 'u_casing')
    this.uBackground = gl.getUniformLocation(program, 'u_background')
    this.uResolution = gl.getUniformLocation(program, 'u_resolution')
    this.uLumaRadius = gl.getUniformLocation(program, 'u_lumaRadius')

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

    const vertexCount = fillTrailVertices(this.particles, this.vertices, exaggeration)
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
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, vertexCount * VERTEX_FLOATS))

    const stride = VERTEX_FLOATS * 4
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(this.aOther)
    gl.vertexAttribPointer(this.aOther, 4, gl.FLOAT, false, stride, 3 * 4)
    gl.enableVertexAttribArray(this.aStyle)
    gl.vertexAttribPointer(this.aStyle, 3, gl.FLOAT, false, stride, 7 * 4)

    gl.uniformMatrix4fv(this.uMatrix, false, matrix as unknown as Float32List)
    gl.uniform1f(this.uOpacity, 1)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.background)
    gl.uniform1i(this.uBackground, 0)
    const bufferW = Math.max(1, gl.drawingBufferWidth)
    const bufferH = Math.max(1, gl.drawingBufferHeight)
    gl.uniform2f(this.uResolution, bufferW, bufferH)
    // El radio va en píxeles CSS y la textura en píxeles de dibujo: en una
    // pantalla de retina son el doble, y sin convertir el desenfoque mediría la
    // mitad justo donde el sombreado tiene más detalle.
    gl.uniform2f(
      this.uLumaRadius,
      (LUMA_RADIUS_PX * ratio) / bufferW,
      (LUMA_RADIUS_PX * ratio) / bufferH,
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

    // Primero el halo, a un lado y a otro de la estela, y encima el trazo. Es
    // el mismo buffer cinco veces: no cuesta un vértice más de CPU, que es
    // donde esta capa tiene el límite.
    //
    // De píxeles CSS a espacio de recorte: la ventana mide 2 unidades de ancho.
    // El shader necesita la equivalencia en los dos sentidos —para medir el
    // rumbo del segmento en píxeles y para devolver el desplazamiento a
    // recorte—, así que va de uniforme en vez de aplicarse aquí.
    gl.uniform2f(this.uPxToNdc, 2 / Math.max(1, canvas.width / ratio), 2 / heightCss)

    gl.uniform1f(this.uCasing, 1)
    for (const offset of CASING_OFFSETS) {
      gl.uniform1f(this.uOffset, offset)
      gl.drawArrays(gl.LINES, 0, vertexCount)
    }

    gl.uniform1f(this.uCasing, 0)
    for (const offset of CORE_OFFSETS) {
      gl.uniform1f(this.uOffset, offset)
      gl.drawArrays(gl.LINES, 0, vertexCount)
    }

    gl.disableVertexAttribArray(this.aPos)
    gl.disableVertexAttribArray(this.aOther)
    gl.disableVertexAttribArray(this.aStyle)

    // Se devuelve el estado de profundidad exactamente como estaba.
    if (exaggeration > 0) gl.depthMask(depthMaskWas)
    else if (depthWasOn) gl.enable(gl.DEPTH_TEST)

    // La animación no la mueve un `requestAnimationFrame` propio: se pide otro
    // fotograma al mapa, que así conserva el control del ciclo de dibujo.
    map.triggerRepaint()
  }
}
