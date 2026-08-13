/**
 * El PNG es la única fuente de verdad de la capa estática, así que lo que se
 * prueba aquí es que **lo que se guardó es exactamente lo que se lee**.
 *
 * No es una comprobación de forma. El entrenamiento cuantiza la distancia a
 * escalones de 8 m y la pendiente a grados enteros ANTES de ajustar, para que
 * el modelo vea lo mismo que va a ver el navegador; si la codificación y la
 * decodificación no coincidieran, esa precaución no serviría de nada y el mapa
 * sería el de un modelo ligeramente distinto del que se validó — sin que fallara
 * nada.
 *
 * El PNG se lee aquí con `pngjs` porque en Node no hay `<canvas>`. Es la misma
 * biblioteca con la que `scripts/prepare-data.ts` lee las teselas del DEM, y la
 * decodificación que se comprueba es byte a byte, así que da igual quién la
 * haga.
 */

import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { FUEL_MODELS_PRESENT, FUEL_UNKNOWN } from './fuel'
import type { FireModelSpec } from './model'
import cells from './__fixtures__/model-cells.json'

const spec = JSON.parse(
  readFileSync(new URL('../../../public/fire/model.json', import.meta.url), 'utf8'),
) as FireModelSpec

const png = PNG.sync.read(
  readFileSync(new URL('../../../public/fire/static.png', import.meta.url)),
)

const at = (row: number, col: number) => {
  const i = (row * png.width + col) * 4
  return {
    fuel: png.data[i],
    distanceM: png.data[i + 1] * spec.distanceStepM,
    slopeDeg: png.data[i + 2],
    alpha: png.data[i + 3],
  }
}

describe('la capa estática', () => {
  it('tiene el tamaño que declara el modelo', () => {
    expect(png.width).toBe(spec.grid.cols)
    expect(png.height).toBe(spec.grid.rows)
  })

  it('es opaca de principio a fin', () => {
    // Con alfa < 255 el navegador puede devolver el color premultiplicado al
    // leer por `<canvas>`, y los otros tres canales volverían alterados. Es un
    // fallo que no se ve: los valores salen parecidos, no iguales.
    for (let i = 3; i < png.data.length; i += 4) {
      if (png.data[i] !== 255) {
        throw new Error(`píxel ${(i - 3) / 4} con alfa ${png.data[i]}`)
      }
    }
    expect(true).toBe(true)
  })

  it('devuelve exactamente lo que el entrenamiento guardó', () => {
    for (const c of cells) {
      const px = at(c.row, c.col)
      expect(px.fuel, `combustible en ${c.row},${c.col}`).toBe(c.fuel)
      expect(px.distanceM, `distancia en ${c.row},${c.col}`).toBe(c.distance)
      expect(px.slopeDeg, `pendiente en ${c.row},${c.col}`).toBe(c.slope)
    }
  })

  it('solo guarda modelos de combustible que existen, o «sin clasificar»', () => {
    const seen = new Set<number>()
    for (let i = 0; i < png.data.length; i += 4) seen.add(png.data[i])
    for (const value of seen) {
      if (value === FUEL_UNKNOWN) continue
      expect(FUEL_MODELS_PRESENT, `valor ${value} en el ráster`).toContain(value)
    }
  })

  it('el mar se guarda como «sin clasificar», no como «sin combustible»', () => {
    // Si la máscara de tierra y este fichero llegaran a discrepar, el resultado
    // tiene que ser una celda que no se pinta, no una celda tranquila. La
    // esquina superior izquierda del recuadro es Atlántico.
    expect(at(0, 0).fuel).toBe(FUEL_UNKNOWN)
  })

  it('la pendiente cabe en un grado entero de 0 a 90', () => {
    for (let i = 2; i < png.data.length; i += 4) {
      expect(png.data[i]).toBeLessThanOrEqual(90)
    }
  })

  it('la distancia no pasa del tope declarado', () => {
    // 250 escalones × 8 m = 2.000 m, y la celda más aislada de la isla está a
    // 1.543 m: el tope no recorta nada, solo acota el canal.
    for (let i = 1; i < png.data.length; i += 4) {
      expect(png.data[i] * spec.distanceStepM).toBeLessThanOrEqual(2000)
    }
  })
})

describe('la malla del modelo y la del mapa son la misma', () => {
  it('el paso es 6 píxeles de DEM, como en `rasterizeGrid`', () => {
    // Es la condición para que lo entrenado signifique algo donde se pinta. Si
    // esto cambiara sin regenerar el PNG, el mapa dibujaría cada celda en el
    // sitio de otra y seguiría teniendo la forma de la isla.
    expect(spec.grid.step).toBe(6)
    expect(spec.grid.zoom).toBe(12)
    expect(Math.round(spec.grid.cellMeters)).toBe(201)
  })
})
