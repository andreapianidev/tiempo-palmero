/**
 * Los objetos de GPU del océano: programa, búferes y texturas.
 *
 * Está separado de `OceanLayer` porque son dos responsabilidades que se tocan
 * en momentos distintos: esto se crea una vez (o cuando cambia la calidad y hay
 * que recompilar) y aquello ocurre sesenta veces por segundo. Mezclarlas
 * significaba un fichero donde la reserva de memoria de vídeo vivía en medio
 * del bucle de dibujo.
 *
 * LA REGLA DE SAFARI. Safari es severo con la memoria de vídeo y con la
 * recreación de recursos: destruir y volver a crear texturas al mover el mapa
 * lo lleva a soltar el contexto WebGL entero, y entonces el mapa desaparece —no
 * el mar: el mapa—. Aquí no se destruye nada al navegar. Las texturas se
 * reservan con su tamaño definitivo y se REESCRIBEN con `texSubImage2D`; lo
 * único que se recrea es el programa, y solo cuando alguien cambia la calidad a
 * mano.
 */

import type { OceanField } from '../../lib/ocean/field'
import type { ShorelineMap } from '../../lib/ocean/land-mask'
import { buildDetailTexture, DETAIL_SIZE } from '../../lib/ocean/detail'
import { QUALITY, type OceanQuality } from '../../lib/ocean/quality'
import { buildProjectedGrid } from './ProjectedGrid'
import { shadersFor } from './shaders'

type Gl = WebGLRenderingContext | WebGL2RenderingContext

/** Los uniforms que el programa expone. Se buscan una vez, al enlazar. */
export type UniformMap = Record<string, WebGLUniformLocation | null>

const UNIFORM_NAMES = [
  'u_matrix',
  'u_invMatrix',
  'u_time',
  'u_seaLevel',
  'u_metersPerMerc',
  'u_maxRange',
  'u_camera',
  'u_fieldBox',
  'u_bathyBox',
  'u_shoreBox',
  'u_maxDepth',
  'u_swellTex',
  'u_windSeaTex',
  'u_windTex',
  'u_bathyTex',
  'u_shoreTex',
  'u_detailTex',
  'u_backgroundTex',
  'u_geomScale',
  'u_depthSlack',
  'u_resolution',
  'u_metersPerPixel',
  'u_sunDir',
  'u_sunColor',
  'u_sunIntensity',
  'u_moonDir',
  'u_moonIntensity',
  'u_zenith',
  'u_horizon',
  'u_ambient',
  'u_haze',
  'u_deepColor',
  'u_shallowColor',
  'u_foamColor',
  'u_lit',
  'u_baseReveal',
  'u_detailMeters',
  'u_detailAmp',
  'u_microVariance',
  'u_fade',
] as const

function compile(gl: Gl, type: number, source: string, what: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error(`no se pudo crear el shader de ${what}`)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`el shader de ${what} del océano no compila: ${log}`)
  }
  return shader
}

export interface OceanProgram {
  program: WebGLProgram
  uniforms: UniformMap
  aNdc: number
  key: string
}

export function buildProgram(gl: Gl, quality: OceanQuality): OceanProgram {
  const { vertex, fragment, key } = shadersFor(quality)
  const program = gl.createProgram()
  if (!program) throw new Error('no se pudo crear el programa del océano')
  const vs = compile(gl, gl.VERTEX_SHADER, vertex, 'vértices')
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment, 'fragmentos')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`el programa del océano no enlaza: ${gl.getProgramInfoLog(program)}`)
  }

  const uniforms: UniformMap = {}
  for (const name of UNIFORM_NAMES) uniforms[name] = gl.getUniformLocation(program, name)
  return { program, uniforms, aNdc: gl.getAttribLocation(program, 'a_ndc'), key }
}

export interface GridResources {
  vertexBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  count: number
  divisions: number
}

export function buildGrid(gl: Gl, quality: OceanQuality): GridResources {
  const grid = buildProjectedGrid(QUALITY[quality].grid)
  const vertexBuffer = gl.createBuffer()
  const indexBuffer = gl.createBuffer()
  if (!vertexBuffer || !indexBuffer) throw new Error('sin memoria para la rejilla del océano')
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, grid.vertices, gl.STATIC_DRAW)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.indices, gl.STATIC_DRAW)
  return { vertexBuffer, indexBuffer, count: grid.count, divisions: grid.divisions }
}

/**
 * Crea una textura vacía con filtrado lineal y bordes fijados.
 *
 * `CLAMP_TO_EDGE` en todas: los campos del océano no se repiten —fuera de su
 * recuadro hay mar abierto, no otra isla— y en WebGL 1 una textura que no sea
 * potencia de dos NO admite repetición. La única que sí se repite es la de
 * detalle, que es de 256 justamente para poder hacerlo.
 */
function createTexture(gl: Gl, repeat = false, mipmap = false): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('sin memoria para una textura del océano')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
  )
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

export interface OceanTextures {
  swell: WebGLTexture
  windSea: WebGLTexture
  wind: WebGLTexture
  bathymetry: WebGLTexture
  shoreline: WebGLTexture
  detail: WebGLTexture
  background: WebGLTexture
  /** Tamaño ya reservado de cada campo, para saber si hay que reservar de nuevo. */
  fieldSize: number
  shorelineSize: number
  backgroundW: number
  backgroundH: number
}

export function buildTextures(gl: Gl): OceanTextures {
  const textures: OceanTextures = {
    swell: createTexture(gl),
    windSea: createTexture(gl),
    wind: createTexture(gl),
    bathymetry: createTexture(gl),
    shoreline: createTexture(gl),
    // La de detalle se repite por todo el mar y lleva mipmaps: sin ellos, al
    // alejarse el rizado se convierte en un hormigueo de puntos —la textura se
    // muestrea más fina que el píxel— y eso es exactamente lo que delata un
    // océano de videojuego viejo.
    detail: createTexture(gl, true, true),
    background: createTexture(gl),
    fieldSize: 0,
    shorelineSize: 0,
    backgroundW: 0,
    backgroundH: 0,
  }

  // La textura de detalle se genera aquí y no cambia nunca más.
  const detail = buildDetailTexture(DETAIL_SIZE)
  gl.bindTexture(gl.TEXTURE_2D, textures.detail)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    detail.size,
    detail.size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    detail.pixels,
  )
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return textures
}

/** Sube (o actualiza) una de las tres texturas de campo. */
export function uploadField(gl: Gl, textures: OceanTextures, field: OceanField): void {
  const pairs: [WebGLTexture, Uint8Array][] = [
    [textures.swell, field.swell],
    [textures.windSea, field.windSea],
    [textures.wind, field.wind],
  ]
  const grown = textures.fieldSize !== field.size
  for (const [texture, pixels] of pairs) {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    if (grown) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        field.size,
        field.size,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      )
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        field.size,
        field.size,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      )
    }
  }
  textures.fieldSize = field.size
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function uploadShoreline(
  gl: Gl,
  textures: OceanTextures,
  shore: ShorelineMap,
): void {
  gl.bindTexture(gl.TEXTURE_2D, textures.shoreline)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    shore.width,
    shore.height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    shore.pixels,
  )
  textures.shorelineSize = shore.width
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function uploadBathymetry(
  gl: Gl,
  textures: OceanTextures,
  image: TexImageSource,
): void {
  gl.bindTexture(gl.TEXTURE_2D, textures.bathymetry)
  // El PNG viene en gris. Se sube como luminancia y el sombreador lee el canal
  // rojo, que es donde WebGL replica la luminancia.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, image)
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function disposeTextures(gl: Gl, textures: OceanTextures): void {
  for (const key of [
    'swell',
    'windSea',
    'wind',
    'bathymetry',
    'shoreline',
    'detail',
    'background',
  ] as const) {
    gl.deleteTexture(textures[key])
  }
}
