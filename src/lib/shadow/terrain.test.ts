import { describe, expect, it } from 'vitest'
import type { Dem, DemManifest } from '../dem'
import { terrainShadow, sunHours } from './terrain'

const MPP = 30

function flatDem(width: number, height: number): Dem {
  const manifest: DemManifest = {
    zoom: 12,
    minZoom: 9,
    tileSize: 256,
    x0: 0,
    y0: 0,
    cols: 1,
    rows: 1,
    metersPerPixel: MPP,
    attribution: '',
    encoding: 'terrarium',
    generated: '',
  }
  return {
    manifest,
    heights: new Float32Array(width * height),
    width,
    height,
    originX: 0,
    originY: 0,
  }
}

/** Un muro de `h` metros en la columna `col`, sobre llano. */
function wallDem(width: number, height: number, col: number, h: number): Dem {
  const dem = flatDem(width, height)
  for (let y = 0; y < height; y++) dem.heights[y * width + col] = h
  return dem
}

const shadeAt = (m: { data: Uint8Array; width: number }, x: number, y: number) =>
  m.data[y * m.width + x]

describe('terrainShadow', () => {
  it('devuelve null con el sol bajo el horizonte', () => {
    expect(terrainShadow(flatDem(16, 16), { elevationDeg: -3, azimuthDeg: 90 })).toBeNull()
  })

  it('no ensombrece nada en terreno llano, mire el sol desde donde mire', () => {
    for (const azimuthDeg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const mask = terrainShadow(flatDem(32, 32), { elevationDeg: 10, azimuthDeg })!
      expect(Math.max(...mask.data), `acimut ${azimuthDeg}`).toBe(0)
    }
  })

  it('no ensombrece nada con el sol en la vertical', () => {
    const mask = terrainShadow(wallDem(32, 32, 16, 500), {
      elevationDeg: 89.9,
      azimuthDeg: 180,
    })!
    expect(Math.max(...mask.data)).toBe(0)
  })

  it('proyecta la sombra del muro AL OESTE cuando el sol sale por el este', () => {
    // Sol al este (90°) y a 45°: un muro de 300 m proyecta 300 m, o sea 10
    // celdas de 30 m, hacia el oeste.
    const dem = wallDem(64, 8, 32, 300)
    const mask = terrainShadow(dem, { elevationDeg: 45, azimuthDeg: 90 })!

    // La cara de levante, la que ve el sol, sigue a plena luz. Este es el lado
    // que importa: una sombra que ensombrece lo iluminado no vale nada.
    expect(shadeAt(mask, 33, 4)).toBe(0)
    expect(shadeAt(mask, 40, 4)).toBe(0)

    // Justo detrás, sombra cerrada.
    expect(shadeAt(mask, 31, 4)).toBe(255)
    expect(shadeAt(mask, 25, 4)).toBe(255)

    // Y a diez celdas ya no llega: el muro mide 300 m y el sol está a 45°.
    expect(shadeAt(mask, 21, 4)).toBe(0)
  })

  it('la sombra se va al lado contrario cuando el sol se pone por el oeste', () => {
    const dem = wallDem(64, 8, 32, 300)
    const mask = terrainShadow(dem, { elevationDeg: 45, azimuthDeg: 270 })!
    expect(shadeAt(mask, 33, 4)).toBe(255)
    expect(shadeAt(mask, 31, 4)).toBe(0)
  })

  it('la sombra se alarga al bajar el sol, con la longitud que dice la trigonometría', () => {
    const dem = wallDem(128, 8, 64, 300)
    for (const [elevationDeg, expectedCells] of [
      [45, 300 / MPP],
      [30, 300 / Math.tan(30 * (Math.PI / 180)) / MPP],
      [15, 300 / Math.tan(15 * (Math.PI / 180)) / MPP],
    ] as const) {
      const mask = terrainShadow(dem, { elevationDeg, azimuthDeg: 90 })!
      // Última celda a la sombra, contando hacia el oeste desde el muro.
      let last = 64
      for (let x = 63; x >= 0; x--) {
        if (shadeAt(mask, x, 4) === 0) break
        last = x
      }
      const measured = 64 - last
      expect(Math.abs(measured - expectedCells), `elevación ${elevationDeg}°`).toBeLessThan(1.5)
    }
  })

  it('el borde de la sombra ocupa una celda, ni más ni menos', () => {
    // Con el sol a 45° y un muro de 315 m, el borde cae a 10,5 celdas: la celda
    // 10 tiene que salir a medias, no de golpe.
    const dem = wallDem(64, 8, 32, 315)
    const mask = terrainShadow(dem, { elevationDeg: 45, azimuthDeg: 90 })!
    const partial = shadeAt(mask, 22, 4)
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(255)
  })

  it('sigue al sol sin saltos: un grado de acimut no cambia media isla', () => {
    // La continuidad importa porque la capa se recalcula mientras el reloj
    // avanza: un salto se vería como un parpadeo de toda la escena.
    const dem = wallDem(64, 64, 32, 300)
    let prev: Uint8Array | null = null
    for (let azimuthDeg = 80; azimuthDeg <= 100; azimuthDeg += 1) {
      const mask = terrainShadow(dem, { elevationDeg: 30, azimuthDeg })!
      if (prev) {
        let changed = 0
        for (let i = 0; i < mask.data.length; i++) {
          if (Math.abs(mask.data[i] - prev[i]) > 64) changed++
        }
        expect(changed / mask.data.length, `acimut ${azimuthDeg}`).toBeLessThan(0.06)
      }
      prev = mask.data
    }
  })

  it('submuestrear acorta el cálculo sin mover la sombra de sitio', () => {
    const dem = wallDem(128, 32, 64, 300)
    const full = terrainShadow(dem, { elevationDeg: 45, azimuthDeg: 90 })!
    const half = terrainShadow(dem, { elevationDeg: 45, azimuthDeg: 90 }, { step: 2 })!
    expect(half.width).toBe(64)
    expect(half.metersPerCell).toBe(MPP * 2)
    // El mismo punto de terreno, leído en las dos mallas.
    for (const x of [56, 60, 62]) {
      expect(shadeAt(half, x, 8) > 128).toBe(shadeAt(full, x * 2, 16) > 128)
    }
  })
})

describe('sunHours', () => {
  it('cuenta las horas de sol y se las quita a lo que está tapado', () => {
    const dem = wallDem(64, 4, 32, 300)
    // Seis posiciones de una hora, todas con el sol al este y a 45°: el punto
    // tapado no ve el sol en ninguna.
    const positions = Array.from({ length: 6 }, () => ({
      elevationDeg: 45,
      azimuthDeg: 90,
    }))
    const out = sunHours(dem, positions, 60)!
    expect(out.hours[2 * 64 + 40]).toBeCloseTo(6, 5) // a la luz
    expect(out.hours[2 * 64 + 28]).toBeCloseTo(0, 5) // detrás del muro
  })

  it('devuelve null si el sol no sale en ninguna de las posiciones', () => {
    const dem = flatDem(8, 8)
    expect(sunHours(dem, [{ elevationDeg: -10, azimuthDeg: 0 }], 60)).toBeNull()
  })
})
