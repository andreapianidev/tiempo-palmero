/**
 * El taller de WebGL donde se realzan las teselas.
 *
 * Un solo contexto WebGL2 fuera de pantalla, compartido por todo lo que
 * procesa imágenes: el realce de los fondos de GRAFCAN y el sombreado propio
 * del relieve. Uno y no dos porque un contexto es un recurso escaso —los
 * navegadores cortan por la decimosexta— y porque los dos hacen lo mismo:
 * pintar un cuadrado con un shader y llevarse el resultado.
 *
 * ESTO NO ES EL MAPA. MapLibre tiene su propio contexto y no se toca. Aquí se
 * cuecen imágenes sueltas que después se le entregan ya hechas, como si
 * vinieran de la red.
 *
 * SI NO HAY WEBGL2, NO PASA NADA. `surface()` devuelve `null` y quien lo pida
 * sigue su camino con la tesela tal cual llegó. El realce es una mejora, no un
 * requisito: un mapa sin realzar se lee; un mapa en blanco, no.
 */

/** Un cuadrado que cubre la pantalla, sin geometría: se hace con el índice. */
const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export interface Gl {
  readonly gl: WebGL2RenderingContext
  /** Compila —o recupera— el programa de un fragment shader. */
  program(frag: string): WebGLProgram | null
  /** Una textura vacía, sin filtrar y sin repetir. Nada más. */
  texture(): WebGLTexture | null
  /**
   * Pinta el cuadrado con ese programa sobre un lienzo de `w × h` y devuelve
   * la imagen. `setup` es donde se atan uniformes y texturas.
   */
  draw(
    program: WebGLProgram,
    w: number,
    h: number,
    setup: (gl: WebGL2RenderingContext, program: WebGLProgram) => void,
  ): Promise<ImageBitmap | null>
}

type Canvas = OffscreenCanvas | HTMLCanvasElement

let cached: Gl | null | undefined

/** El taller. Se construye la primera vez que alguien lo pide. */
export function surface(): Gl | null {
  if (cached !== undefined) return cached
  cached = build()
  return cached
}

function makeCanvas(): Canvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1)
  if (typeof document !== 'undefined') return document.createElement('canvas')
  return null
}

function build(): Gl | null {
  const canvas = makeCanvas()
  if (!canvas) return null

  // `premultipliedAlpha` en true a propósito: el shader raster de MapLibre
  // divide el color por el alfa antes de usarlo (`color.rgb /= color.a`), o
  // sea que espera recibirlo premultiplicado. Es lo que sale de un lienzo
  // WebGL por defecto, así que no hay nada que convertir.
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    // El lienzo se vuelca a un ImageBitmap justo después de pintar, así que no
    // hace falta que el navegador conserve el búfer entre fotogramas.
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null
  if (!gl) return null

  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  if (!vs) return null
  const programs = new Map<string, WebGLProgram | null>()

  return {
    gl,

    program(frag) {
      const hit = programs.get(frag)
      if (hit !== undefined) return hit
      const fs = compile(gl, gl.FRAGMENT_SHADER, frag)
      let prog: WebGLProgram | null = null
      if (fs) {
        prog = gl.createProgram()
        if (prog) {
          gl.attachShader(prog, vs)
          gl.attachShader(prog, fs)
          gl.linkProgram(prog)
          if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn('[realce] enlazado:', gl.getProgramInfoLog(prog))
            gl.deleteProgram(prog)
            prog = null
          }
        }
        gl.deleteShader(fs)
      }
      programs.set(frag, prog)
      return prog
    },

    texture() {
      const tex = gl.createTexture()
      if (!tex) return null
      gl.bindTexture(gl.TEXTURE_2D, tex)
      // NEAREST y no LINEAR: las teselas del modelo de elevación vienen
      // codificadas en los tres canales de color, y interpolar esos bytes
      // mezcla el byte de las centenas de metros con el de las unidades. La
      // suavidad se consigue después, decodificando y luego interpolando.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return tex
    },

    async draw(program, w, h, setup) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.disable(gl.BLEND)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      setup(gl, program)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if ('transferToImageBitmap' in canvas) return canvas.transferToImageBitmap()
      return createImageBitmap(canvas as HTMLCanvasElement)
    },
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh
  console.warn('[realce] compilación:', gl.getShaderInfoLog(sh))
  gl.deleteShader(sh)
  return null
}

/** Sube una imagen ya decodificada a una textura RGBA. */
export function upload(gl: WebGL2RenderingContext, tex: WebGLTexture, img: ImageBitmap): void {
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
}
