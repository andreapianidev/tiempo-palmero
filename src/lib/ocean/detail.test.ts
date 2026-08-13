/**
 * La textura de detalle.
 *
 * Lo que de verdad hay que comprobar es que CIERRA: una textura de agua que no
 * se repite sin costura deja una rejilla de líneas visibles sobre todo el mar,
 * y es el defecto que más delata un océano falso. Se comprueba comparando el
 * borde con lo que habría al otro lado del mosaico.
 */

import { describe, expect, it } from 'vitest'
import { DETAIL_MAX_SLOPE, buildDetailTexture } from './detail'

const tex = buildDetailTexture(64, 16, 42)
const at = (x: number, y: number) => tex.pixels.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)

describe('textura de detalle', () => {
  it('se repite sin costura por los cuatro lados', () => {
    // El texel 0 y el 64 son el mismo punto del mosaico: la diferencia entre el
    // borde izquierdo y el derecho tiene que ser la de un paso de texel, no un
    // salto. Se compara contra la variación interna típica.
    let seamX = 0
    let seamY = 0
    let inner = 0
    for (let i = 0; i < 64; i++) {
      seamX += Math.abs(at(63, i)[0] - at(0, i)[0])
      seamY += Math.abs(at(i, 63)[1] - at(i, 0)[1])
      inner += Math.abs(at(31, i)[0] - at(32, i)[0])
    }
    // El borde no puede saltar más de lo que salta cualquier pareja de texeles
    // vecinos de dentro. Con un vector de onda no entero, esto se dispara.
    expect(seamX / 64).toBeLessThanOrEqual(Math.max(2, (2 * inner) / 64))
    expect(seamY / 64).toBeLessThanOrEqual(Math.max(2, (2 * inner) / 64))
  })

  it('es la misma textura en cada ejecución', () => {
    const again = buildDetailTexture(64, 16, 42)
    expect(again.pixels).toEqual(tex.pixels)
  })

  it('sale con la pendiente cuadrática media que se le pide', () => {
    // 0,12 es el objetivo: un mar rizado. Un 30 % de holgura, porque el
    // redondeo de los vectores de onda a entero mueve el resultado.
    expect(tex.rmsSlope).toBeGreaterThan(0.08)
    expect(tex.rmsSlope).toBeLessThan(0.17)
  })

  it('no recorta ninguna cresta contra el techo de la codificación', () => {
    let saturated = 0
    for (let i = 0; i < tex.pixels.length; i += 4) {
      if (tex.pixels[i] === 0 || tex.pixels[i] === 255) saturated++
      if (tex.pixels[i + 1] === 0 || tex.pixels[i + 1] === 255) saturated++
    }
    expect(saturated).toBe(0)
    expect(DETAIL_MAX_SLOPE).toBeGreaterThan(0.44) // el límite de Stokes
  })

  it('la altura ocupa toda la escala de su canal', () => {
    let min = 255
    let max = 0
    for (let i = 2; i < tex.pixels.length; i += 4) {
      min = Math.min(min, tex.pixels[i])
      max = Math.max(max, tex.pixels[i])
    }
    expect(min).toBe(0)
    expect(max).toBe(255)
  })
})
