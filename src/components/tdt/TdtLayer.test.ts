/**
 * La capa de cobertura TDT, validada contra la especificación.
 *
 * Además de lo de siempre —`addLayer` lanza con una propiedad mal escrita y se
 * lleva por delante lo que se creara después—, aquí hay dos cosas que sólo se
 * ven cuando ya están mal en pantalla: el orden de las cuatro esquinas de una
 * fuente `image` (invertirlas voltea la isla) y el remuestreo.
 */

import { describe, it, expect } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { TDT_LAYER, TDT_LAYER_SPEC, TDT_OPACITY, tdtCoordinates } from './TdtLayer'
import { ISLAND_BBOX } from '../../lib/geo'
import { TDT_TIER_ALPHA } from '../../lib/tdt/mask'

describe('capa de cobertura TDT', () => {
  it('es válida para MapLibre', () => {
    const errors = validateStyleMin({
      version: 8,
      sources: {
        tdt: { type: 'image', url: '/layers/tdt-cobertura.png', coordinates: tdtCoordinates() },
      },
      layers: [TDT_LAYER_SPEC],
    } as never)
    expect(errors.map((e) => `${e.line ?? ''} ${e.message}`)).toEqual([])
  })

  it('nace apagada', () => {
    expect(TDT_LAYER_SPEC.layout?.visibility).toBe('none')
    expect(TDT_LAYER_SPEC.id).toBe(TDT_LAYER)
  })

  it('las esquinas van en el orden de MapLibre y cubren el bbox insular', () => {
    // NO, NE, SE, SO. Con este orden cambiado la mancha sale espejada o del
    // revés, y una cobertura espejada sigue pareciendo una cobertura.
    const [nw, ne, se, sw] = tdtCoordinates()
    const { west, east, south, north } = ISLAND_BBOX
    expect(nw).toEqual([west, north])
    expect(ne).toEqual([east, north])
    expect(se).toEqual([east, south])
    expect(sw).toEqual([west, south])
  })

  it('no suaviza los bordes', () => {
    // Las celdas son de 92 m y sus bordes son sombras de radio, no un
    // degradado: interpolarlas dibujaría cobertura donde el cálculo dice que no.
    expect((TDT_LAYER_SPEC.paint as Record<string, unknown>)['raster-resampling']).toBe('nearest')
  })

  it('la opacidad deja los tres escalones distinguibles', () => {
    // El PNG trae 90, 160 y 230 de alfa; la capa multiplica. Si el resultado
    // del escalón más fuerte pasara del 60 % taparía el relieve, y si el más
    // débil bajara del 15 % no se vería que hay algo.
    const strongest = (TDT_TIER_ALPHA[3] / 255) * TDT_OPACITY
    const weakest = (TDT_TIER_ALPHA[1] / 255) * TDT_OPACITY
    expect(strongest).toBeLessThanOrEqual(0.6)
    expect(weakest).toBeGreaterThanOrEqual(0.15)
    expect(strongest - weakest).toBeGreaterThan(0.2)
  })
})
