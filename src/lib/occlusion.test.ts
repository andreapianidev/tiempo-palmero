import { describe, expect, it } from 'vitest'
import { emptyDem, type Dem, type DemManifest } from './dem'
import {
  CLEARANCE_MARGIN_M,
  hiddenByRelief,
  reliefAboveSight,
  SAMPLE_STEP_M,
} from './occlusion'
import { lonToPixelX, latToPixelY } from './geo'

/**
 * Un relieve de laboratorio, no la isla.
 *
 * La calibración contra la isla de verdad ya está hecha y no cabe en una prueba
 * unitaria: son 1.843 puntos comparados con el veredicto del propio MapLibre
 * sobre la escena dibujada, y vive en `scripts/checks/occlusion-margin.ts`. Lo
 * que se comprueba aquí es lo otro: que la geometría del rayo esté bien, que la
 * exageración vertical se aplique donde toca, y —sobre todo— **que un punto que
 * se ve no se esconda**, que es el error caro.
 */
const MANIFEST: DemManifest = {
  zoom: 12,
  minZoom: 12,
  tileSize: 256,
  x0: 1841,
  y0: 1703,
  cols: 4,
  rows: 4,
  metersPerPixel: 33.54,
  attribution: '',
  encoding: 'terrarium',
  generated: '',
}

/** Pone una altura en el píxel del DEM que le toca a estas coordenadas. */
function poke(dem: Dem, lon: number, lat: number, height: number, radiusPx = 2): void {
  const cx = Math.round(lonToPixelX(lon, MANIFEST.zoom) - dem.originX)
  const cy = Math.round(latToPixelY(lat, MANIFEST.zoom) - dem.originY)
  for (let j = -radiusPx; j <= radiusPx; j++) {
    for (let i = -radiusPx; i <= radiusPx; i++) {
      const x = cx + i
      const y = cy + j
      if (x < 0 || y < 0 || x >= dem.width || y >= dem.height) continue
      dem.heights[y * dem.width + x] = height
    }
  }
}

/** Longitud del centro de la malla, y dos puntos a su este y a su oeste. */
const LAT = 28.72
const WEST = -17.94
const MID = -17.9
const EAST = -17.86

const flat = () => {
  const dem = emptyDem(MANIFEST)
  // Toda la malla a 10 m: mar no, tierra baja. Un cero se confundiría con
  // «fuera del modelo» en las pruebas de borde.
  dem.heights.fill(10)
  return dem
}

describe('¿hay montaña delante?', () => {
  const camera = { lon: WEST, lat: LAT, altitude: 400 }
  const target = { lon: EAST, lat: LAT, elevation: 10 }

  it('sobre terreno llano el rayo pasa limpio', () => {
    const above = reliefAboveSight(flat(), camera, target)
    expect(above).not.toBeNull()
    expect(above!).toBeLessThan(0)
    expect(hiddenByRelief(flat(), camera, target)).toBe(false)
  })

  it('una cresta entre medias tapa el punto', () => {
    const dem = flat()
    poke(dem, MID, LAT, 900)
    const above = reliefAboveSight(dem, camera, target)
    // A mitad de camino la visual va por ~205 m y la cresta está a 900.
    expect(above!).toBeGreaterThan(600)
    expect(hiddenByRelief(dem, camera, target)).toBe(true)
  })

  it('la misma cresta, más baja que la visual, no tapa nada', () => {
    const dem = flat()
    poke(dem, MID, LAT, 150)
    expect(hiddenByRelief(dem, camera, target)).toBe(false)
  })

  /**
   * EL LADO QUE MÁS PESA. Una cresta que se queda justo por debajo de la línea
   * de visión no puede esconder el dato: el margen está para absorber la
   * diferencia entre dos mallas, no para tapar por si acaso.
   */
  it('no esconde un punto cuya cresta se queda dentro del margen', () => {
    const dem = flat()
    const above = reliefAboveSight(flat(), camera, target)!
    // Una cresta que asome exactamente la mitad del margen por encima del rayo.
    poke(dem, MID, LAT, 205 + CLEARANCE_MARGIN_M / 2)
    const raised = reliefAboveSight(dem, camera, target)!
    expect(raised).toBeGreaterThan(above)
    expect(raised).toBeLessThan(CLEARANCE_MARGIN_M)
    expect(hiddenByRelief(dem, camera, target)).toBe(false)
  })

  it('la exageración vertical levanta el relieve y también la oclusión', () => {
    const dem = flat()
    poke(dem, MID, LAT, 190)
    // A 1× la cresta se queda por debajo de la visual; a 1,5× la corta.
    expect(hiddenByRelief(dem, camera, target, 1)).toBe(false)
    expect(hiddenByRelief(dem, camera, target, 1.5)).toBe(true)
  })

  /**
   * El suelo del propio punto no puede taparlo. Sin recortar el último tramo
   * del rayo, un punto en una ladera se escondería a sí mismo SIEMPRE, que era
   * la forma más fácil de que desaparecieran justo las estaciones de montaña.
   */
  it('el terreno del propio punto no lo esconde', () => {
    const dem = flat()
    poke(dem, EAST, LAT, 800, 3)
    expect(hiddenByRelief(dem, camera, { ...target, elevation: 800 })).toBe(false)
  })

  it('fuera del modelo no se afirma nada, y por tanto no se esconde', () => {
    const dem = flat()
    const lejos = { lon: -16.5, lat: 28.5, elevation: 100 }
    expect(hiddenByRelief(dem, { lon: -16.6, lat: 28.5, altitude: 500 }, lejos)).toBe(false)
  })

  it('sin modelo de elevación se enseña, no se calla', () => {
    expect(hiddenByRelief(null, camera, target)).toBe(false)
  })

  it('la cámara justo encima del punto no inventa una montaña', () => {
    const dem = flat()
    expect(hiddenByRelief(dem, { lon: EAST, lat: LAT, altitude: 3000 }, target)).toBe(false)
  })

  /**
   * El paso tiene que seguir siendo más fino que el píxel del DEM. Si alguien
   * lo sube «para ir más rápido», las cuchillas de la Cumbre Nueva —crestas de
   * menos de 100 m de ancho— dejan de existir para el rayo.
   */
  it('el paso de muestreo no salta píxeles del modelo', () => {
    expect(SAMPLE_STEP_M).toBeGreaterThan(0)
    expect(SAMPLE_STEP_M).toBeLessThanOrEqual(2 * MANIFEST.metersPerPixel)
  })
})
