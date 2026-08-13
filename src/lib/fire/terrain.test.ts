/**
 * La pendiente y la orientación son la primera derivada del relieve que este
 * repositorio calcula, así que lo que se fija aquí es la aritmética: un plano
 * de inclinación conocida tiene que salir con esa inclinación y mirando a donde
 * mira, y el signo de la orientación tiene que ser el de la brújula y no el del
 * raster —que crece hacia el sur— porque equivocarlo pone las laderas de
 * solana en la umbría sin que nada más se entere.
 *
 * Las cifras de la isla real no se prueban aquí sino que se miden con
 * `scripts/checks/relief-check.ts`, igual que `MAX_SLOPE_TAN` en `terrain.ts`.
 * Medido el 13 ago 2026 sobre las 63 teselas de `public/dem/`, paso de 201 m:
 *
 *   - 17.545 celdas de tierra × 201 m ≈ **711 km²**, contra los 708 km² que
 *     mide la isla. La malla no se está comiendo la costa. Es exactamente el
 *     mismo recuento que saca el entrenamiento en Python (`scripts/ml/dem.py`),
 *     y que sean el mismo no es casualidad: las dos mitades muestrean el
 *     CENTRO de la celda. Con la esquina salían once celdas de más.
 *   - pendiente media **16,3°**, mediana 14,8°, p90 27,8°, p99 42,3°,
 *     máxima **56,8°** en 28,7342 N / 17,8916 O a 1611 m — la pared de la
 *     Caldera de Taburiente. Sobre la base de 67 m de `terrain.ts` esa misma
 *     pared da 74,6°: la pendiente depende de sobre cuánto se mida, y por eso
 *     el paso va escrito al lado de la cifra.
 *   - **ni una sola celda llana**: 0 de 17.545 por debajo de 0,1°. En esta isla
 *     la orientación existe siempre.
 *   - reparto de orientaciones: O 20,3 %, E 18,4 %, SE 12,3 %, NO 11,9 %,
 *     SO 11,3 %, NE 11,0 %, N 9,5 % y **S 5,3 %**. Es la firma de una isla que
 *     es una dorsal norte-sur: casi todo mira al este o al oeste.
 */

import { describe, expect, it } from 'vitest'
import { emptyDem, type Dem, type DemManifest } from '../dem'
import { FLAT, reliefAt, reliefAtPixel, SLOPE_STEP_PX } from './terrain'
import { pixelXToLon, pixelYToLat } from '../geo'

/** Un trozo de DEM de juguete, con el mismo zoom y la misma escala que el real. */
const MANIFEST: DemManifest = {
  zoom: 12,
  minZoom: 9,
  tileSize: 256,
  x0: 1841,
  y0: 1703,
  cols: 1,
  rows: 1,
  metersPerPixel: 33.54,
  attribution: '',
  encoding: 'terrarium',
  generated: '',
}

/** El paso en metros que usa el módulo: 6 px × 33,54 m. */
const SPACING_M = SLOPE_STEP_PX * MANIFEST.metersPerPixel

/**
 * Un plano inclinado `slopeDeg` grados que baja hacia `aspectDeg`.
 *
 * Se construye en metros de terreno y no en píxeles para que la prueba diga lo
 * mismo que dice el enunciado: «una ladera de 30° mirando al sur».
 */
function ramp(slopeDeg: number, aspectDeg: number, base = 800): Dem {
  const dem = emptyDem(MANIFEST)
  const tan = Math.tan((slopeDeg * Math.PI) / 180)
  // La ladera BAJA hacia `aspectDeg`, así que sube hacia el opuesto.
  const up = ((aspectDeg + 180) * Math.PI) / 180
  const ux = Math.sin(up) // componente este del ascenso
  const uy = Math.cos(up) // componente norte del ascenso
  for (let y = 0; y < dem.height; y++) {
    for (let x = 0; x < dem.width; x++) {
      // Medido desde el centro, no desde la esquina: una rampa de 30° referida
      // a la esquina baja 2,4 km en los 256 px de la tesela y la mitad de la
      // malla acaba bajo el mar, que es justo el caso que el módulo descarta.
      const east = (x - CENTER) * MANIFEST.metersPerPixel
      const north = -(y - CENTER) * MANIFEST.metersPerPixel // la fila crece hacia el sur
      dem.heights[y * dem.width + x] = base + tan * (east * ux + north * uy)
    }
  }
  return dem
}

const CENTER = 128

describe('pendiente', () => {
  it('un plano de 30° sale a 30°, y uno de 5° a 5°', () => {
    for (const deg of [5, 12, 30, 45]) {
      const r = reliefAtPixel(ramp(deg, 180), CENTER, CENTER)
      expect(r.slopeDeg).toBeCloseTo(deg, 4)
    }
  })

  it('una meseta no tiene pendiente ni orientación', () => {
    const dem = emptyDem(MANIFEST)
    dem.heights.fill(800)
    const r = reliefAtPixel(dem, CENTER, CENTER)
    expect(r.slopeDeg).toBe(0)
    expect(r.aspectDeg).toBeNull()
    expect(r.southness).toBe(0)
    expect(r.westness).toBe(0)
  })

  it('se mide sobre el paso de la malla, no entre píxeles contiguos', () => {
    // Un escalón de 20 m en un solo píxel: con base de 33,5 m sería una pared
    // de 30,8°; con la base de 201 m que usa la malla es una rampa de 5,7°. La
    // diferencia no es un matiz, es lo que separa el ruido de cuantización del
    // DEM de una ladera de verdad.
    const dem = emptyDem(MANIFEST)
    for (let y = 0; y < dem.height; y++) {
      for (let x = 0; x < dem.width; x++) {
        dem.heights[y * dem.width + x] = 500 + (x >= CENTER ? 20 : 0)
      }
    }
    const fine = reliefAtPixel(dem, CENTER, CENTER, 1)
    const coarse = reliefAtPixel(dem, CENTER, CENTER, SLOPE_STEP_PX)
    expect(fine.slopeDeg).toBeGreaterThan(coarse.slopeDeg * 3)
    expect(coarse.slopeDeg).toBeLessThan(6)
  })
})

describe('orientación', () => {
  it('la ladera mira hacia donde el terreno BAJA', () => {
    for (const aspect of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const r = reliefAtPixel(ramp(20, aspect), CENTER, CENTER)
      expect(r.aspectDeg).not.toBeNull()
      // Diferencia angular con envolvente, que 359 y 1 distan 2°, no 358.
      const diff = Math.abs(((r.aspectDeg! - aspect + 540) % 360) - 180)
      expect(diff).toBeLessThan(0.5)
    }
  })

  it('una solana da +1 de sur y una umbría −1', () => {
    expect(reliefAtPixel(ramp(20, 180), CENTER, CENTER).southness).toBeCloseTo(1, 3)
    expect(reliefAtPixel(ramp(20, 0), CENTER, CENTER).southness).toBeCloseTo(-1, 3)
    expect(reliefAtPixel(ramp(20, 90), CENTER, CENTER).southness).toBeCloseTo(0, 3)
  })

  it('el oeste es positivo y el este negativo, que es donde se pone el sol', () => {
    expect(reliefAtPixel(ramp(20, 270), CENTER, CENTER).westness).toBeCloseTo(1, 3)
    expect(reliefAtPixel(ramp(20, 90), CENTER, CENTER).westness).toBeCloseTo(-1, 3)
  })

  it('una ladera al sureste queda entre las dos, sin llegar a ninguna', () => {
    const r = reliefAtPixel(ramp(20, 135), CENTER, CENTER)
    expect(r.southness).toBeCloseTo(Math.SQRT1_2, 3)
    expect(r.westness).toBeCloseTo(-Math.SQRT1_2, 3)
  })
})

describe('bordes', () => {
  it('el mar no es una ladera', () => {
    const dem = emptyDem(MANIFEST) // todo a 0 m, o sea mar
    expect(reliefAtPixel(dem, CENTER, CENTER)).toEqual(FLAT)
  })

  it('en la costa la pendiente se mide contra el lado que existe, no contra el mar', () => {
    // Media malla a 0 m (mar) y media subiendo: si el vecino de mar entrase en
    // la cuenta como cota 0, cualquier costa saldría como un acantilado de la
    // altura del pueblo que tiene detrás.
    const dem = emptyDem(MANIFEST)
    for (let y = 0; y < dem.height; y++) {
      for (let x = 0; x < dem.width; x++) {
        dem.heights[y * dem.width + x] = x < CENTER ? 0 : 300
      }
    }
    const r = reliefAtPixel(dem, CENTER + SLOPE_STEP_PX, CENTER)
    expect(r.slopeDeg).toBe(0) // meseta de 300 m: el mar de al lado no la inclina
  })

  it('fuera del DEM no se inventa relieve', () => {
    const dem = ramp(20, 180)
    expect(reliefAtPixel(dem, -50, -50)).toEqual(FLAT)
    expect(reliefAtPixel(dem, dem.width + 10, 10)).toEqual(FLAT)
  })

  it('por grados y por píxel se llega al mismo sitio', () => {
    const dem = ramp(25, 225)
    const lon = pixelXToLon(dem.originX + CENTER, MANIFEST.zoom)
    const lat = pixelYToLat(dem.originY + CENTER, MANIFEST.zoom)
    const a = reliefAt(dem, lon, lat)
    const b = reliefAtPixel(dem, CENTER, CENTER)
    expect(a.slopeDeg).toBeCloseTo(b.slopeDeg, 6)
    expect(a.aspectDeg!).toBeCloseTo(b.aspectDeg!, 6)
  })
})

describe('la escala del paso', () => {
  it('el paso por defecto es el mismo que el de la malla del mapa', () => {
    // Si `rasterizeGrid` cambia de paso y esto no, la pendiente de una celda
    // pasaría a ser la de un retículo distinto que casi coincide — el peor tipo
    // de fallo, porque el mapa seguiría teniendo buena pinta.
    expect(SLOPE_STEP_PX).toBe(6)
    expect(Math.round(SPACING_M)).toBe(201)
  })
})
