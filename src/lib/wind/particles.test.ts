/**
 * Las partículas, comprobadas con números y no mirando la pantalla.
 *
 * Una animación de viento puede parecer correcta y estar mal: si las
 * partículas derivan hacia el este por no corregir el meridiano, si se quedan
 * clavadas donde no sopla, o si la estela va por detrás de donde estuvo el
 * punto, el mapa dibuja algo que el campo no dice. Nada de eso se ve; todo se
 * mide.
 */

import { describe, it, expect } from 'vitest'
import { buildWindField, toComponents, type WindSample } from './field'
import {
  degPerSecondPerMs,
  ParticleSystem,
  TAIL_INTERVAL_S,
  TAIL_LENGTH,
  timeAcceleration,
} from './particles'

const BOUNDS: [number, number, number, number] = [-18.05, 28.4, -17.7, 28.9]
const SPAWN = { west: -18.05, south: 28.4, east: -17.7, north: 28.9 }

function uniformField(speed: number, dir: number) {
  const samples: WindSample[] = []
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      samples.push({
        lon: -18.02 + i * 0.1,
        lat: 28.43 + j * 0.14,
        ...toComponents(speed, dir),
        source: 'model',
      })
    }
  }
  return buildWindField(samples, BOUNDS, 32, 40)
}

/** Generador determinista: los tests no dependen de `Math.random`. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const OPTS = { spawn: SPAWN, degPerSecondPerMs: degPerSecondPerMs(0.5), dt: 1 / 60 }

describe('sistema de partículas', () => {
  it('las partículas nacen dentro del área sembrada', () => {
    const p = new ParticleSystem(200, seeded(7))
    p.reset(SPAWN)
    for (let i = 0; i < p.count; i++) {
      expect(p.lon[i]).toBeGreaterThanOrEqual(SPAWN.west)
      expect(p.lon[i]).toBeLessThanOrEqual(SPAWN.east)
      expect(p.lat[i]).toBeGreaterThanOrEqual(SPAWN.south)
      expect(p.lat[i]).toBeLessThanOrEqual(SPAWN.north)
    }
  })

  it('ninguna se queda fuera del campo: al salirse, renace dentro', () => {
    const p = new ParticleSystem(300, seeded(11))
    p.reset(SPAWN)
    const f = uniformField(12, 0) // del norte, empuja a todas hacia el sur
    for (let step = 0; step < 400; step++) p.step(f, OPTS)
    for (let i = 0; i < p.count; i++) {
      expect(p.lon[i]).toBeGreaterThanOrEqual(BOUNDS[0] - 1e-6)
      expect(p.lon[i]).toBeLessThanOrEqual(BOUNDS[2] + 1e-6)
      expect(p.lat[i]).toBeGreaterThanOrEqual(BOUNDS[1] - 1e-6)
      expect(p.lat[i]).toBeLessThanOrEqual(BOUNDS[3] + 1e-6)
    }
  })

  it('un viento del norte NO desplaza en longitud', () => {
    // Sin el coseno de la latitud, un viento puramente meridional acabaría
    // arrastrando las partículas hacia el este. Es el error clásico y es
    // invisible a ojo sobre una isla pequeña.
    const p = new ParticleSystem(50, seeded(3))
    p.reset(SPAWN)
    const before = Float32Array.from(p.lon)
    const f = uniformField(10, 0)
    // Medio segundo: ninguna alcanza el borde, así que las que cambian de
    // longitud solo pueden haberlo hecho por haber renacido al cumplir su vida.
    for (let step = 0; step < 30; step++) p.step(f, OPTS)
    let quietas = 0
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.lon[i] - before[i]) < 1e-6) quietas++
    }
    // Las vidas están repartidas entre 1,5 y 4 s, así que en medio segundo
    // renace del orden de una de cada seis. Con la deriva del meridiano sin
    // corregir no quedaría ninguna quieta.
    expect(quietas).toBeGreaterThan(p.count * 0.7)
  })

  it('van hacia donde sopla el viento, no de donde viene', () => {
    const p = new ParticleSystem(80, seeded(23))
    p.reset(SPAWN)
    const latBefore = Float32Array.from(p.lat)
    const f = uniformField(10, 0) // del norte: las partículas bajan
    for (let step = 0; step < 20; step++) p.step(f, OPTS)
    let bajaron = 0
    for (let i = 0; i < p.count; i++) if (p.lat[i] < latBefore[i]) bajaron++
    expect(bajaron).toBeGreaterThan(p.count * 0.8)
  })

  it('en calma se reciclan en vez de quedarse clavadas', () => {
    const p = new ParticleSystem(120, seeded(5))
    p.reset(SPAWN)
    const f = uniformField(0.02, 90) // por debajo del umbral de movimiento
    for (let step = 0; step < 10; step++) p.step(f, OPTS)
    // Ninguna llega a formar estela: todas renacen en cada paso.
    for (let i = 0; i < p.count; i++) expect(p.tailFill[i]).toBe(0)
  })

  it('la estela guarda las posiciones anteriores, la 0 es la más reciente', () => {
    const p = new ParticleSystem(1, seeded(2))
    p.reset(SPAWN)
    const f = uniformField(8, 45)
    // Un paso por apunte, para poder comparar posición a posición.
    const opts = { ...OPTS, dt: TAIL_INTERVAL_S }
    const positions: [number, number][] = []
    for (let step = 0; step < 5; step++) {
      positions.push([p.lon[0], p.lat[0]])
      p.step(f, opts)
    }
    // Tras cinco pasos, la cabeza de la estela es donde estaba justo antes.
    expect(p.tailLon[0]).toBeCloseTo(positions[4][0], 6)
    expect(p.tailLon[1]).toBeCloseTo(positions[3][0], 6)
    expect(p.tailLat[1]).toBeCloseTo(positions[3][1], 6)
  })

  it('la estela nunca guarda más posiciones de las que caben', () => {
    const p = new ParticleSystem(40, seeded(13))
    p.reset(SPAWN)
    const f = uniformField(6, 200)
    for (let step = 0; step < 200; step++) p.step(f, OPTS)
    for (let i = 0; i < p.count; i++) expect(p.tailFill[i]).toBeLessThanOrEqual(TAIL_LENGTH)
  })

  it('las vidas están repartidas: no desaparecen todas a la vez', () => {
    const p = new ParticleSystem(400, seeded(17))
    p.reset(SPAWN)
    const f = uniformField(9, 60)
    // Se cuenta cuántas renacen en cada paso: si las vidas fueran iguales
    // habría un paso con casi todas y el resto con ninguna.
    const renacidas: number[] = []
    for (let step = 0; step < 120; step++) {
      const before = Float32Array.from(p.tailFill)
      p.step(f, OPTS)
      let n = 0
      for (let i = 0; i < p.count; i++) if (p.tailFill[i] === 0 && before[i] > 0) n++
      renacidas.push(n)
    }
    expect(Math.max(...renacidas)).toBeLessThan(p.count * 0.2)
  })
})

describe('velocidad en pantalla', () => {
  /** Un segundo de simulación a la tasa de refresco que se le pida. */
  function run(speedMs: number, hz: number, seconds = 1) {
    const p = new ParticleSystem(1, seeded(31))
    // `respawn` y no `reset`: así la partícula empieza con la edad a cero y no
    // renace a mitad de la medición.
    p.respawn(0, SPAWN)
    const f = uniformField(speedMs, 180) // del sur: sube, sin componente este
    const opts = { ...OPTS, dt: 1 / hz }
    const lat0 = p.lat[0]
    for (let step = 0; step < hz * seconds; step++) p.step(f, opts)
    return { p, moved: p.lat[0] - lat0 }
  }

  it('el doble de viento son exactamente el doble de píxeles por segundo', () => {
    // Es LA propiedad que hace que la animación se pueda leer como una medida.
    // Con la compresión `v^0.6` que había antes, este cociente daba 1,52 en vez
    // de 2: dos estelas que corrían igual podían llevar vientos muy distintos.
    const flojo = run(4, 60)
    const fuerte = run(8, 60)
    expect(fuerte.moved / flojo.moved).toBeCloseTo(2, 6)
  })

  it('la estela mide lo mismo a 60 Hz que a 120 Hz', () => {
    // La exposición la fija el reloj, no el fotograma: en una pantalla de 120
    // la misma racha tiene que dejar la misma estela, no la mitad.
    const span = (r: ReturnType<typeof run>) => {
      const fill = r.p.tailFill[0]
      return Math.abs(r.p.tailLat[0] - r.p.tailLat[fill - 1])
    }
    const a = run(10, 60)
    const b = run(10, 120)
    expect(a.p.tailFill[0]).toBe(TAIL_LENGTH)
    expect(b.p.tailFill[0]).toBe(TAIL_LENGTH)
    // Lo que dura la estela: `TAIL_LENGTH - 1` intervalos entre la primera
    // posición apuntada y la última.
    const esperado = 10 * degPerSecondPerMs(0.5) * (TAIL_LENGTH - 1) * TAIL_INTERVAL_S
    // Un 3 % de margen y no una igualdad: el apunte cae donde cae dentro del
    // fotograma —0,04 s no es múltiplo de 1/60— así que la estela puede quedar
    // corta o larga por lo que dure un fotograma. Lo que se comprueba es que
    // ese resto sea el único error, y no un factor dos entre pantallas.
    expect(Math.abs(span(a) / esperado - 1)).toBeLessThan(0.03)
    expect(Math.abs(span(b) / esperado - 1)).toBeLessThan(0.03)
  })

  it('la aceleración del tiempo es la única licencia, y es un número', () => {
    // A la escala de la isla la animación corre unas 600 veces el reloj; al
    // acercarse, proporcionalmente menos. Lo que no cambia nunca es que sea la
    // misma para todas las partículas del fotograma.
    expect(timeAcceleration(0.55)).toBeGreaterThan(550)
    expect(timeAcceleration(0.55)).toBeLessThan(650)
    expect(timeAcceleration(0.05) * 11).toBeCloseTo(timeAcceleration(0.55), 6)
  })

  it('se ata al alto de la vista para que se lea igual a cualquier zoom', () => {
    // Al acercarse, la misma velocidad geográfica cruzaría la pantalla en un
    // parpadeo: la ganancia tiene que bajar en la misma proporción.
    const lejos = degPerSecondPerMs(0.5)
    const cerca = degPerSecondPerMs(0.05)
    expect(lejos / cerca).toBeCloseTo(10, 6)
  })

  it('una partícula de 10 m/s tarda unos segundos en cruzar la vista', () => {
    const heightDeg = 0.5
    const gain = degPerSecondPerMs(heightDeg)
    const secondsToCross = heightDeg / (10 * gain)
    expect(secondsToCross).toBeGreaterThan(5)
    expect(secondsToCross).toBeLessThan(30)
  })
})

describe('cota de las partículas', () => {
  /**
   * Un terreno de juguete que sube 1.000 m por grado hacia el este, para poder
   * comprobar con una cuenta lo que en pantalla solo se ve como una estela que
   * se pega a la ladera.
   */
  const ground = (lon: number) => (lon + 18.05) * 1000

  /** Del oeste: empuja hacia el este, o sea cuesta arriba en este terreno. */
  const WEST_WIND = uniformField(10, 270)

  it('sin muestreador la cota se queda a cero, que es el mapa plano', () => {
    // La capa no pasa `elevationAt` cuando el relieve está apagado, y entonces
    // esto tiene que comportarse exactamente como antes de que existiera la 3D.
    const p = new ParticleSystem(20, seeded(7))
    p.reset(SPAWN)
    for (let i = 0; i < 40; i++) p.step(WEST_WIND, OPTS)
    expect([...p.elevation].every((e) => e === 0)).toBe(true)
    expect([...p.tailElevation].every((e) => e === 0)).toBe(true)
  })

  it('cada punto de la estela guarda LA COTA DE SU SITIO', () => {
    // Es lo que hace que la estela se pegue a la ladera en vez de quedarse
    // horizontal a la altura de la cabeza. La comprobación no mira la forma:
    // exige que cada pareja (longitud, cota) cumpla la función del terreno.
    const p = new ParticleSystem(30, seeded(13))
    p.reset(SPAWN)
    for (let i = 0; i < 40; i++) {
      p.step(WEST_WIND, { ...OPTS, elevationAt: (lon) => ground(lon) })
    }
    let checked = 0
    for (let i = 0; i < p.count; i++) {
      const base = i * TAIL_LENGTH
      expect(p.elevation[i]).toBeCloseTo(ground(p.lon[i]), 2)
      for (let k = 0; k < p.tailFill[i]; k++) {
        expect(p.tailElevation[base + k]).toBeCloseTo(ground(p.tailLon[base + k]), 2)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('la estela sube cuando la partícula sube', () => {
    // Con viento del oeste sobre una rampa que asciende hacia el este, la cola
    // —más vieja, más al oeste— tiene que quedar por debajo de la cabeza. Si
    // la cota se copiara de la cabeza a toda la estela, esto sería plano.
    const p = new ParticleSystem(1, () => 0.5)
    p.reset(SPAWN)
    for (let i = 0; i < 40; i++) {
      p.step(WEST_WIND, { ...OPTS, elevationAt: (lon) => ground(lon) })
    }
    const fill = p.tailFill[0]
    expect(fill).toBeGreaterThan(3)
    for (let k = 1; k < fill; k++) {
      expect(p.tailElevation[k]).toBeLessThan(p.tailElevation[k - 1])
    }
    expect(p.elevation[0]).toBeGreaterThan(p.tailElevation[0])
  })

  it('la cabeza NO se dibuja a la altura de donde venía', () => {
    // El error que se corrigió leyendo la cota dos veces por paso: con una
    // sola lectura, la cabeza iba a la cota de la posición anterior. A 600
    // aumentos eso son 100 m de terreno por fotograma.
    const p = new ParticleSystem(1, () => 0.5)
    p.reset(SPAWN)
    for (let i = 0; i < 10; i++) {
      p.step(WEST_WIND, { ...OPTS, elevationAt: (lon) => ground(lon) })
    }
    const before = p.elevation[0]
    p.step(WEST_WIND, { ...OPTS, elevationAt: (lon) => ground(lon) })
    expect(p.elevation[0]).toBeCloseTo(ground(p.lon[0]), 2)
    expect(p.elevation[0]).not.toBeCloseTo(before, 2)
  })

  it('al reciclarse, la partícula no se lleva la cota de donde estaba', () => {
    const p = new ParticleSystem(1, () => 0.5)
    p.reset(SPAWN)
    p.step(WEST_WIND, { ...OPTS, elevationAt: () => 2000 })
    expect(p.elevation[0]).toBe(2000)
    p.respawn(0, SPAWN)
    expect(p.elevation[0]).toBe(0)
    expect(p.tailFill[0]).toBe(0)
  })
})
