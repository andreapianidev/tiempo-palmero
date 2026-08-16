import { describe, expect, it } from 'vitest'
import {
  BIAS_M,
  BIAS_STEPS,
  LOWEST_TIDE_M,
  MAX_LEAK_M,
  biasWorld,
  leakGroundM,
  leakHeightM,
  liftFloodM,
  ndcStep,
  tideGapPush,
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
   * El competidor es la lámina plana que MapLibre pone sobre el mar, a cota
   * cero. El plano del agua va en la marea: con la marea alta están al mismo
   * nivel y la carrera la gana solo el empujón; con la más baja —`LOWEST_TIDE_M`,
   * 1,18 m medidos sobre 744 horas frente a Tazacorte— hay que ganar además
   * `tideGapPush` metros por el rayo.
   */

  it('a 300 km ni el metro de suelo ni la marea llegan al margen: por eso el término de escalones existe', () => {
    const r = { distance: 300_000 / ISLA.metersPerUnit, near: ISLA.near, far: ISLA.far }
    const escalon = worldPerNdc(ndcStep(24), r) * ISLA.metersPerUnit
    expect(escalon).toBeCloseTo(12.1, 1)
    // Con la marea alta, el metro de suelo son 0,08 escalones: nada.
    expect(BIAS_M).toBeLessThan(escalon)
    // Y en la bajamar más baja la marea paga 28,4 m: 2,35 escalones, por
    // debajo del margen de cuatro. Medido sobre este mismo módulo.
    const sin = 12.46 / 300 // la cámara de la vista de isla, a 12,46 km de altura
    const need = tideGapPush(LOWEST_TIDE_M, sin)
    expect(need).toBeCloseTo(28.4, 1)
    expect(need / escalon).toBeLessThan(BIAS_STEPS)
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
   * empujón de 12 km —los cuatro escalones a esa distancia—, y un empujón de
   * 12 km sobre un rayo rasante deja al agua pasar por delante de 500 m de
   * isla. Entre un mar que se apaga a lo lejos y un mar por delante de la
   * Cumbre Nueva, se elige lo primero: el techo manda y el agua se apaga.
   *
   * Dónde se apaga, medido sobre este mismo módulo: más allá de 10 km con la
   * marea alta —el caso peor, porque sin marea que ganar el único empujón es el
   * sesgo— y de 12 km con la más baja. Con 24 bits el mismo cálculo lo retrasa
   * a 1.800 km con la marea alta y 2.500 con la baja, o sea por detrás del
   * alcance del mar, que son 300. Por eso esto solo se ve en una GPU de 16 bits.
   */
  it('con 16 bits el mar se apaga entre los 10 y los 12 km según la marea, y es la decisión, no un descuido', () => {
    const apagaA = (bits: number, tide: number) => {
      for (let km = 1; km < 2000; km++) {
        const d = (km * 1000) / ISLA.metersPerUnit
        const sin = Math.min(1, ISLA.altitude / d)
        const r = { distance: d, near: ISLA.near, far: ISLA.far }
        const need = tideGapPush(tide, sin)
        const bias =
          biasWorld({ ...r, depthBits: bits, sinDepression: sin, metersPerUnit: ISLA.metersPerUnit }) *
          ISLA.metersPerUnit
        if (need + bias < worldPerNdc(ndcStep(bits), r) * ISLA.metersPerUnit) return km
      }
      return Infinity
    }
    // Bajamar: más allá de los 12 km.
    expect(apagaA(16, LOWEST_TIDE_M)).toBeGreaterThan(10)
    expect(apagaA(16, LOWEST_TIDE_M)).toBeLessThan(15)
    // Marea alta: el caso peor, más allá de los 10 km.
    expect(apagaA(16, 0)).toBeGreaterThan(8)
    expect(apagaA(16, 0)).toBeLessThan(13)
    // Con 24 bits, muy por detrás del alcance del mar (300 km).
    expect(apagaA(24, LOWEST_TIDE_M)).toBeGreaterThan(1000)
    expect(apagaA(24, 0)).toBeGreaterThan(1000)
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

describe('los dos metros que se levantaba el plano del agua', () => {
  it('pintaban tierra llana sin tope, y el tope lo ponía solo el ángulo', () => {
    // Lo que se veía: el agua metida en las plataneras de la costa baja.
    expect(liftFloodM(2, 5)).toBeCloseTo(23, 0)
    expect(liftFloodM(2, 2)).toBeCloseTo(57, 0)
    expect(liftFloodM(2, 1)).toBeCloseTo(115, 0)
    // Y de canto, sin límite: a medio grado ya son más de doscientos metros.
    expect(liftFloodM(2, 0.5)).toBeGreaterThan(200)
  })

  it('el empujón por el rayo hace el mismo trabajo sin ese término', () => {
    // No mueve el corte del rayo con el plano, así que el mapa de orilla se
    // consulta donde toca y no hay «suelo invadido» que dependa del ángulo:
    // lo único que cede es cota, y está acotada por el techo.
    for (const dep of [10, 5, 2, 1, 0.5]) {
      const sin = Math.sin((dep * Math.PI) / 180)
      const push = tideGapPush(LOWEST_TIDE_M, sin)
      expect(leakHeightM(push, sin)).toBeCloseTo(Math.abs(LOWEST_TIDE_M), 6)
      expect(leakHeightM(push, sin)).toBeLessThanOrEqual(MAX_LEAK_M)
    }
  })

  it('y con la marea más baja el mar sigue estando: el techo lo permite', () => {
    // La otra orilla. Si `MAX_LEAK_M` bajara de 1,18 el mar desaparecería
    // entero en bajamar, que es peor que cualquier ladera mojada.
    expect(MAX_LEAK_M).toBeGreaterThan(Math.abs(LOWEST_TIDE_M))
    for (const dep of [30, 5, 1]) {
      const sin = Math.sin((dep * Math.PI) / 180)
      expect(tideGapPush(LOWEST_TIDE_M, sin)).toBeLessThan(MAX_LEAK_M / sin)
    }
    // Con la marea alta no hace falta empujón ninguno por este concepto.
    expect(tideGapPush(0.9, Math.sin(0.1))).toBe(0)
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
