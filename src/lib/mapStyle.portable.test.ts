import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `mapStyle.ts` lo comparten la web y la app nativa.
 *
 * `mobile/src/map/IslandMap.tsx` llama a `buildStyle()` con el mismo
 * manifiesto, y allí la librería del mapa es `@maplibre/maplibre-react-native`:
 * **`maplibre-gl` no está instalada**. Basta con que un módulo de esta cadena
 * la importe en tiempo de ejecución para que Metro no resuelva el paquete y la
 * app de iOS y Android deje de compilar.
 *
 * Y no se entera nadie: `npm test` y `npm run build` solo miran la web, donde
 * esa importación es perfectamente válida. Ya pasó una vez —el sombreado propio
 * se declaraba dentro de `buildStyle`, y con él entraba `maplibre.addProtocol`—
 * y de ahí sale este test.
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
   * Y la otra orilla: que el detector no diga siempre que no. `relief/protocol`
   * SÍ importa `maplibre-gl` a runtime —es su trabajo, se registra en ella— y
   * tiene que salir señalado. Un test que solo comprueba que la lista está
   * vacía pasaría igual con la expresión regular rota.
   */
  it('y el detector no está roto: caza la importación que sí existe', () => {
    const src = readFileSync(resolve(HERE, 'relief/protocol.ts'), 'utf8')
    expect(runtimeMaplibreImport(src)).toBe("import maplibregl from 'maplibre-gl'")
    expect(files.some((f) => f.endsWith('relief/protocol.ts'))).toBe(false)
  })

  it('el sombreado propio no se declara en el estilo compartido', () => {
    // Su fuente y su capa las añade `MapView`, que sí es solo de la web. En la
    // app nativa un `relieve://` sería una fuente que no carga nunca.
    const src = readFileSync(resolve(HERE, 'mapStyle.ts'), 'utf8')
    expect(src).not.toContain('reliefSource')
    expect(src).not.toContain('registerRelief')
  })
})
