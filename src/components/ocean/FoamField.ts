/**
 * El campo de espuma persistente: la textura del mundo donde la espuma vive
 * y muere despacio.
 *
 * LA ESPUMA NO ES DEL INSTANTE. La ola que rompe deja una mancha que se funde
 * en decenas de segundos; sin memoria, cada fotograma la pinta de cero y la
 * estela no existe —la rompiente parpadea como una pegatina—. Aquí las
 * fuentes de espuma que dejan huella —la rompiente, los borreguillos y los
 * regueros del viento— se acumulan en una textura del MUNDO de 1024 × 1024
 * sobre el recuadro de la orilla y decaen con exp(−dt/τ), τ = 15 s medido en
 * \`lib/ocean/foam.ts\`. Como la textura vive en el mundo, la estela se queda
 * donde rompió la ola aunque se mueva la cámara: es la única manera de que la
 * memoria no sea un arrastre.
 *
 * Es un bucle de realimentación de ping-pong: un fotograma lee la textura A
 * y escribe la B, el siguiente al revés. La regla de Safari se respeta —las
 * dos texturas se crean UNA vez y solo se reescriben— y si el contexto no da
 * para el bucle, quien llama apaga el campo y el océano vuelve a la espuma
 * instantánea de siempre sin que nadie lo note más que en la estela que no
 * estuvo.
 *
 * La espuma de la orilla NO pasa por aquí: esa sigue a la lengua del agua,
 * que sube y baja con cada ola, y acumularla sería pintar una orilla de
 * ayer encima de la de ahora.
 */

import { SHORELINE_SIZE } from '../../lib/ocean/land-mask'
import { FOAM_SOURCE_GLSL } from './shaders/foam'
import { CONSTANTS, WAVE_FUNCTIONS } from './shaders/waves'

type Gl = WebGLRenderingContext | WebGL2RenderingContext

const VERTEX = /* glsl */ `
precision highp float;
attribute vec2 a_ndc;
varying vec2 v_ndc;
void main() {
  v_ndc = a_ndc;
  gl_Position = vec4(a_ndc, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
precision highp float;
${CONSTANTS}
uniform vec4 u_fieldBox;
uniform vec4 u_bathyBox;
uniform vec4 u_shoreBox;
uniform float u_maxDepth;
uniform float u_metersPerMerc;
uniform sampler2D u_swellTex;
uniform sampler2D u_windSeaTex;
uniform sampler2D u_windTex;
uniform sampler2D u_bathyTex;
uniform sampler2D u_shoreTex;
uniform sampler2D u_detailTex;
uniform sampler2D u_foamPrev;
uniform float u_time;
uniform float u_detailMeters;
uniform float u_decay;
varying vec2 v_ndc;
${WAVE_FUNCTIONS}
${FOAM_SOURCE_GLSL}

void main() {
  vec2 uv = v_ndc * 0.5 + 0.5;
  vec2 p = u_shoreBox.xy + uv * u_shoreBox.zw;
  float depth = depthAt(p);
  vec4 shore = shoreAt(p);
  vec2 posM = p * u_metersPerMerc;

  // La misma física que el vértice del océano, por texel: la rompiente sale
  // de la batimetría y el asomeramiento, y la cresta de la fase de los dos
  // trenes. No hay vértices aquí, así que los acumuladores se tiran.
  vec3 disp = vec3(0.0);
  vec3 nrm = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  float ampSum = 0.0;
  float breaking = 0.0;
  addTrain(trainAt(u_swellTex, p), posM, depth, shore.zw, u_time, 1.0,
           disp, nrm, crest, ampSum, breaking);
  addTrain(trainAt(u_windSeaTex, p), posM, depth, shore.zw, u_time, 1.0,
           disp, nrm, crest, ampSum, breaking);

  vec2 wind = windAt(p);
  float windSpeed = length(wind);
  vec2 windDir = windSpeed > 0.15 ? wind / windSpeed : vec2(1.0, 0.0);

  float src = foamSource(
    ampSum > 0.0 ? crest / ampSum : 0.0, breaking, windDir, windSpeed,
    posM, u_time, u_detailMeters, u_detailTex);

  float prev = texture2D(u_foamPrev, uv).r;
  gl_FragColor = vec4(max(prev * u_decay, src), 0.0, 0.0, 1.0);
}
`

export interface FoamFieldResources {
  fbo: WebGLFramebuffer
  texA: WebGLTexture
  texB: WebGLTexture
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
  aNdc: number
  buffer: WebGLBuffer
  /** Cuál de las dos texturas es la que el océano tiene que leer. */
  current: 0 | 1
}

export interface FoamFieldInputs {
  decay: number
  time: number
  fieldBox: [number, number, number, number]
  bathyBox: [number, number, number, number]
  shoreBox: [number, number, number, number]
  maxDepth: number
  metersPerMerc: number
  detailMeters: number
  textures: {
    swell: WebGLTexture
    windSea: WebGLTexture
    wind: WebGLTexture
    bathymetry: WebGLTexture
    shoreline: WebGLTexture
    detail: WebGLTexture
  }
}

const UNIFORM_NAMES = [
  'u_fieldBox',
  'u_bathyBox',
  'u_shoreBox',
  'u_maxDepth',
  'u_metersPerMerc',
  'u_swellTex',
  'u_windSeaTex',
  'u_windTex',
  'u_bathyTex',
  'u_shoreTex',
  'u_detailTex',
  'u_foamPrev',
  'u_time',
  'u_detailMeters',
  'u_decay',
] as const

function compile(gl: Gl, type: number, source: string, what: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error(`no se pudo crear el shader de ${what}`)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de ${what} de la espuma no compila: ${log}`)
  }
  return shader
}

function createTexture(gl: Gl): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('sin memoria para el campo de espuma')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    SHORELINE_SIZE,
    SHORELINE_SIZE,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  )
  gl.bindTexture(gl.TEXTURE_2D, null)
  return texture
}

export function buildFoamField(gl: Gl, spindrift: boolean): FoamFieldResources {
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('sin memoria para el campo de espuma')
  const texA = createTexture(gl)
  const texB = createTexture(gl)

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (!ok) throw new Error('el campo de espuma no puede renderizarse en este contexto')

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX, 'vértices')
  // Los `#define` van delante de todo, igual que en `shadersFor`: este pase
  // solo corre en calidad alta, donde la espuma de viento existe, y el
  // programa tiene que pintar las mismas fuentes que el océano lee.
  const fs = compile(gl, gl.FRAGMENT_SHADER, `${spindrift ? '#define SPINDRIFT\n' : ''}${FRAGMENT}`, 'fragmentos')
  const program = gl.createProgram()
  if (!program) throw new Error('no se pudo crear el programa de la espuma')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`el programa de la espuma no enlaza: ${gl.getProgramInfoLog(program)}`)
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name)

  const buffer = gl.createBuffer()
  if (!buffer) throw new Error('sin memoria para el cuadrado de la espuma')
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.bindBuffer(gl.ARRAY_BUFFER, null)

  return {
    fbo,
    texA,
    texB,
    program,
    uniforms,
    aNdc: gl.getAttribLocation(program, 'a_ndc'),
    buffer,
    current: 0,
  }
}

/** Un paso del bucle: lee la textura actual, escribe la otra, y la convierte en actual. */
export function renderFoamField(
  gl: Gl,
  foam: FoamFieldResources,
  inputs: FoamFieldInputs,
): void {
  const prev = foam.current === 0 ? foam.texA : foam.texB
  const next = foam.current === 0 ? foam.texB : foam.texA

  const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
  gl.bindFramebuffer(gl.FRAMEBUFFER, foam.fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, next, 0)
  gl.viewport(0, 0, SHORELINE_SIZE, SHORELINE_SIZE)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)

  gl.useProgram(foam.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, foam.buffer)
  gl.enableVertexAttribArray(foam.aNdc)
  gl.vertexAttribPointer(foam.aNdc, 2, gl.FLOAT, false, 0, 0)

  const u = foam.uniforms
  gl.uniform4fv(u.u_fieldBox, inputs.fieldBox)
  gl.uniform4fv(u.u_bathyBox, inputs.bathyBox)
  gl.uniform4fv(u.u_shoreBox, inputs.shoreBox)
  gl.uniform1f(u.u_maxDepth, inputs.maxDepth)
  gl.uniform1f(u.u_metersPerMerc, inputs.metersPerMerc)
  gl.uniform1f(u.u_time, inputs.time)
  gl.uniform1f(u.u_detailMeters, inputs.detailMeters)
  gl.uniform1f(u.u_decay, inputs.decay)

  const t = inputs.textures
  const bind = (unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (location) gl.uniform1i(location, unit)
  }
  bind(0, t.swell, u.u_swellTex)
  bind(1, t.windSea, u.u_windSeaTex)
  bind(2, t.wind, u.u_windTex)
  bind(3, t.bathymetry, u.u_bathyTex)
  bind(4, t.shoreline, u.u_shoreTex)
  bind(5, t.detail, u.u_detailTex)
  bind(6, prev, u.u_foamPrev)

  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.disableVertexAttribArray(foam.aNdc)

  foam.current = foam.current === 0 ? 1 : 0

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3])
}

export function disposeFoamField(gl: Gl, foam: FoamFieldResources): void {
  gl.deleteFramebuffer(foam.fbo)
  gl.deleteTexture(foam.texA)
  gl.deleteTexture(foam.texB)
  gl.deleteProgram(foam.program)
  gl.deleteBuffer(foam.buffer)
}
