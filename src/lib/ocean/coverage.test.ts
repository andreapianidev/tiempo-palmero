/**
 * Dónde acaba el agua.
 *
 * La prueba no evalúa la fórmula con números redondos escritos a mano: monta un
 * transecto de costa con la MISMA malla que la real —34,2 × 54,3 m por texel—,
 * lo empaqueta con `packShoreline` y lo lee interpolando entre texeles, que es
 * exactamente lo que hace la GPU con el filtro lineal. Sin ese paso, la
 * cuantificación y la interpolación —que es de donde salía el fallo— no
 * aparecen por ningún lado.
 *
 * LAS DOS ORILLAS PESAN IGUAL. Un ajuste que devuelva el mar a la costa pero
 * deje el agua trepando por un acantilado de 60 m no vale, y uno que respete el
 * acantilado secando la bahía de al lado, tampoco. Cada caso de aquí comprueba
 * uno de los dos lados.
 */

import { describe, expect, it } from 'vitest'
import { waterCoverage, runupM } from './coverage'
import {
  SHORE_MAX_ELEVATION_M,
  decodeShoreDistance,
  packShoreline,
  signedShoreDistance,
  type ShorelineGrid,
} from './shoreline'

const W = 64
const H = 8
/** Los metros por texel de la textura de verdad: `land-mask.ts`, 1024 sobre el recuadro insular. */
const grid: ShorelineGrid = { width: W, height: H, metersX: 34.2, metersY: 54.3 }

/**
 * Una costa recta: mar a la izquierda, tierra a partir del texel 32, o sea la
 * orilla en x = 31,5. La cota va ENMASCARADA POR TIERRA, como la deja
 * `buildShorelineMap`: en el mar es cero aunque el DEM, que es cuatro veces más
 * basto, diga otra cosa.
 */
function transect(landElevationM: number) {
  const land = new Uint8Array(W * H)
  const elevation = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 32; x < W; x++) {
      land[y * W + x] = 1
      elevation[y * W + x] = landElevationM
    }
  }
  const packed = packShoreline(signedShoreDistance(land, grid), elevation, grid)

  /** Lee la textura donde lo haría la GPU: interpolando entre texeles. */
  return (metersFromShore: number) => {
    // Positivo mar adentro. La orilla cae en el borde entre los texeles 31 y 32.
    const xTexel = 31.5 - metersFromShore / grid.metersX
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(xTexel)))
    const x1 = Math.max(0, Math.min(W - 1, x0 + 1))
    const t = Math.max(0, Math.min(1, xTexel - x0))
    const row = 4
    const read = (channel: number) => {
      const a = packed[(row * W + x0) * 4 + channel]
      const b = packed[(row * W + x1) * 4 + channel]
      return a + (b - a) * t
    }
    return {
      shoreDistM: decodeShoreDistance(read(0)),
      landHeightM: (read(1) / 255) * SHORE_MAX_ELEVATION_M,
    }
  }
}

/** Una pared de 60 m, que es la costa oeste de La Palma casi entera. */
const cliff = transect(60)
/** Una playa: dos metros de rampa, como el Puerto de Tazacorte. */
const beach = transect(2)

/** Mar de fondo de 0,9 m, el que había el 14 de agosto de 2026 a las 01:00. */
const CALM = { waveHeightM: 0.9, crest: 0, metersPerPixel: 1.5 }
/** Y un temporal de 6 m con la cresta encima, que es cuando el agua sube. */
const STORM = { waveHeightM: 6, crest: 1, metersPerPixel: 1.5 }

describe('el mar llega hasta la costa', () => {
  it('cubre el agua pegada a un acantilado', () => {
    // ESTE ES EL FALLO QUE SE ARREGLÓ. Con la corrección del acantilado aplicada
    // también mar adentro, la cota interpolada frente a la pared valía 12,45 m a
    // diez metros de la orilla —seis veces el umbral de 2,1 m— y aquí salía 0:
    // una franja seca de 9 m como mínimo, y de 43 m cuando el DEM dejaba cota
    // en el primer texel de mar. En pantalla, a 1,5 m/px, eran de 6 a 28 px de
    // mar que no llegaba a la costa. Ahora, con la misma cota de 12,45 m: 1.
    for (const m of [8, 10, 20, 40]) {
      expect(waterCoverage({ ...cliff(m), ...CALM })).toBeGreaterThan(0.99)
    }
    // Los últimos metros son una rampa y no un escalón, y no por gusto: la
    // distancia se guarda por raíz cuadrada, así que interpolar entre dos
    // texeles de 34 m devuelve 1,39 m donde de verdad hay 5. El borde del agua
    // queda medio texel mar adentro y difuminado sobre unos metros, que es
    // justo lo que se quiere ver en una orilla.
    expect(waterCoverage({ ...cliff(5), ...CALM })).toBeGreaterThan(0.7)
  })

  it('también con la ola en el seno, que es cuando el agua se retira', () => {
    const trough = { ...CALM, crest: -1 }
    expect(waterCoverage({ ...cliff(10), ...trough })).toBeGreaterThan(0.99)
  })

  it('y en mar abierto no hay nada que decidir', () => {
    expect(waterCoverage({ ...cliff(500), ...CALM })).toBe(1)
    expect(waterCoverage({ ...beach(500), ...STORM })).toBe(1)
  })
})

describe('el agua no trepa por donde no puede', () => {
  it('rebota contra el acantilado en vez de subir', () => {
    // El temporal empuja 7,8 m tierra adentro; contra la pared, ni uno.
    expect(runupM(STORM.waveHeightM)).toBeCloseTo(7.8, 6)
    for (const m of [-2, -5, -10]) {
      expect(waterCoverage({ ...cliff(m), ...STORM })).toBeLessThan(0.001)
    }
  })

  it('pero sí sube por la playa', () => {
    // La misma ola, la misma distancia, y aquí el agua entra: es la diferencia
    // que el mapa tiene que enseñar entre Tazacorte y los acantilados de arriba.
    expect(waterCoverage({ ...beach(-5), ...STORM })).toBeGreaterThan(0.9)
  })

  it('y en calma no moja la playa más allá de un palmo', () => {
    // Run-up de 1,17 m, y sin cresta no hay empuje: el agua se queda en la orilla.
    expect(waterCoverage({ ...beach(-2), ...CALM })).toBeLessThan(0.001)
  })

  it('la tierra adentro está seca pase lo que pase', () => {
    expect(waterCoverage({ ...beach(-200), ...STORM })).toBe(0)
    expect(waterCoverage({ ...cliff(-200), ...STORM })).toBe(0)
  })
})
