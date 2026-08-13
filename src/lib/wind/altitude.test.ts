import { describe, expect, it } from 'vitest'
import { MercatorCoordinate } from 'maplibre-gl'
import {
  WIND_AGL_M,
  circumferenceAtLatitude,
  mercatorZ,
  viewportHeightDeg,
  windAltitudeM,
} from './altitude'

const LA_PALMA_LAT = 28.65

describe('altura en unidades de MapLibre', () => {
  it('da exactamente lo mismo que MercatorCoordinate.fromLngLat', () => {
    // La prueba que importa: si esta cuenta se separa de la de MapLibre, las
    // partículas se dibujan a una altura que no es la del terreno y nadie ve un
    // error, solo viento flotando.
    for (const alt of [0, 60, 500, 1500, 2426]) {
      for (const lat of [28.4, 28.65, 28.9]) {
        const theirs = MercatorCoordinate.fromLngLat({ lng: -17.9, lat }, alt).z
        expect(mercatorZ(alt, lat)).toBeCloseTo(theirs, 12)
      }
    }
  })

  it('la Z crece con la latitud, porque el mundo se estrecha', () => {
    // A 60° de latitud el paralelo mide la mitad, así que el mismo metro vale
    // el doble en unidades normalizadas.
    expect(mercatorZ(1000, 60) / mercatorZ(1000, 0)).toBeCloseTo(2, 3)
  })

  it('a nivel del mar la Z es cero', () => {
    expect(mercatorZ(0, LA_PALMA_LAT)).toBe(0)
  })

  it('usa el radio medio, que es el que usa MapLibre', () => {
    // 40.030 km, no los 40.075 del ecuador: la diferencia es del 0,11 % y aquí
    // manda lo que haga MapLibre, no lo que diga un almanaque.
    expect(circumferenceAtLatitude(0)).toBeCloseTo(40_030_228.9, 0)
  })
})

describe('altura de dibujo de la estela', () => {
  it('es la cota del terreno más el margen, todo exagerado', () => {
    expect(windAltitudeM(0, 1)).toBe(WIND_AGL_M)
    expect(windAltitudeM(1000, 1)).toBe(1000 + WIND_AGL_M)
    expect(windAltitudeM(1000, 1.5)).toBe((1000 + WIND_AGL_M) * 1.5)
  })

  it('el margen se estira con la escena, no se queda plano', () => {
    // Si el margen no se exagerara, con la escena a 3× la estela quedaría
    // proporcionalmente pegada al suelo y volvería a hundirse en las crestas.
    const flat = windAltitudeM(2000, 1) - 2000 * 1
    const tall = windAltitudeM(2000, 3) - 2000 * 3
    expect(tall).toBeCloseTo(flat * 3, 6)
  })

  it('la cumbre exagerada 1,5× queda por encima de la cumbre real', () => {
    // El Roque de los Muchachos son 2.426 m; con la escena a 1,5 se dibuja a
    // 3.729, y la estela justo encima.
    expect(windAltitudeM(2426, 1.5)).toBeCloseTo(3729, 0)
  })
})

describe('cuánto abarca la ventana', () => {
  it('a zoom de isla entera da algo más de medio grado', () => {
    // La vista de llegada: z9,6 en una ventana de 900 px. El campo de viento
    // mide 0,55° de alto, y la isla llena la pantalla en esa vista.
    const deg = viewportHeightDeg(9.6, LA_PALMA_LAT, 900)
    expect(deg).toBeGreaterThan(0.4)
    expect(deg).toBeLessThan(0.8)
  })

  it('cada zoom hacia dentro es la mitad de mundo', () => {
    const a = viewportHeightDeg(10, LA_PALMA_LAT, 900)
    const b = viewportHeightDeg(11, LA_PALMA_LAT, 900)
    expect(a / b).toBeCloseTo(2, 6)
  })

  it('no depende de la inclinación porque no depende de la vista', () => {
    // Es la razón de existir de esta función: los mismos argumentos dan el
    // mismo número mire la cámara desde arriba o de lado. Lo que cambia con la
    // inclinación es `getBounds()`, y por eso ya no se usa.
    expect(viewportHeightDeg(12, LA_PALMA_LAT, 900)).toBe(
      viewportHeightDeg(12, LA_PALMA_LAT, 900),
    )
  })

  it('una ventana el doble de alta abarca el doble', () => {
    expect(viewportHeightDeg(12, LA_PALMA_LAT, 1800)).toBeCloseTo(
      viewportHeightDeg(12, LA_PALMA_LAT, 900) * 2,
      9,
    )
  })

  it('nunca devuelve cero, ni con una ventana de un píxel', () => {
    expect(viewportHeightDeg(22, LA_PALMA_LAT, 1)).toBeGreaterThan(0)
  })
})
