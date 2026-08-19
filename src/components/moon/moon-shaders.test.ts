/**
 * Que los sombreadores de la luna compilen y digan lo que tienen que decir.
 *
 * Misma red que la de las estrellas: un error de GLSL no lo caza `tsc` ni el
 * build —son cadenas de texto— y falla en el navegador de otra persona. Se salta
 * si no está `glslangValidator` (`brew install glslang`).
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOON_FRAGMENT_SHADER, MOON_VERTEX_SHADER } from './moon-shaders'

function haveValidator(): boolean {
  try {
    execFileSync('glslangValidator', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const available = haveValidator()

/** `#version 100`: el perfil de WebGL 1, que es el que usa MapLibre. */
function compiles(source: string, ext: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tp-glsl-luna-'))
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

describe.skipIf(!available)('los sombreadores de la luna compilan', () => {
  it('el vértice', () => {
    expect(compiles(MOON_VERTEX_SHADER, 'vert')).toBe('')
  })
  it('el fragmento', () => {
    expect(compiles(MOON_FRAGMENT_SHADER, 'frag')).toBe('')
  })
  it('y el validador de verdad caza un error', () => {
    // La contraprueba: sin ella, un binario que devolviera siempre cero haría
    // pasar las dos de arriba sin comprobar nada.
    expect(compiles(MOON_FRAGMENT_SHADER.replace('float q = length(v_offset);', 'float q = length(v_offset)'), 'frag')).not.toBe('')
  })
})

describe('la luna se dibuja donde y como toca', () => {
  it('a profundidad 1, para que el relieve la tape', () => {
    // Sin esto, la luna se vería A TRAVÉS de la Cumbre. Es la misma regla del
    // disco del sol y de las estrellas, y no depende de ningún cálculo de
    // oclusión que pueda desincronizarse de lo que se ve.
    expect(MOON_VERTEX_SHADER).toContain('vec4(u_center + a_quad * u_radius, 1.0, 1.0)')
  })

  it('el terminador sale de la iluminación y no de una fórmula aparte', () => {
    // LA REGLA DEL FICHERO. Lo iluminado es μ₀ > 0 y la curva del terminador es
    // consecuencia de eso, no una segunda cuenta. Si alguien mete aquí una
    // elipse escrita a mano, tendrá dos cosas que pueden discrepar y la luna
    // saldrá con el cuerno de un grosor y la sombra de otro.
    expect(MOON_FRAGMENT_SHADER).toContain(
      'float mu0 = dot(p, u_limb) * u_sinPhase + z * u_cosPhase;',
    )
    expect(MOON_FRAGMENT_SHADER).toContain('smoothstep(-0.03, 0.03, mu0)')
  })

  it('el sombreado es Lommel-Seeliger, que es lo que la deja plana', () => {
    // Con Lambert la luna llena saldría como una bola iluminada, brillante en el
    // centro y apagada en el borde. La de verdad se ve como una moneda.
    expect(MOON_FRAGMENT_SHADER).toContain('max(0.0, mu0) / max(1e-3, max(0.0, mu0) + z)')
    expect(MOON_FRAGMENT_SHADER).not.toContain('dot(n, l)')
  })

  it('el color va premultiplicado por el alfa', () => {
    // La mezcla es `ONE, ONE_MINUS_SRC_ALPHA`. Escribir el color sin
    // premultiplicar deja una luna translúcida sobre el cielo, que es
    // exactamente lo que una luna no es.
    expect(MOON_FRAGMENT_SHADER).toContain('vec4(rgb * alpha + u_color * glow, alpha)')
  })
})
