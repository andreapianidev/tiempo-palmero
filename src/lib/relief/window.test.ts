import { describe, expect, it } from 'vitest'
import type { DemManifest } from '../dem'
import { APRON } from './mosaic'
import { OVERZOOM, reliefWindow } from './window'

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
  generated: '',
}

const MARGIN = APRON * DEM.tileSize

describe('qué trozo del modelo le toca a cada tesela', () => {
  it('en el zoom del modelo, la tesela entera', () => {
    const w = reliefWindow(DEM, 12, 1845, 1707)!
    expect(w).toEqual({
      demZoom: 12,
      demX: 1845,
      demY: 1707,
      originX: MARGIN,
      originY: MARGIN,
      side: 256,
    })
  })

  it('por debajo, también la tesela entera de ese zoom', () => {
    const w = reliefWindow(DEM, 10, 461, 426)!
    expect(w.demZoom).toBe(10)
    expect(w.demX).toBe(461)
    expect(w.side).toBe(256)
  })

  /**
   * Aquí es donde esto se gana el sitio: en vez de dejar que MapLibre amplíe la
   * imagen del sombreado, se vuelve a dibujar leyendo el cuarto que toca de la
   * tesela del modelo. Las cuatro hijas tienen que repartirse la madre sin
   * solaparse y sin dejar hueco.
   */
  it('un nivel por encima, cada hija coge su cuarto', () => {
    const quarters = [
      [3690, 3414, MARGIN, MARGIN],
      [3691, 3414, MARGIN + 128, MARGIN],
      [3690, 3415, MARGIN, MARGIN + 128],
      [3691, 3415, MARGIN + 128, MARGIN + 128],
    ]
    for (const [x, y, ox, oy] of quarters) {
      const w = reliefWindow(DEM, 13, x, y)!
      expect(w.demZoom, `${x}/${y}`).toBe(12)
      expect(w.demX, `${x}/${y}`).toBe(1845)
      expect(w.demY, `${x}/${y}`).toBe(1707)
      expect(w.side, `${x}/${y}`).toBe(128)
      expect([w.originX, w.originY], `${x}/${y}`).toEqual([ox, oy])
    }
  })

  it('dos niveles por encima, su dieciseisavo', () => {
    const w = reliefWindow(DEM, 14, 7383, 6829)!
    expect(w.demZoom).toBe(12)
    expect(w.demX).toBe(1845)
    expect(w.demY).toBe(1707)
    expect(w.side).toBe(64)
    expect(w.originX).toBe(MARGIN + 3 * 64)
    expect(w.originY).toBe(MARGIN + 1 * 64)
  })

  it('y más allá no se dibuja: ahí ya no se estaría enseñando lo que se midió', () => {
    expect(reliefWindow(DEM, DEM.zoom + OVERZOOM + 1, 0, 0)).toBeNull()
    expect(reliefWindow(DEM, DEM.minZoom - 1, 0, 0)).toBeNull()
  })

  it('la ventana nunca se sale del mosaico', () => {
    const mosaic = DEM.tileSize * (1 + 2 * APRON)
    for (const z of [9, 10, 11, 12, 13, 14]) {
      const scale = 2 ** Math.max(0, z - DEM.zoom)
      for (const [x, y] of [
        [1845 * scale, 1707 * scale],
        [1845 * scale + scale - 1, 1707 * scale + scale - 1],
      ]) {
        const w = reliefWindow(DEM, z, x, y)!
        expect(w.originX + w.side, `z${z}`).toBeLessThanOrEqual(mosaic - MARGIN)
        expect(w.originY + w.side, `z${z}`).toBeLessThanOrEqual(mosaic - MARGIN)
        expect(w.originX, `z${z}`).toBeGreaterThanOrEqual(MARGIN)
      }
    }
  })
})
