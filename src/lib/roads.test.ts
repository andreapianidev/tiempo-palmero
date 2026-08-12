import { describe, expect, it } from 'vitest'
import { ownerOf, readRoad } from './roads'

describe('titularidad de un tramo', () => {
  it('un código LP-n es una vía insular', () => {
    expect(ownerOf('LP-1')).toBe('insular')
    expect(ownerOf('LP-108')).toBe('insular')
    expect(ownerOf('LP-213')).toBe('insular')
  })

  it('lo que no es un código es el titular, dicho por la propia fuente', () => {
    expect(ownerOf('Municipal')).toBe('Municipal')
    expect(ownerOf('Parque Nacional')).toBe('Parque Nacional')
    // Sin la «o». Es la errata del origen y se enseña tal cual: corregirla
    // aquí escondería que el dato publicado la tiene.
    expect(ownerOf('Aerpuerto')).toBe('Aerpuerto')
  })

  it('sin nomenclatura no se inventa un titular', () => {
    expect(ownerOf(undefined)).toBeNull()
  })
})

describe('ficha de un tramo', () => {
  it('lee un tramo insular entero', () => {
    const r = readRoad({
      nomenclatura: 'LP-108',
      denominacion: 'GALLEGOS EL BARRIO',
      recorrido: 'LP-1; PK=41,200 a Gallegos',
      color_cartografico: 'VERDE',
      longitud_oficial_m: 940,
      longitud_gis_m: 950,
    })
    expect(r).toEqual({
      code: 'LP-108',
      name: 'GALLEGOS EL BARRIO',
      route: 'LP-1; PK=41,200 a Gallegos',
      owner: 'insular',
      officialM: 940,
      gisM: 950,
      cartoColor: 'VERDE',
    })
  })

  it('un tramo municipal no finge tener código de vía', () => {
    const r = readRoad({
      nomenclatura: 'Municipal',
      denominacion: 'CARRETERA MUNICIPAL',
      recorrido: 'De LP-1 a El Tablado',
      longitud_oficial_m: 6285,
    })
    expect(r.code).toBeNull()
    expect(r.owner).toBe('Municipal')
    expect(r.name).toBe('CARRETERA MUNICIPAL')
    expect(r.gisM).toBeNull()
  })

  it('sin denominación se cae al código antes que a un guion', () => {
    expect(readRoad({ nomenclatura: 'LP-4' }).name).toBe('LP-4')
    expect(readRoad({}).name).toBe('—')
  })
})
