import { describe, expect, it } from 'vitest'
import {
  BIAS_M,
  BIAS_STEPS,
  MAX_LEAK_M,
  biasWorld,
  leakGroundM,
  leakHeightM,
  ndcStep,
  worldPerNdc,
  type Frustum,
} from './depth'

/**
 * La cámara de MapLibre, tal y como la calcula `_calcMatrices` de
 * maplibre-gl 4.7.1: campo de visión de 36,87°, `nearZ = alto / 50` y un
 * `farZ` que sale del horizonte. Es la fuente de todos los números de
 * `depth.ts`, así que se reproduce aquí en vez de copiarse el resultado: si la
 * librería cambia de plano cercano, esto lo dice.
 */
const FOV = 0.6435011087932844

function camera(heightPx: number, pitchDeg: number, metersPerPixel: number) {
  const pitch = (pitchDeg * Math.PI) / 180
  const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b)
  const toCenter = (0.5 / Math.tan(FOV / 2)) * heightPx
  const groundAngle = Math.PI / 2 + pitch
  const above = FOV * 0.5
  const topHalfSurface =
    (Math.sin(above) * toCenter) / Math.sin(clamp(Math.PI - groundAngle - above, 0.01, Math.PI - 0.01))
  const horizonAngle = Math.atan((Math.tan(Math.PI / 2 - pitch) * toCenter * 0.85) / toCenter)
  const topHalfHorizon =
    (Math.sin(horizonAngle) * toCenter) /
    Math.sin(clamp(Math.PI - groundAngle - horizonAngle, 0.01, Math.PI - 0.01))
  const far = (Math.cos(Math.PI / 2 - pitch) * Math.min(topHalfSurface, topHalfHorizon) + toCenter) * 1.01
  return {
    near: heightPx / 50,
    far,
    metersPerUnit: metersPerPixel,
    /** Altura de la cámara sobre el plano del mar, en unidades. */
    altitude: toCenter * Math.cos(pitch),
  }
}

/** Un punto del mar visto con ese picado: a qué distancia cae y con qué seno. */
function ray(cam: ReturnType<typeof camera>, depressionDeg: number): Frustum & { sin: number } {
  const sin = Math.sin((depressionDeg * Math.PI) / 180)
  return { distance: cam.altitude / sin, near: cam.near, far: cam.far, sin }
}

/** La vista que enseña la isla entera: es donde se vio el fallo. */
const ISLA = camera(739, 68, 30)
/** Y la misma costa en primer plano, donde el mismo fallo no se veía. */
const COSTA = camera(957, 70, 1.45)

describe('el sesgo constante en NDC que había antes', () => {
  it('vale metros distintos según lo lejos que caiga el vértice', () => {
    // El `1e-4` de antes, traducido a mundo. La tabla de la cabecera de
    // `depth.ts` sale de aquí.
    const cerca = worldPerNdc(1e-4, ray(COSTA, 30)) * COSTA.metersPerUnit
    const lejos = worldPerNdc(1e-4, ray(ISLA, 12)) * ISLA.metersPerUnit
    expect(cerca).toBeCloseTo(3.6, 1)
    expect(lejos).toBeCloseTo(403.9, 0)
    // Ciento doce veces más metros por el mismo número en el búfer.
    expect(lejos / cerca).toBeGreaterThan(100)
  })

  it('subía el mar 840 m ladera arriba con la isla entera en pantalla', () => {
    const r = ray(ISLA, 12)
    const bias = worldPerNdc(1e-4, r) * ISLA.metersPerUnit
    // La plataforma costera de Tijarafe y Tazacorte: pendiente del 10 %.
    const suelo = leakGroundM(bias, r.sin, 0.1)
    expect(leakHeightM(bias, r.sin)).toBeCloseTo(84.0, 0)
    expect(suelo).toBeGreaterThan(800)
  })
})

describe('el sesgo por el rayo', () => {
  it('no deja que el mar trepe ni un píxel de la vista de isla', () => {
    // 30 m por píxel: un píxel de orilla mal puesta son 30 m de suelo.
    for (const dep of [30, 20, 15, 12, 8]) {
      const r = ray(ISLA, dep)
      const bias =
        biasWorld({ ...r, depthBits: 24, sinDepression: r.sin, metersPerUnit: ISLA.metersPerUnit }) *
        ISLA.metersPerUnit
      expect(leakGroundM(bias, r.sin, 0.1)).toBeLessThan(30)
    }
  })

  it('sobre la isla no es más que el metro: los escalones no mandan hasta pasados los 40 km', () => {
    const cerca = ray(ISLA, 30) // 24,9 km
    const bias =
      biasWorld({
        ...cerca,
        depthBits: 24,
        sinDepression: cerca.sin,
        metersPerUnit: ISLA.metersPerUnit,
      }) * ISLA.metersPerUnit
    expect(bias).toBeCloseTo(BIAS_M, 6)
  })

  it('y en el primer plano tampoco, que es donde el fallo no se veía', () => {
    const r = ray(COSTA, 20)
    const bias =
      biasWorld({ ...r, depthBits: 24, sinDepression: r.sin, metersPerUnit: COSTA.metersPerUnit }) *
      COSTA.metersPerUnit
    expect(bias).toBeCloseTo(BIAS_M, 6)
    // Y aun así es mejor que antes: 2,7 m de cota trepada contra 0,34.
    expect(leakHeightM(bias, r.sin)).toBeLessThan(0.4)
  })
})

describe('la otra orilla: que el mar siga estando ahí', () => {
  /**
   * El competidor es la lámina plana que MapLibre pone sobre el mar, separada
   * `SEA_LIFT_M` = 2 m. Para que el agua le gane, el empujón más los dos metros
   * tienen que valer más de un escalón del búfer a esa distancia.
   */
  const SEA_LIFT_M = 2

  it('a 300 km los dos metros de la lámina NO bastan, y por eso el término de escalones existe', () => {
    const r = { distance: 300_000 / ISLA.metersPerUnit, near: ISLA.near, far: ISLA.far }
    const escalon = worldPerNdc(ndcStep(24), r) * ISLA.metersPerUnit
    expect(escalon).toBeCloseTo(12.1, 1)
    expect(SEA_LIFT_M + BIAS_M).toBeLessThan(escalon)
  })

  it('con el término de escalones y 24 bits, sí, y con margen hasta mucho más allá del alcance', () => {
    const sin = 12.46 / 300 // la cámara de la vista de isla, a 12,46 km de altura
    const r = { distance: 300_000 / ISLA.metersPerUnit, near: ISLA.near, far: ISLA.far }
    const bias =
      biasWorld({ ...r, depthBits: 24, sinDepression: sin, metersPerUnit: ISLA.metersPerUnit }) *
      ISLA.metersPerUnit
    expect(bias / (worldPerNdc(ndcStep(24), r) * ISLA.metersPerUnit)).toBeGreaterThanOrEqual(BIAS_STEPS)
  })

  /**
   * CON 16 BITS NO SE PUEDE TENER TODO, y esto mide el precio exacto.
   *
   * A esa precisión, ganarle la profundidad a la lámina plana a 300 km pide un
   * empujón de 12 km, y un empujón de 12 km sobre un rayo rasante deja al agua
   * pasar por delante de 500 m de isla. Entre un mar que se apaga a lo lejos y
   * un mar por delante de la Cumbre Nueva, se elige lo primero: el techo manda
   * y el agua se apaga.
   *
   * Dónde se apaga: donde `SEA_LIFT_M + techo` deja de valer un escalón. Con la
   * cámara de la vista de isla salen 12 km, y con 24 bits, 1.800 km — o sea
   * seis veces el alcance del mar, que son 300. Por eso esto solo se ve en una
   * GPU de 16 bits.
   */
  it('con 16 bits el mar se apaga más allá de 12 km, y es la decisión, no un descuido', () => {
    const SEA_LIFT_M = 2
    const apagaA = (bits: number) => {
      for (let km = 1; km < 2000; km++) {
        const d = (km * 1000) / ISLA.metersPerUnit
        const sin = Math.min(1, ISLA.altitude / d)
        const r = { distance: d, near: ISLA.near, far: ISLA.far }
        const bias =
          biasWorld({ ...r, depthBits: bits, sinDepression: sin, metersPerUnit: ISLA.metersPerUnit }) *
          ISLA.metersPerUnit
        if (SEA_LIFT_M + bias < worldPerNdc(ndcStep(bits), r) * ISLA.metersPerUnit) return km
      }
      return Infinity
    }
    expect(apagaA(16)).toBeGreaterThan(10)
    expect(apagaA(16)).toBeLessThan(15)
    // Con 24 bits, muy por detrás del alcance del mar (300 km).
    expect(apagaA(24)).toBeGreaterThan(1000)
  })

  it('el techo solo aparece donde el búfer es malo, y ahí acota el daño', () => {
    const r = ray(ISLA, 12)
    const con16 = biasWorld({
      ...r,
      depthBits: 16,
      sinDepression: r.sin,
      metersPerUnit: ISLA.metersPerUnit,
    })
    // Sin techo pediría 493 m; con techo, lo que haga falta para no pasar de
    // tres metros de cota.
    expect(worldPerNdc(BIAS_STEPS * ndcStep(16), r) * ISLA.metersPerUnit).toBeGreaterThan(400)
    expect(leakHeightM(con16 * ISLA.metersPerUnit, r.sin)).toBeLessThanOrEqual(MAX_LEAK_M + 1e-9)

    // Y con 24 bits a la misma distancia no aparece: manda el metro.
    const con24 = biasWorld({
      ...r,
      depthBits: 24,
      sinDepression: r.sin,
      metersPerUnit: ISLA.metersPerUnit,
    })
    expect(leakHeightM(con24 * ISLA.metersPerUnit, r.sin)).toBeLessThan(MAX_LEAK_M)
  })
})

describe('el gemelo del sombreador', () => {
  /**
   * El GLSL no conoce `near` ni `far`: sondea la matriz. Proyecta el vértice,
   * lo vuelve a proyectar un 2 % más cerca y de la diferencia de profundidades
   * saca los metros que hacen falta por escalón. Esto es esa cuenta, y tiene
   * que dar lo mismo que la fórmula analítica de `worldPerNdc`.
   */
  const PROBE_SHARE = 0.02

  function probed(frustum: Frustum, slackNdc: number): number {
    const { near: n, far: f } = frustum
    const ndc = (d: number) => (f + n) / (f - n) - (2 * f * n) / ((f - n) * d)
    const probe = Math.max(1, frustum.distance * PROBE_SHARE)
    const gain = ndc(frustum.distance) - ndc(frustum.distance - probe)
    return (slackNdc / gain) * probe
  }

  it('la sonda da los mismos metros que la fórmula, dentro del error de la secante', () => {
    for (const cam of [ISLA, COSTA]) {
      for (const dep of [30, 15, 8]) {
        const r = ray(cam, dep)
        const slack = BIAS_STEPS * ndcStep(24)
        const sonda = probed(r, slack)
        const exacto = worldPerNdc(slack, r)
        // La secante sobre un 2 % de la distancia sobrestima la derivada un 2 %,
        // así que pide un 2 % menos de metros. Nada más.
        expect(sonda / exacto).toBeGreaterThan(0.97)
        expect(sonda / exacto).toBeLessThanOrEqual(1)
      }
    }
  })

  it('y la sonda tiene señal de sobra en float de 32 bits, que es para lo que existe', () => {
    // A 300 km, dos puntos separados un metro comparten la z hasta el último
    // bit; separados un 2 % de la distancia, no.
    const r = { distance: 300_000 / ISLA.metersPerUnit, near: ISLA.near, far: ISLA.far }
    const { near: n, far: f } = r
    const ndc = (d: number) => (f + n) / (f - n) - (2 * f * n) / ((f - n) * d)
    const EPS32 = 1.2e-7
    const unMetro = ndc(r.distance) - ndc(r.distance - 1 / ISLA.metersPerUnit)
    const sonda = ndc(r.distance) - ndc(r.distance * (1 - PROBE_SHARE))
    expect(unMetro).toBeLessThan(EPS32)
    // 504 épsilons de señal contra menos de uno: por eso la sonda es un
    // porcentaje de la distancia y no una longitud fija.
    expect(sonda / EPS32).toBeGreaterThan(400)
  })
})
