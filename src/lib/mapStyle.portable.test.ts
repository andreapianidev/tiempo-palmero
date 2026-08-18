import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `mapStyle.ts` no lo usa solo la web.
 *
 * El escritorio de UE5 monta el mismo estilo desde `desktop/js-core`, dentro de
 * QuickJS: ahí no hay DOM, no hay `window` y **`maplibre-gl` no está ni puede
 * estar**. Basta con que un módulo de esta cadena la importe en tiempo de
 * ejecución para que el núcleo deje de cargar fuera del navegador.
 *
 * Y no se entera nadie: `npm test` y `npm run build` solo miran la web, donde
 * esa importación es perfectamente válida. Ya pasó una vez —un sombreado propio
 * que se declaraba dentro de `buildStyle`, y con él entraba
 * `maplibre.addProtocol`— y de ahí sale este test. Entonces quien se rompía era
 * la app de iOS y Android, que empaquetaba con Metro; esa app se mudó a su
 * repositorio en agosto de 2026 y la trampa se quedó, porque el que la pisa
 * ahora es el escritorio.
 *
 * La caché de teselas de agosto de 2026 es el caso vivo: `tiles/protocol.ts`
 * llama a `maplibre.addProtocol` de verdad, y por eso cuelga de `MapView` y no
 * de esta cadena. Sus otros cuatro ficheros —rejilla, claves, presupuesto y
 * almacén— no importan la librería, y este test es lo que lo mantiene así.
 *
 * Las importaciones `import type` no cuentan: TypeScript las borra al compilar
 * y nunca llegan al empaquetado.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/** Todos los ficheros del proyecto que alcanza este, siguiendo rutas relativas. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const pending = [entry]

  while (pending.length) {
    const file = pending.pop() as string
    if (seen.has(file)) continue
    seen.add(file)

    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/^import\s+(?:type\s+)?[^'"]*from\s+'(\.[^']+)'/gm)) {
      const target = resolve(dirname(file), m[1])
      for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
        try {
          readFileSync(candidate)
          pending.push(candidate)
          break
        } catch {
          // La siguiente extensión.
        }
      }
    }
  }
  return [...seen]
}

/** Una importación de `maplibre-gl` que NO sea solo de tipos. */
function runtimeMaplibreImport(src: string): string | null {
  for (const m of src.matchAll(/^import\s+([^;]*?)\s*from\s+'maplibre-gl'/gm)) {
    if (!/^type\s/.test(m[1].trim())) return m[0]
  }
  return null
}

describe('el estilo del mapa sigue siendo portable a la app nativa', () => {
  const files = reachableFrom(resolve(HERE, 'mapStyle.ts'))

  it('alcanza los módulos que se esperan, o el rastreo está roto', () => {
    // Si esto baja a uno, es que el rastreador dejó de seguir importaciones y
    // el test de abajo pasaría siempre sin comprobar nada.
    expect(files.length).toBeGreaterThan(4)
    expect(files.some((f) => f.endsWith('contrast/roles.ts'))).toBe(true)
  })

  it('y ninguno de ellos importa maplibre-gl en tiempo de ejecución', () => {
    const offenders = files
      .filter((f) => !f.endsWith('.test.ts'))
      .map((f) => [f, runtimeMaplibreImport(readFileSync(f, 'utf8'))] as const)
      .filter(([, hit]) => hit !== null)
      .map(([f, hit]) => `${f.slice(f.indexOf('/src/'))}: ${hit}`)

    expect(offenders).toEqual([])
  })

  /**
   * Y la otra orilla: que el detector no diga siempre que no. `Terrain3D` SÍ
   * importa `maplibre-gl` a runtime —le pide la cámara y el terreno, y es solo
   * de la web— y tiene que salir señalado, sin estar en la cadena del estilo.
   * Un test que solo comprueba que la lista está vacía pasaría igual con la
   * expresión regular rota.
   */
  it('y el detector no está roto: caza la importación que sí existe', () => {
    const control = resolve(HERE, '../components/terrain/Terrain3D.ts')
    expect(runtimeMaplibreImport(readFileSync(control, 'utf8'))).toBe(
      "import maplibregl, { type Map as MlMap } from 'maplibre-gl'",
    )
    expect(files.includes(control)).toBe(false)
  })
})
