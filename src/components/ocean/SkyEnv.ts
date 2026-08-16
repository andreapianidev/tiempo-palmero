/**
 * El mapa de cielo que el agua refleja: una textura equirect con el cielo de
 * ahora y las nubes de la escena atmosférica encima.
 *
 * POR QUÉ NO ES EL CIELO QUE SE VE. La cúpula y las nubes de la vista 3D las
 * dibuja MapLibre, y hacer que el agua las muestree directamente obligaría a
 * mover capas de sitio —las nubes se dibujan DESPUÉS del océano— y a romper lo
 * que ya funciona. Aquí se pinta un cielo propio en una textura de 256 × 128,
 * UNA vez por segundo: el degradado con la MISMA función `skyColor` que el
 * sombreador del agua usa cuando no hay escena —compartida, no copiada— y las
 * nubes como discos blandos puestos con la misma escena que dibuja `CloudLayer`,
 * sombreadas con el mismo `crossShade` que apaga la manta de atrás.
 *
 * No es el render 3D de las nubes, es SU REFLEJO: el agua lo desdibuja con la
 * ola, así que un disco blando por nube es indistinguible de la mota perfecta,
 * y sale gratis. Lo que no se puede permitir es que falte la manta entera:
 * eso sí lo vería cualquiera.
 *
 * LA REGLA DE SAFARI. La textura y los programas se crean UNA vez y no se
 * destruyen hasta que el mapa muere: reescribir una textura con
 * \`texSubImage2D\` —aquí, renderizando a un FBO— no la recrea, y recrearla es
 * lo que lleva a Safari a soltar el contexto entero. Misma regla que
 * \`OceanResources\`.
 */

import type { OceanLight } from '../../lib/ocean/light'
import { cloudEnvRect, ENV_H, ENV_W } from '../../lib/ocean/sky-env'
import type { Cloud } from '../../lib/sky/scene'
import { crossShade } from '../../lib/sky/crossshade'
import type { SkyPosition } from '../../lib/sun'
import { SKY_GLSL } from './shaders/sky'
import { CONSTANTS } from './shaders/waves'

type Gl = WebGLRenderingContext | WebGL2RenderingContext

/** El sol de la escena, sacado de la dirección que ya calcula la luz. */
function sunOf(light: OceanLight): SkyPosition {
  const [x, y, z] = light.sunDir
  return {
    elevationDeg: (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI,
    azimuthDeg: (Math.atan2(x, y) * 180) / Math.PI,
  }
}

const SKY_VERTEX = /* glsl */ `
precision highp float;
attribute vec2 a_ndc;
varying vec2 v_ndc;
void main() {
  v_ndc = a_ndc;
  gl_Position = vec4(a_ndc, 0.0, 1.0);
}
`

const SKY_FRAGMENT = /* glsl */ `
precision highp float;
${CONSTANTS}
${SKY_GLSL}
varying vec2 v_ndc;
void main() {
  vec2 uv = v_ndc * 0.5 + 0.5;
  float az = (uv.x - 0.5) * TAU;
  float el = (0.5 - uv.y) * PI;
  vec3 dir = vec3(cos(el) * sin(az), cos(el) * cos(az), sin(el));
  gl_FragColor = vec4(skyColor(dir), 1.0);
}
`

const CLOUD_VERTEX = /* glsl */ `
precision highp float;
attribute vec2 a_env;
attribute vec3 a_shape; // sombra, alfa, radio en texeles
varying float v_shade;
varying float v_alpha;
void main() {
  v_shade = a_shape.x;
  v_alpha = a_shape.y;
  gl_Position = vec4(a_env * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = min(a_shape.z, 63.0);
}
`

const CLOUD_FRAGMENT = /* glsl */ `
precision highp float;
${CONSTANTS}
${SKY_GLSL}
uniform vec3 u_ambient;
varying float v_shade;
varying float v_alpha;
void main() {
  // Un disco blando: el centro opaco y el borde deshecho, como toca a un
  // estrato visto de lejos. La forma exacta de la mota no se distingue en el
  // reflejo; la masa y su sombra sí.
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float fall = 1.0 - smoothstep(0.55, 1.0, d);
  vec3 lit = u_ambient + u_sunColor * u_sunIntensity;
  vec3 c = lit * mix(0.35, 1.0, v_shade);
  float a = v_alpha * fall;
  gl_FragColor = vec4(c * a, a);
}
`

interface Program {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

function compile(gl: Gl, type: number, source: string, what: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error(`no se pudo crear el shader de ${what}`)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`shader de ${what} del mapa de cielo no compila: ${log}`)
  }
  return shader
}

function link(gl: Gl, vs: WebGLShader, fs: WebGLShader, what: string): Program {
  const program = gl.createProgram()
  if (!program) throw new Error(`no se pudo crear el programa de ${what}`)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`el programa de ${what} no enlaza: ${gl.getProgramInfoLog(program)}`)
  }
  const names = [
    'u_sunDir',
    'u_sunColor',
    'u_sunIntensity',
    'u_moonDir',
    'u_moonIntensity',
    'u_zenith',
    'u_horizon',
    'u_haze',
    'u_ambient',
  ]
  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  for (const name of names) uniforms[name] = gl.getUniformLocation(program, name)
  return { program, uniforms }
}

export interface SkyEnvResources {
  fbo: WebGLFramebuffer
  texture: WebGLTexture
  sky: Program & { aNdc: number; buffer: WebGLBuffer }
  clouds: Program & { aEnv: number; aShape: number; buffer: WebGLBuffer }
  /** Vértices de nube: u, v, sombra, alfa, radio. Solo crece, como en CloudLayer. */
  vertices: Float32Array
  cross: Float32Array
  order: number[]
}

const STRIDE = 5

export function buildSkyEnv(gl: Gl): SkyEnvResources {
  const fbo = gl.createFramebuffer()
  const texture = gl.createTexture()
  if (!fbo || !texture) throw new Error('sin memoria para el mapa de cielo')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    ENV_W,
    ENV_H,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  )
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.bindTexture(gl.TEXTURE_2D, null)
  if (!ok) throw new Error('el mapa de cielo no puede renderizarse en este contexto')

  const skyVs = compile(gl, gl.VERTEX_SHADER, SKY_VERTEX, 'cielo')
  const skyFs = compile(gl, gl.FRAGMENT_SHADER, SKY_FRAGMENT, 'cielo')
  const sky = { ...link(gl, skyVs, skyFs, 'cielo'), aNdc: 0, buffer: null as unknown as WebGLBuffer }
  sky.aNdc = gl.getAttribLocation(sky.program, 'a_ndc')
  sky.buffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, sky.buffer)
  // Un cuadrado que cubre la textura entera.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  )
  gl.bindBuffer(gl.ARRAY_BUFFER, null)

  const cloudVs = compile(gl, gl.VERTEX_SHADER, CLOUD_VERTEX, 'nubes')
  const cloudFs = compile(gl, gl.FRAGMENT_SHADER, CLOUD_FRAGMENT, 'nubes')
  const clouds = {
    ...link(gl, cloudVs, cloudFs, 'nubes'),
    aEnv: 0,
    aShape: 0,
    buffer: null as unknown as WebGLBuffer,
  }
  clouds.aEnv = gl.getAttribLocation(clouds.program, 'a_env')
  clouds.aShape = gl.getAttribLocation(clouds.program, 'a_shape')
  clouds.buffer = gl.createBuffer()!

  return {
    fbo,
    texture,
    sky,
    clouds,
    vertices: new Float32Array(0),
    cross: new Float32Array(0),
    order: [],
  }
}

export function disposeSkyEnv(gl: Gl, env: SkyEnvResources): void {
  gl.deleteFramebuffer(env.fbo)
  gl.deleteTexture(env.texture)
  gl.deleteProgram(env.sky.program)
  gl.deleteProgram(env.clouds.program)
  gl.deleteBuffer(env.sky.buffer)
  gl.deleteBuffer(env.clouds.buffer)
}

/** Pinta el cielo y las nubes en la textura. Una vez por segundo basta. */
export function renderSkyEnv(
  gl: Gl,
  env: SkyEnvResources,
  light: OceanLight,
  clouds: readonly Cloud[],
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, env.fbo)
  gl.viewport(0, 0, ENV_W, ENV_H)
  gl.disable(gl.DEPTH_TEST)
  gl.disable(gl.BLEND)

  // --- el aire ------------------------------------------------------------
  const sky = env.sky
  gl.useProgram(sky.program)
  gl.bindBuffer(gl.ARRAY_BUFFER, sky.buffer)
  gl.enableVertexAttribArray(sky.aNdc)
  gl.vertexAttribPointer(sky.aNdc, 2, gl.FLOAT, false, 0, 0)
  const u = sky.uniforms
  gl.uniform3fv(u.u_sunDir, light.sunDir)
  gl.uniform3fv(u.u_sunColor, light.sunColor)
  gl.uniform1f(u.u_sunIntensity, light.sunIntensity)
  gl.uniform3fv(u.u_moonDir, light.moonDir)
  gl.uniform1f(u.u_moonIntensity, light.moonIntensity)
  gl.uniform3fv(u.u_zenith, light.zenith)
  gl.uniform3fv(u.u_horizon, light.horizon)
  gl.uniform1f(u.u_haze, light.haze)
  gl.uniform3fv(u.u_ambient, light.ambient)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.disableVertexAttribArray(sky.aNdc)

  // --- las nubes, de la más lejana a la más cercana ------------------------
  if (clouds.length) {
    const sun = sunOf(light)
    // La misma cuenta que CloudLayer: una manta apaga a la que tiene detrás.
    // Con un barrido por segundo el sol no se mueve nada entre dos, y una nube
    // deriva rígida, así que su sombra no cambia por moverse.
    if (env.cross.length < clouds.length) env.cross = new Float32Array(clouds.length)
    crossShade(clouds, sun, env.cross)

    const needed = clouds.length * STRIDE
    if (env.vertices.length < needed) env.vertices = new Float32Array(needed)
    const out = env.vertices
    const order = env.order
    order.length = clouds.length
    let n = 0
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i]
      const rect = cloudEnvRect(c.lon, c.lat, (c.base + c.top) / 2, c.radiusM)
      const k = n * STRIDE
      out[k] = rect.u
      out[k + 1] = rect.v
      out[k + 2] = env.cross[i]
      // La opacidad sale de la densidad, como en CloudLayer; el disco blando
      // no necesita el apilamiento exacto de motas, solo no ser invisible ni
      // ser una losa.
      out[k + 3] = Math.min(0.85, 0.18 + 1.1 * Math.min(1, c.density))
      out[k + 4] = rect.radiusTexels
      order[n] = n
      n++
    }
    order.sort((a, b) => out[b * STRIDE + 1] - out[a * STRIDE + 1]) // más abajo = más cerca
    // Dibujo por orden de cercanía: las que están más abajo en el cielo son las
    // más cercanas al observador y pintan encima.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const cu = env.clouds
    gl.useProgram(cu.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, cu.buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      env.vertices.subarray(0, n * STRIDE),
      gl.DYNAMIC_DRAW,
    )
    gl.enableVertexAttribArray(cu.aEnv)
    gl.vertexAttribPointer(cu.aEnv, 2, gl.FLOAT, false, STRIDE * 4, 0)
    gl.enableVertexAttribArray(cu.aShape)
    gl.vertexAttribPointer(cu.aShape, 3, gl.FLOAT, false, STRIDE * 4, 2 * 4)
    const uu = cu.uniforms
    gl.uniform3fv(uu.u_sunDir, light.sunDir)
    gl.uniform3fv(uu.u_sunColor, light.sunColor)
    gl.uniform1f(uu.u_sunIntensity, light.sunIntensity)
    gl.uniform3fv(uu.u_moonDir, light.moonDir)
    gl.uniform1f(uu.u_moonIntensity, light.moonIntensity)
    gl.uniform3fv(uu.u_zenith, light.zenith)
    gl.uniform3fv(uu.u_horizon, light.horizon)
    gl.uniform1f(uu.u_haze, light.haze)
    gl.uniform3fv(uu.u_ambient, light.ambient)
    gl.drawArrays(gl.POINTS, 0, n)
    gl.disableVertexAttribArray(cu.aEnv)
    gl.disableVertexAttribArray(cu.aShape)
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}
