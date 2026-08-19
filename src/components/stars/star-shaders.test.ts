/**
 * Que los sombreadores compilen, comprobado antes de que lo compruebe la
 * tarjeta gráfica de quien abra la página.
 *
 * POR QUÉ ESTO HACE FALTA. Un error de GLSL no lo caza `tsc` ni `vite`: los
 * sombreadores son cadenas de texto, y una coma de menos pasa la compilación de
 * TypeScript, pasa el build, pasa el despliegue y falla en el navegador de otra
 * persona. Es la única parte de esta función que no tenía red debajo.
 *
 * SE SALTA SI NO ESTÁ `glslangValidator`, que es de las herramientas de Vulkan
 * y no todo el mundo la tiene instalada. Saltar una prueba es peor que
 * ejecutarla y mejor que obligar a instalar el SDK de Vulkan para poder correr
 * `npm test`; el mensaje dice cómo tenerla (`brew install glslang`).
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FIGURE_FRAGMENT_SHADER,
  FIGURE_VERTEX_SHADER,
  STAR_FRAGMENT_SHADER,
  STAR_VERTEX_SHADER,
} from './star-shaders'

function haveValidator(): boolean {
  try {
    execFileSync('glslangValidator', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const available = haveValidator()

/**
 * `#version 100` es el perfil de WebGL 1, que es el que MapLibre usa para las
 * capas personalizadas. Compilarlos contra un perfil más nuevo dejaría pasar
 * cosas que en el navegador fallan.
 */
function compiles(source: string, ext: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tp-glsl-'))
  const file = path.join(dir, `shader.${ext}`)
  writeFileSync(file, `#version 100\n${source}`)
  try {
    execFileSync('glslangValidator', [file], { encoding: 'utf8' })
    return ''
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return `${err.stdout ?? ''}${err.stderr ?? ''}`
  }
}

describe.skipIf(!available)('los sombreadores del cielo compilan', () => {
  it('el vértice de las estrellas', () => {
    expect(compiles(STAR_VERTEX_SHADER, 'vert')).toBe('')
  })
  it('el fragmento de las estrellas', () => {
    expect(compiles(STAR_FRAGMENT_SHADER, 'frag')).toBe('')
  })
  it('el vértice de las figuras', () => {
    expect(compiles(FIGURE_VERTEX_SHADER, 'vert')).toBe('')
  })
  it('el fragmento de las figuras', () => {
    expect(compiles(FIGURE_FRAGMENT_SHADER, 'frag')).toBe('')
  })
  it('y el validador de verdad caza un error', () => {
    // La contraprueba: sin esto, una ruta que no encuentre el binario o que
    // devuelva siempre cero haría que las cuatro de arriba pasaran sin
    // comprobar nada, que es la peor forma de tener pruebas.
    expect(compiles(STAR_VERTEX_SHADER.replace('float cd = cos(dec);', 'float cd = cos(dec)'), 'vert')).not.toBe('')
  })
})

describe('los sombreadores llevan lo que tienen que llevar', () => {
  it('las estrellas se dibujan a profundidad 1 para que el relieve las tape', () => {
    // Sin esto, las estrellas se verían A TRAVÉS de la Cumbre. Es la misma
    // regla que sigue el disco del sol, y no depende de ningún cálculo de
    // oclusión: z = w deja la profundidad en el fondo del búfer.
    expect(STAR_VERTEX_SHADER).toContain('gl_Position = vec4(clip.x, clip.y, clip.w, clip.w);')
    expect(FIGURE_VERTEX_SHADER).toContain('gl_Position = vec4(clip.x, clip.y, clip.w, clip.w);')
  })

  it('el norte entra con el signo cambiado, porque Mercator crece al sur', () => {
    // El error que pondría el cielo espejado: seguiría saliendo un cielo, y
    // sería el de otro sitio. La misma corrección que hace `sun-screen.ts`.
    expect(STAR_VERTEX_SHADER).toContain('u_view * vec4(dir.x, -dir.y, dir.z, 0.0)')
    expect(FIGURE_VERTEX_SHADER).toContain('u_view * vec4(dir.x, -dir.y, dir.z, 0.0)')
  })

  it('la aberración se suma antes de normalizar, no después', () => {
    // Sumarla después de normalizar daría un vector de longitud distinta de 1 y
    // un desplazamiento que depende de la declinación. Son 20", o sea que el
    // fallo no se vería: por eso lo mira una prueba y no un ojo.
    expect(STAR_VERTEX_SHADER).toContain('+ u_aberration;\n  vec3 h = u_sky * normalize(p);')
  })
})
