/**
 * Comprueba que los sombreadores del océano compilan, sin abrir un navegador.
 *
 *   npx tsx scripts/checks/glsl.ts
 *
 * POR QUÉ EXISTE. Un error de GLSL no lo caza ni TypeScript ni vitest: el
 * código del sombreador es una cadena de texto hasta que la GPU lo compila, y
 * si no compila, lo único que pasa es que el mar no aparece —sin ruido, sin
 * excepción visible salvo una línea en la consola del navegador—. Esto lo pilla
 * en la terminal, en un segundo, y con el número de línea.
 *
 * Usa `glslangValidator`, el compilador de referencia de Khronos
 * (`brew install glslang`), que es exactamente el que valida el mismo dialecto
 * —OpenGL ES 1.00— que compila el navegador. Si no está instalado, avisa y sale
 * sin fallar: es una comprobación de desarrollo, no un requisito para construir
 * la aplicación.
 *
 * Se compilan las TRES variantes de calidad, porque cada una es un programa
 * distinto —los `#define` quitan y ponen código de verdad— y un fallo en la
 * ligera no aparece en la alta.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OCEAN_QUALITIES } from '../../src/lib/ocean/quality.js'
import { shadersFor } from '../../src/components/ocean/shaders/index.js'
import { log, warn } from '../shared.js'

function hasValidator(): boolean {
  try {
    execFileSync('glslangValidator', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function check(source: string, stage: 'vert' | 'frag', name: string, dir: string): boolean {
  // `#version 100` marca el perfil de OpenGL ES 1.00, que es el que habla
  // WebGL: sin él se leería como GLSL de escritorio y aceptaría cosas que el
  // navegador rechaza (y al revés). La extensión del fichero es la que le dice
  // al validador qué etapa está compilando.
  const file = path.join(dir, `${name}.${stage}`)
  writeFileSync(file, `#version 100\n${source}`)
  try {
    execFileSync('glslangValidator', [file], { stdio: 'pipe' })
    return true
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer }
    console.error(`\n✗ ${name}.${stage}\n${err.stderr?.toString() ?? err.stdout?.toString() ?? e}`)
    return false
  }
}

function main(): void {
  if (!hasValidator()) {
    warn('glslangValidator no está instalado (brew install glslang): no se comprueba el GLSL')
    return
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'tiempo-glsl-'))
  let ok = true
  for (const quality of OCEAN_QUALITIES) {
    const { vertex, fragment } = shadersFor(quality)
    ok = check(vertex, 'vert', `oceano-${quality}`, dir) && ok
    ok = check(fragment, 'frag', `oceano-${quality}`, dir) && ok
    if (ok) log(`océano ${quality}: vértice y fragmento compilan`)
  }
  if (!ok) process.exit(1)
}

main()
