import { describe, expect, it } from 'vitest'
import { MAX_DENSITY, TILE_CSS_SIZE, tileDensity, tileRequestPixels } from './density'

/**
 * Las dos orillas de este número:
 *
 *   corto — se piden menos píxeles de los que la pantalla va a enseñar, el
 *           navegador amplía y se ve la carta lechosa de las capturas.
 *   largo — se piden más de los que caben, y eso es peso de descarga tirado a
 *           un servicio cuya licencia pide justo lo contrario.
 */
describe('densidad de las teselas de fondo', () => {
  it('una pantalla normal no paga nada', () => {
    expect(tileDensity(1)).toBe(1)
    expect(tileRequestPixels(1)).toBe(TILE_CSS_SIZE)
  })

  it('una pantalla de retina pide el doble, que es lo que va a enseñar', () => {
    expect(tileDensity(2)).toBe(2)
    expect(tileRequestPixels(2)).toBe(1024)
  })

  it('y por encima de dos no se sigue subiendo', () => {
    // Los móviles de tres no reciben 1536 px por tesela: ver `density.ts`, ahí
    // está medido lo que cuesta y lo poco que se gana.
    expect(tileDensity(3)).toBe(MAX_DENSITY)
    expect(tileDensity(4)).toBe(MAX_DENSITY)
  })

  it('las densidades intermedias redondean hacia arriba, al medio punto', () => {
    // Hacia arriba porque quedarse corto es el fallo que se está arreglando.
    expect(tileDensity(1.25)).toBe(1.5)
    expect(tileDensity(1.5)).toBe(1.5)
    expect(tileDensity(1.75)).toBe(2)
  })

  it('al medio punto y no libre, para que la caché sirva de algo', () => {
    // Con el valor crudo, un zoom del navegador al 110 % daría una URL distinta
    // para cada tesela y no se compartiría ni una con la pestaña de al lado.
    const densities = new Set([1.05, 1.1, 1.2, 1.4].map(tileDensity))
    expect(densities.size).toBe(1)
  })

  it('un valor imposible no rompe nada', () => {
    expect(tileDensity(Number.NaN)).toBe(1)
    expect(tileDensity(0)).toBe(1)
    expect(tileDensity(-2)).toBe(1)
  })
})
