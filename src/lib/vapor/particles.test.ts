import { describe, expect, it } from 'vitest'
import { emptyDem, type Dem, type DemManifest } from '../dem'
import { VaporParticles, slopeAt } from './particles'
import type { VaporField } from './field'
import type { Breath } from './breath'

const MANIFEST: DemManifest = {
  zoom: 12,
  minZoom: 12,
  tileSize: 256,
  x0: 1841,
  y0: 1703,
  cols: 4,
  rows: 4,
  metersPerPixel: 33.54,
  attribution: '',
  encoding: 'terrarium',
  generated: '',
}

const WEST = -17.95
const EAST = -17.8
const SOUTH = 28.65
const NORTH = 28.8

/**
 * Una rampa que sube hacia el este: suelo perfecto para probar la pendiente.
 *
 * La pendiente es suave A PROPÓSITO. El primer intento subía 2 m por píxel y la
 * rampa llegaba a 2.146 m, con lo cual todo el trozo de malla que cae dentro de
 * la ventana de siembra quedaba por encima del techo de condensación y no nacía
 * ni una partícula: la prueba fallaba por el terreno de mentira, no por el
 * código. Medio metro por píxel deja la rampa entre 100 y 612 m, toda por
 * debajo del techo de 1.200.
 */
function ramp(): Dem {
  const dem = emptyDem(MANIFEST)
  for (let y = 0; y < dem.height; y++) {
    for (let x = 0; x < dem.width; x++) {
      dem.heights[y * dem.width + x] = 100 + x * 0.5
    }
  }
  return dem
}

const field = (over: Partial<VaporField> = {}): VaporField => ({
  bounds: [WEST, SOUTH, EAST, NORTH],
  width: 2,
  height: 2,
  demand: new Float32Array([1, 1, 1, 1]),
  ceilingM: 1200,
  ceilingFrom: 'lcl',
  activeShare: 1,
  ...over,
})

const breath = (flow: number): Breath => ({
  flow,
  sunDeg: flow > 0 ? 40 : -20,
  groundDeg: flow > 0 ? 38 : -22,
  phase: flow >= 0 ? 'up' : 'down',
})

const spawn = { west: WEST, south: SOUTH, east: EAST, north: NORTH }

/** Aleatorio reproducible: una prueba que depende de Math.random no es prueba. */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296
    return s / 4_294_967_296
  }
}

function run(p: VaporParticles, opts: { flow: number; steps: number; dem?: Dem }): void {
  const dem = opts.dem ?? ramp()
  const random = seeded(7)
  for (let i = 0; i < opts.steps; i++) {
    p.step({ dem, field: field(), wind: null, breath: breath(opts.flow), spawn, dt: 0.05, random })
  }
}

describe('la pendiente del terreno', () => {
  it('apunta ladera arriba', () => {
    // La rampa sube hacia el este: el vector unitario tiene que mirar al este.
    const s = slopeAt(ramp(), -17.88, 28.72)
    expect(s.ux).toBeGreaterThan(0.9)
    expect(Math.abs(s.uy)).toBeLessThan(0.2)
    expect(s.grade).toBeGreaterThan(0)
  })

  it('sobre una mesa no hay dirección que seguir', () => {
    const flat = emptyDem(MANIFEST)
    flat.heights.fill(300)
    const s = slopeAt(flat, -17.88, 28.72)
    expect(s.grade).toBe(0)
    expect(s.ux).toBe(0)
  })
})

describe('las partículas de vapor', () => {
  /** Altura media sobre el suelo de las que están vivas, en metros. */
  function meanClimb(p: VaporParticles): number {
    let sum = 0
    let n = 0
    for (let i = 0; i < p.capacity; i++) {
      if (p.weight[i] <= 0) continue
      sum += p.alt[i] - p.ground[i]
      n++
    }
    return n ? sum / n : 0
  }

  it('nacen sobre tierra, en el suelo', () => {
    const p = new VaporParticles(300)
    run(p, { flow: 1, steps: 5 })
    let vivas = 0
    for (let i = 0; i < p.capacity; i++) {
      if (p.weight[i] > 0) vivas++
    }
    expect(vivas).toBeGreaterThan(50)
    expect(meanClimb(p)).toBeGreaterThan(0)
  })

  /**
   * SE COMPRUEBA LA DIRECCIÓN, NO LA VELOCIDAD, y la diferencia importa.
   *
   * La velocidad de ascenso depende de la pendiente —una ladera tumbada apenas
   * canaliza, una pared lo hace del todo—, así que sobre la rampa suave de esta
   * prueba las motas suben unos pocos metros en los segundos que dura. Fijar un
   * número de metros aquí sería atar la prueba a la inclinación del terreno de
   * mentira; lo que tiene que ser cierto siempre es el SIGNO: inspirando suben,
   * espirando no.
   */
  it('inspirando suben, espirando se quedan pegadas al suelo', () => {
    const arriba = new VaporParticles(300)
    run(arriba, { flow: 1, steps: 200 })
    const abajo = new VaporParticles(300)
    run(abajo, { flow: -1, steps: 200 })

    expect(meanClimb(arriba)).toBeGreaterThan(meanClimb(abajo))
    // Espirando el aire baja por la ladera, y el suelo es el suelo: no puede
    // separarse de él más de lo que nació.
    expect(meanClimb(abajo)).toBeLessThan(12)
  })

  /**
   * LA COMPROBACIÓN QUE JUSTIFICA QUE ESTA CAPA EXISTA EN 3D. La capa de viento
   * está apagada con la cámara inclinada porque sus partículas, a cota cero,
   * atravesarían la montaña por dentro. Si estas pudieran quedar por debajo del
   * suelo, tendrían el mismo defecto y habría que apagarlas por el mismo motivo.
   */
  it('nunca quedan por debajo del terreno, ni espirando', () => {
    for (const flow of [1, -1]) {
      const p = new VaporParticles(300)
      run(p, { flow, steps: 120 })
      for (let i = 0; i < p.capacity; i++) {
        if (p.weight[i] <= 0) continue
        expect(p.alt[i]).toBeGreaterThanOrEqual(p.ground[i])
      }
    }
  })

  it('ninguna pasa del techo de condensación: ahí ya es nube', () => {
    const p = new VaporParticles(400)
    run(p, { flow: 1, steps: 400 })
    for (let i = 0; i < p.capacity; i++) {
      if (p.weight[i] <= 0) continue
      expect(p.alt[i]).toBeLessThanOrEqual(field().ceilingM)
    }
  })

  it('sin demanda no nace nada, por muy buena que sea la ladera', () => {
    const p = new VaporParticles(200)
    const dem = ramp()
    const random = seeded(3)
    const seco = field({ demand: new Float32Array([0, 0, 0, 0]) })
    for (let i = 0; i < 40; i++) {
      p.step({ dem, field: seco, wind: null, breath: breath(1), spawn, dt: 0.05, random })
    }
    expect(p.count).toBe(0)
  })

  it('sobre el mar no nace vapor', () => {
    const p = new VaporParticles(200)
    const mar = emptyDem(MANIFEST) // todo a cero: nivel del mar
    const random = seeded(5)
    for (let i = 0; i < 40; i++) {
      p.step({ dem: mar, field: field(), wind: null, breath: breath(1), spawn, dt: 0.05, random })
    }
    expect(p.count).toBe(0)
  })

  /**
   * Volver de una pestaña dormida da un `dt` de minutos. Sin recorte, todas las
   * motas cruzarían el techo de golpe y la capa aparecería vacía.
   */
  it('un salto de tiempo enorme no las teletransporta', () => {
    const p = new VaporParticles(200)
    const dem = ramp()
    const random = seeded(11)
    p.step({ dem, field: field(), wind: null, breath: breath(1), spawn, dt: 0.05, random })
    const antes = [...p.alt]
    p.step({ dem, field: field(), wind: null, breath: breath(1), spawn, dt: 600, random })
    for (let i = 0; i < p.capacity; i++) {
      if (p.weight[i] <= 0 || antes[i] === 0) continue
      expect(Math.abs(p.alt[i] - antes[i])).toBeLessThan(5)
    }
  })
})
