/**
 * La rama lunar del modelo, contra una lunación entera.
 *
 * VA APARTE DE `skyglow.test.ts` porque el fixture es otro y la pregunta es
 * otra. Aquel comprueba que el modelo acierta la noche cerrada y el crepúsculo
 * sobre dos noches de una sola fase; éste comprueba la única cosa que dos
 * noches no pueden decir: **si el error del término lunar depende de la fase**.
 *
 * POR QUÉ ESA PREGUNTA Y NO OTRA. Un error constante en magnitudes se corrige
 * con una resta y no rompe nada. Un error que crece con la fase significa que la
 * curva está mal escalada, y ahí una resta empeora la mitad de las noches. Con
 * la luna siempre en cuarto las dos hipótesis dan lo mismo. Con las fases del
 * 9 % al 100 %, no: el sesgo iba de 0,15 en el creciente fino a 1,12 en la
 * llena, y eso fue lo que decidió que la corrección fuera un factor sobre el
 * flujo y no un desplazamiento.
 *
 * EL FIXTURE. `sqm-luna.json` sale de `scripts/checks/luna-sesgo.ts`: 1089
 * lecturas —hasta 150 por banda de fase, más 201 sin luna de control—
 * repartidas por estación y por noche sobre las 63 713 de noche cerrada de la
 * lunación del 21 de julio al 19 de agosto de 2026, en 13 estaciones.
 *
 * Cada fila trae el cielo oscuro de SU estación ya calculado sobre el archivo
 * entero. No es comodidad: la mediana de 1089 filas elegidas no es la mediana
 * de 63 713, y recalcularla aquí haría que la prueba midiera el muestreo en vez
 * del modelo. Se vio al escribirla — con el control mal muestreado, el sesgo
 * sin luna salía de 0,99 mag en vez de 0,03.
 */

import { describe, expect, it } from 'vitest'
import fixture from '../__fixtures__/sqm-luna.json'
import { magArcsec2, modelledSkyGlow, nanoLamberts, MOON_SCATTER_FACTOR } from './skyglow'
import { extinctionCoefficient } from './visibility'

interface Row {
  station: string
  site: string
  elevationM: number
  darkSky: number
  sqm: number
  sunElevationDeg: number
  moonElevationDeg: number
  moonIllumination: number
  moonZenithSeparationDeg: number
}

const rows = fixture as Row[]

/**
 * El modelo con un factor arbitrario sobre el flujo lunar, para poder preguntar
 * qué pasaría con otro. Con `MOON_SCATTER_FACTOR` devuelve exactamente lo que
 * devuelve la aplicación.
 */
function model(r: Row, factor = MOON_SCATTER_FACTOR): number {
  const common = {
    sunElevationDeg: r.sunElevationDeg,
    moonSeparationDeg: r.moonZenithSeparationDeg,
    skyElevationDeg: 90,
    darkSky: r.darkSky,
    extinctionK: extinctionCoefficient(r.elevationM),
  }
  const withMoon = modelledSkyGlow({
    ...common,
    moon:
      r.moonElevationDeg > 0
        ? { illumination: r.moonIllumination, elevationDeg: r.moonElevationDeg }
        : null,
  })
  if (factor === MOON_SCATTER_FACTOR) return withMoon
  const without = modelledSkyGlow({ ...common, moon: null, moonSeparationDeg: 90 })
  const moonNl = Math.max(0, nanoLamberts(withMoon) - nanoLamberts(without))
  return magArcsec2(nanoLamberts(without) + (factor / MOON_SCATTER_FACTOR) * moonNl)
}

const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

const BANDS: [number, number, string][] = [
  [0.15, 0.3, 'creciente fina'],
  [0.3, 0.5, 'antes del cuarto'],
  [0.5, 0.7, 'cuarto largo'],
  [0.7, 0.9, 'gibosa'],
  [0.9, 1.01, 'llena'],
]

const inBand = (lo: number, hi: number) =>
  rows.filter(
    (r) => r.moonElevationDeg > 10 && r.moonIllumination >= lo && r.moonIllumination < hi,
  )

const bias = (set: Row[], factor?: number) => median(set.map((r) => model(r, factor) - r.sqm))

describe('el fixture cubre la lunación', () => {
  it('trae todas las fases y bastantes lecturas de cada una', () => {
    for (const [lo, hi, name] of BANDS) {
      expect(inBand(lo, hi).length, name).toBeGreaterThan(80)
    }
    // Y el control sin luna, que es lo que separa un fallo del término lunar de
    // un desplazamiento de todo el modelo.
    expect(rows.filter((r) => r.moonElevationDeg < 0).length).toBeGreaterThan(100)
  })

  it('viene de varias estaciones y no de una noche buena', () => {
    expect(new Set(rows.map((r) => r.station)).size).toBeGreaterThanOrEqual(8)
  })
})

describe('la calibración lunar', () => {
  it('sin luna el modelo está centrado, que es el control', () => {
    const dark = rows.filter((r) => r.moonElevationDeg < 0)
    expect(Math.abs(bias(dark))).toBeLessThan(0.2)
  })

  it('con la calibración puesta, el sesgo ya no depende de la fase', () => {
    const byBand = BANDS.map(([lo, hi, name]) => ({ name, b: bias(inBand(lo, hi)) }))
    for (const { name, b } of byBand) {
      expect(Math.abs(b), `${name}: ${b.toFixed(2)}`).toBeLessThan(0.45)
    }
    // Lo que de verdad se está comprobando: que la creciente y la llena no se
    // separan. Antes había 0,97 mag entre las dos.
    const spread = Math.max(...byBand.map((x) => x.b)) - Math.min(...byBand.map((x) => x.b))
    expect(spread).toBeLessThan(0.5)
  })

  it('LA OTRA ORILLA: sin calibrar, el sesgo crece con la fase', () => {
    // El control negativo. Si alguien quita `MOON_SCATTER_FACTOR` pensando que
    // sobra, esto es lo que vuelve: 0,15 en la creciente fina y 1,12 en la
    // llena, casi un punto de diferencia según la noche que sea.
    const thin = bias(inBand(0.15, 0.3), 1)
    const full = bias(inBand(0.9, 1.01), 1)
    expect(thin).toBeLessThan(0.35)
    expect(full).toBeGreaterThan(0.9)
    expect(full - thin).toBeGreaterThan(0.7)
  })

  it('y pasarse tampoco vale: con ×5 se invierte', () => {
    // La orilla de arriba. El error no es monótono en el factor: se puede
    // pasar, y pasarse pone la luna llena más clara de lo que ninguna estación
    // ha medido.
    expect(bias(inBand(0.9, 1.01), 5)).toBeLessThan(-0.2)
  })

  it('el error absoluto medio se parte por la mitad', () => {
    const moonlit = rows.filter((r) => r.moonElevationDeg > 10)
    const mae = (factor?: number) =>
      moonlit.map((r) => Math.abs(model(r, factor) - r.sqm)).reduce((a, b) => a + b, 0) /
      moonlit.length
    expect(mae()).toBeLessThan(mae(1) * 0.7)
  })
})

describe('lo que el modelo dice de una luna llena en esta isla', () => {
  it('coincide con lo que la red mide, no con lo que publica el manual', () => {
    // 987 lecturas con la luna llena por encima de 40° en los seis sitios
    // oscuros dan 16,18-17,26, mediana 16,62. La bibliografía para «sitio
    // oscuro con luna llena» dice 17,5-18,5, y con ese número se descartó esta
    // calibración durante dos meses. El cielo de La Palma con luna llena es más
    // de una magnitud más claro, casi seguro por el polvo sahariano.
    const full = rows.filter((r) => r.moonIllumination > 0.95 && r.moonElevationDeg > 40)
    expect(full.length).toBeGreaterThan(20)
    const measured = median(full.map((r) => r.sqm))
    const modelled = median(full.map((r) => model(r)))
    expect(measured).toBeGreaterThan(15.5)
    expect(measured).toBeLessThan(17.5)
    expect(Math.abs(modelled - measured)).toBeLessThan(0.5)
  })
})
