/**
 * La oclusión de marcadores.
 *
 * El terreno de prueba es la propia isla en corte: una cresta de 2.400 m en el
 * medio, con la mar a los dos lados. Es el caso que importa —un pin de
 * Tazacorte visto desde el este, con la Cumbre en medio— y también el que
 * decide si el margen vertical está bien puesto: un pin en la ladera de la
 * cresta, mirado desde arriba, NO puede taparse a sí mismo.
 */

import { describe, expect, it } from 'vitest'
import { isOccluded } from './occlusion'

/** Cresta triangular centrada en −17,88, de 2.400 m y 8 km de ancho. */
const ridge = (lon: number): number => {
  const d = Math.abs(lon + 17.88)
  return d > 0.04 ? 0 : 2400 * (1 - d / 0.04)
}

const island = (lon: number, _lat: number): number => ridge(lon)

const camera = { lon: -17.6, lat: 28.66, altitudeM: 6000 }

describe('isOccluded', () => {
  it('la Cumbre tapa lo que hay detrás', () => {
    // Un pin en la costa oeste, con la cresta de 2.400 m en medio y la cámara
    // al este a 6 km de altura: la línea de visión pasa por debajo.
    expect(isOccluded(camera, { lon: -18.0, lat: 28.66, elevationM: 20 }, island)).toBe(true)
  })

  it('no tapa lo que está delante de ella', () => {
    expect(isOccluded(camera, { lon: -17.75, lat: 28.66, elevationM: 50 }, island)).toBe(false)
  })

  it('desde bastante más alto se ve por encima de la cresta', () => {
    const high = { ...camera, altitudeM: 30000 }
    expect(isOccluded(high, { lon: -18.0, lat: 28.66, elevationM: 20 }, island)).toBe(false)
  })

  it('un pin en la propia ladera no se tapa a sí mismo', () => {
    // A media ladera del lado de la cámara, a 1.200 m. Sin el margen vertical,
    // el propio suelo del que sale lo daría por escondido.
    expect(isOccluded(camera, { lon: -17.86, lat: 28.66, elevationM: 1200 }, island)).toBe(
      false,
    )
  })

  it('con la cámara casi encima no se pregunta nada', () => {
    const above = { lon: -17.881, lat: 28.66, altitudeM: 4000 }
    expect(isOccluded(above, { lon: -17.88, lat: 28.66, elevationM: 2400 }, island)).toBe(
      false,
    )
  })

  it('el mar abierto no tapa', () => {
    const sea = () => null
    expect(isOccluded(camera, { lon: -18.2, lat: 28.66, elevationM: 0 }, sea)).toBe(false)
  })

  it('la exageración vertical hace tapar antes', () => {
    // Un caso al límite: con la vertical sin estirar se ve, y con 1,5× la misma
    // cresta ya corta la visión. Es exactamente lo que pasa en pantalla, y por
    // eso la exageración tiene que entrar en la cuenta.
    const target = { lon: -18.0, lat: 28.66, elevationM: 20 }
    const shallow = { lon: -17.6, lat: 28.66, altitudeM: 10000 }
    expect(isOccluded(shallow, target, island, 1)).toBe(false)
    expect(isOccluded(shallow, target, island, 1.5)).toBe(true)
  })
})
