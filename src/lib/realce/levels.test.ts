import { describe, expect, it } from 'vitest'
import { BASEMAP_LEVELS, levelsToRaster } from './levels'

/**
 * El shader raster de MapLibre, copiado tal cual de `maplibre-gl` 4.7.1 para
 * poder comprobar contra él sin abrir un navegador:
 *
 *   rgb = (rgb − 0,5) · C + 0,5
 *   out = mix(brightnessMin, brightnessMax, rgb)
 *
 * con C = 1 / (1 − contrast) cuando el contraste es positivo.
 *
 * Si algún día MapLibre cambia esa aritmética, este test sigue pasando y el
 * mapa se ve mal: por eso el comentario dice de dónde salió y con qué versión.
 */
function maplibre(x: number, lv: ReturnType<typeof levelsToRaster>): number {
  const c = lv.contrast > 0 ? 1 / (1 - lv.contrast) : 1 + lv.contrast
  const y = (x - 0.5) * c + 0.5
  return lv.brightnessMin + (lv.brightnessMax - lv.brightnessMin) * y
}

describe('niveles con las propiedades de MapLibre', () => {
  it('reproducen exactamente el estirado que se pide', () => {
    for (const [black, white] of [
      [0.0392, 0.9529],
      [0.02, 0.98],
      [0.1, 0.85],
    ]) {
      const lv = levelsToRaster(black, white)
      expect(maplibre(black, lv)).toBeCloseTo(0, 6)
      expect(maplibre(white, lv)).toBeCloseTo(1, 6)
      expect(maplibre((black + white) / 2, lv)).toBeCloseTo(0.5, 6)
    }
  })

  it('y se quedan dentro de lo que la especificación admite', () => {
    for (const [black, white] of [
      [0.0392, 0.9529],
      [0.0, 0.9],
      [0.15, 1.0],
    ]) {
      const lv = levelsToRaster(black, white)
      // `raster-contrast` va de −1 a 1 y `raster-brightness-*` de 0 a 1.
      expect(lv.contrast).toBeGreaterThanOrEqual(0)
      expect(lv.contrast).toBeLessThan(1)
      expect(lv.brightnessMin).toBeGreaterThanOrEqual(-1e-9)
      expect(lv.brightnessMax).toBeLessThanOrEqual(1 + 1e-9)
      expect(lv.brightnessMin).toBeLessThan(lv.brightnessMax)
    }
  })

  it('sin estirado, no tocan nada', () => {
    const lv = levelsToRaster(0, 1)
    expect(lv.contrast).toBeCloseTo(0, 9)
    for (const x of [0, 0.25, 0.5, 0.75, 1]) expect(maplibre(x, lv)).toBeCloseTo(x, 9)
  })
})

describe('el catálogo de fondos', () => {
  it('deja la carta topográfica sin tocar', () => {
    // Medido canal a canal: su negro está en 0,004 y su blanco en 1,000, o sea
    // que ya ocupa todo el recorrido. Estirarla solo podía quitarle papel.
    const t = BASEMAP_LEVELS.topografico
    expect(t.contrast).toBe(0)
    expect(t.saturation).toBe(0)
    expect(t.brightnessMin).toBe(0)
    expect(t.brightnessMax).toBe(1)
  })

  it('a la ortofoto le quita la calima y poco más', () => {
    const s = BASEMAP_LEVELS.satelite
    expect(s.contrast).toBeGreaterThan(0)
    // Un realce que hiciera falta subir mucho sería un realce que está
    // inventando: el velo medido son cuatro centésimas de negro.
    expect(s.saturation).toBeLessThanOrEqual(0.15)
    expect(maplibre(0.0392, s)).toBeCloseTo(0, 6)
  })

  it('y el relieve no pasa por aquí, pero sí declara cómo se ve', () => {
    const r = BASEMAP_LEVELS.relieve
    expect(r.contrast).toBe(0)
    // Es el fondo más liso de los tres —lo dibuja un shader, no una cámara— y
    // eso es lo que permite que las líneas de encima no necesiten halo.
    expect(r.variation).toBeLessThan(BASEMAP_LEVELS.satelite.variation / 2)
    expect(r.variation).toBeLessThan(BASEMAP_LEVELS.topografico.variation / 2)
  })

  it('los tres dicen su luminancia, que es de lo que vive el contraste', () => {
    for (const id of ['relieve', 'topografico', 'satelite'] as const) {
      const { luma } = BASEMAP_LEVELS[id]
      expect(luma, id).toBeGreaterThan(0)
      expect(luma, id).toBeLessThan(1)
    }
    // Y el orden es el que se ve: la carta es papel, el relieve es noche.
    expect(BASEMAP_LEVELS.topografico.luma).toBeGreaterThan(BASEMAP_LEVELS.satelite.luma)
    expect(BASEMAP_LEVELS.satelite.luma).toBeGreaterThan(BASEMAP_LEVELS.relieve.luma)
  })
})
