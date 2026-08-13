import { describe, expect, it } from 'vitest'
import type { DemManifest } from '../dem'
import { coverageBounds, hasTile, metersPerPixel, tileRange } from './coverage'

/** El manifiesto de verdad, el que genera `prepare-data`. */
const DEM: DemManifest = {
  zoom: 12,
  minZoom: 9,
  tileSize: 256,
  x0: 1841,
  y0: 1703,
  cols: 7,
  rows: 9,
  metersPerPixel: 33.54,
  encoding: 'terrarium',
  attribution: '',
  generated: '2026-08-13T13:13:14.187Z',
}

describe('cobertura del modelo', () => {
  it('en su propio zoom es el rectángulo del manifiesto', () => {
    expect(tileRange(DEM, 12)).toEqual({ x0: 1841, y0: 1703, x1: 1847, y1: 1711 })
  })

  it('y en los de arriba, el que las contiene', () => {
    // 1841 / 2 = 920,5 → 920; 1847 / 2 = 923,5 → 923.
    expect(tileRange(DEM, 11)).toEqual({ x0: 920, y0: 851, x1: 923, y1: 855 })
    expect(tileRange(DEM, 9)).toEqual({ x0: 230, y0: 212, x1: 230, y1: 213 })
  })

  it('fuera de los zooms que existen, nada', () => {
    expect(tileRange(DEM, 8)).toBeNull()
    expect(tileRange(DEM, 13)).toBeNull()
  })

  /**
   * Esto no es cosmética. Una tesela que no existe es un 404 en producción y,
   * en desarrollo, el `index.html` que devuelve Vite: el decodificador de
   * imágenes lo rechaza y la consola se llena de errores rojos.
   */
  it('las esquinas están dentro y sus vecinas fuera', () => {
    expect(hasTile(DEM, 12, 1841, 1703)).toBe(true)
    expect(hasTile(DEM, 12, 1847, 1711)).toBe(true)
    expect(hasTile(DEM, 12, 1840, 1703)).toBe(false)
    expect(hasTile(DEM, 12, 1848, 1711)).toBe(false)
    expect(hasTile(DEM, 12, 1841, 1712)).toBe(false)
  })

  it('el recuadro en grados cubre la isla entera', () => {
    const [w, s, e, n] = coverageBounds(DEM)
    // El límite insular publicado va de −18,008 a −17,724 y de 28,453 a 28,858.
    expect(w).toBeLessThanOrEqual(-18.008)
    expect(e).toBeGreaterThanOrEqual(-17.724)
    expect(s).toBeLessThanOrEqual(28.453)
    expect(n).toBeGreaterThanOrEqual(28.858)
  })
})

describe('metros por píxel', () => {
  /**
   * La comprobación que importa: esta cuenta tiene que dar EXACTAMENTE la que
   * escribió `prepare-data` en el manifiesto. Si las dos se separan, el
   * sombreado calcula pendientes con una escala y el motor las cotas con otra,
   * y nadie se entera hasta que una ladera sale mal dibujada.
   */
  it('coinciden con lo que declara el manifiesto', () => {
    const middle = DEM.y0 + (DEM.rows - 1) / 2
    expect(metersPerPixel(DEM.zoom, middle, DEM.tileSize)).toBeCloseTo(DEM.metersPerPixel, 2)
  })

  it('encogen a la mitad al subir de zoom', () => {
    // No sale exacto y no puede salir: cada uno se mide en el centro de SU
    // tesela, y el centro de la hija no cae en el centro de la madre. La
    // diferencia son dos diezmilésimas, o sea 3 mm por píxel de 16,77 m.
    const a = metersPerPixel(12, 1707, 256)
    const b = metersPerPixel(13, 3415, 256)
    expect(b / (a / 2)).toBeCloseTo(1, 3)
  })

  it('y en el ecuador valen más que en La Palma', () => {
    // Mercator estira lo que está lejos del ecuador: sin esta corrección la
    // pendiente saldría un 14 % equivocada en esta latitud.
    const equator = metersPerPixel(12, 2048, 256)
    const palma = metersPerPixel(12, 1707, 256)
    expect(equator).toBeGreaterThan(palma)
    expect(equator / palma).toBeCloseTo(1 / Math.cos((28.66 * Math.PI) / 180), 2)
  })
})
