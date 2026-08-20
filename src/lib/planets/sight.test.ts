/**
 * Los planetas, contra la efeméride que los generó y contra el calendario.
 *
 * ABRE EL FICHERO QUE SE SIRVE, `public/cielo/planetas.bin`, no uno de juguete:
 * lo que se comprueba es la tabla que va a descargar la gente.
 *
 * COMPARAR CONTRA `astronomy-engine` AQUÍ NO ES CIRCULAR, aunque la tabla se
 * ajustara con ella. El ajuste es una compresión con pérdida y la pérdida es lo
 * que se mide; y entre la tabla y el cielo hay una cadena entera que
 * `astronomy-engine` no tocó: tiempo de luz, paralaje topocéntrica, precesión,
 * nutación, aberración y refracción. El error de 14° que esta prueba cazó
 * —una rotación de la oblicuidad aplicada de más— estaba justo ahí, y las
 * distancias y las magnitudes salían perfectas mientras tanto.
 *
 * Y HAY UNA PRUEBA QUE NO ES DE PRECISIÓN SINO DE CALENDARIO: la tabla caduca.
 * Falla cuando queden menos de dos años de ventana, que es tiempo de sobra para
 * regenerarla con `npm run prepare-planetas`.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as A from 'astronomy-engine'
import { decodePlanetTable, heliocentric, VISIBLE_PLANETS, type PlanetId } from './table'
import { planetSight } from './sight'

const BIN = path.resolve(__dirname, '../../../public/cielo/planetas.bin')
const raw = readFileSync(BIN)
const table = decodePlanetTable(
  raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
)

/** El Roque, el mismo sitio que usan las pruebas de las estrellas y la luna. */
const LON = -17.8892
const LAT = 28.7542
const ALT = 2387
const observer = new A.Observer(LAT, LON, ALT)
const OBS = { lon: LON, lat: LAT, elevationM: ALT }
const RAD = Math.PI / 180

const BODY: Record<PlanetId, A.Body> = {
  mercurio: A.Body.Mercury,
  venus: A.Body.Venus,
  tierra: A.Body.Earth,
  marte: A.Body.Mars,
  jupiter: A.Body.Jupiter,
  saturno: A.Body.Saturn,
  urano: A.Body.Uranus,
}

function fromHorizon(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = elevationDeg * RAD
  const a = azimuthDeg * RAD
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
}

function sepArcsec(a: [number, number, number], b: [number, number, number]): number {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  return (Math.acos(dot) * 180 * 3600) / Math.PI
}

/** Tres años, cada 36 horas: 600 posiciones por planeta. */
const SAMPLES = 600
const STEP = 36 * 3600_000
const START = Date.UTC(2026, 0, 2)

describe('la tabla', () => {
  it('trae los siete cuerpos y su ventana', () => {
    expect(table.bodies.size).toBe(7)
    expect(table.bodies.has('tierra')).toBe(true)
    for (const id of VISIBLE_PLANETS) expect(table.bodies.has(id)).toBe(true)
    expect(table.endMs).toBeGreaterThan(table.startMs)
  })

  it('SE NIEGA A EXTRAPOLAR, que es la mitad de por qué es una tabla y no una serie', () => {
    // Un día antes y un día después de la ventana no hay posición, y eso es lo
    // correcto: un Chebyshev de grado 14 extrapolado no se degrada con
    // elegancia, se dispara. Devolver una cifra enorme con confianza es peor
    // que devolver nada.
    expect(heliocentric(table, 'marte', table.startMs - 86_400_000)).toBeNull()
    expect(heliocentric(table, 'marte', table.endMs + 86_400_000)).toBeNull()
    // Y en los dos extremos exactos sí hay.
    expect(heliocentric(table, 'marte', table.startMs)).not.toBeNull()
    expect(heliocentric(table, 'marte', table.endMs)).not.toBeNull()
  })

  it('QUEDAN MÁS DE DOS AÑOS DE TABLA', () => {
    // La prueba del calendario. No mide precisión: avisa. Cuando falle, hay que
    // ejecutar `npm run prepare-planetas` y volver a desplegar, y quedan dos
    // años para hacerlo sin prisa.
    const yearsLeft = (table.endMs - Date.now()) / (365.25 * 86_400_000)
    expect(yearsLeft, `quedan ${yearsLeft.toFixed(1)} años de tabla`).toBeGreaterThan(2)
  })

  it('los bloques empalman sin salto en la costura', () => {
    // Donde dos polinomios se tocan es donde un ajuste malo se nota: se mira el
    // último instante de un bloque contra el primero del siguiente.
    const spec = table.bodies.get('mercurio')!
    for (let i = 1; i < Math.min(20, spec.blocks); i++) {
      const seam = table.startMs + i * spec.intervalMs
      const before = heliocentric(table, 'mercurio', seam - 1)!
      const after = heliocentric(table, 'mercurio', seam + 1)!
      const jump = Math.hypot(
        before[0] - after[0],
        before[1] - after[1],
        before[2] - after[2],
      )
      // Dos milisegundos de movimiento de Mercurio son 1e-9 UA. El umbral en
      // 1e-6 UA —150 km— caza un salto de costura sin exigirle al ajuste una
      // continuidad que no promete.
      expect(jump).toBeLessThan(1e-6)
    }
  })
})

describe('dónde se ven, contra astronomy-engine', () => {
  for (const id of VISIBLE_PLANETS) {
    it(`${id} coincide por debajo del segundo de arco`, () => {
      const errors: number[] = []
      for (let i = 0; i < SAMPLES; i++) {
        const at = START + i * STEP
        const date = new Date(at)
        const mine = planetSight(table, id, at, OBS)!
        // Topocéntrica, de la fecha y con aberración: la posición aparente.
        // Sin refracción, que la pone `refraction.ts` aparte.
        const eq = A.Equator(BODY[id], date, observer, true, true)
        const hor = A.Horizon(date, observer, eq.ra, eq.dec, undefined)
        errors.push(
          sepArcsec(
            fromHorizon(mine.elevationDeg, mine.azimuthDeg),
            fromHorizon(hor.altitude, hor.azimuth),
          ),
        )
      }
      errors.sort((a, b) => a - b)
      const median = errors[errors.length >> 1]
      const worst = errors[errors.length - 1]
      // MEDIDO sobre tres años cada 36 h: mediana entre 0,10" y 0,36" según el
      // planeta, peor caso 0,57". Es el mismo orden que las 8920 estrellas
      // (0,31" y 0,54"), así que un planeta no es lo peor colocado del cielo.
      //
      // El umbral en 3" está cinco veces por encima del peor caso real y muy
      // por debajo de los tres fallos que tiene que cazar: los 22' de olvidar
      // la precesión, los 20" de olvidar la aberración y los 25" de olvidar el
      // tiempo de luz de Júpiter.
      expect(worst, `${id}: peor ${worst.toFixed(2)}"`).toBeLessThan(3)
      expect(median).toBeLessThan(1)
    })
  }

  it('LA CONTRAPRUEBA: una rotación de la oblicuidad se vería', () => {
    // El error que esta prueba cazó de verdad. Si alguien vuelve a «pasar la
    // tabla a ecuatorial», los planetas se van 23° — y las distancias, las
    // magnitudes y los diámetros siguen saliendo exactos, porque una rotación
    // no cambia el módulo. Solo la posición lo delata.
    const at = Date.UTC(2027, 5, 15, 22, 0, 0)
    const mine = planetSight(table, 'jupiter', at, OBS)!
    const eq = A.Equator(A.Body.Jupiter, new Date(at), observer, true, true)
    const hor = A.Horizon(new Date(at), observer, eq.ra, eq.dec, undefined)
    const wrong = 23.4392794444 * RAD
    // Se rehace la rotación de más sobre el vector bueno y se comprueba que la
    // prueba de arriba la habría visto.
    const good = fromHorizon(mine.elevationDeg, mine.azimuthDeg)
    const rotated: [number, number, number] = [
      good[0],
      good[1] * Math.cos(wrong) - good[2] * Math.sin(wrong),
      good[1] * Math.sin(wrong) + good[2] * Math.cos(wrong),
    ]
    const reference = fromHorizon(hor.altitude, hor.azimuth)
    expect(sepArcsec(good, reference)).toBeLessThan(3)
    expect(sepArcsec(rotated, reference)).toBeGreaterThan(3600)
  })
})

describe('cuánto brillan', () => {
  for (const id of VISIBLE_PLANETS) {
    it(`la magnitud de ${id} cuadra cuando se puede ver`, () => {
      const errors: number[] = []
      for (let i = 0; i < SAMPLES; i++) {
        const at = START + i * STEP
        const mine = planetSight(table, id, at, OBS)!
        // Solo con elongación suficiente. Las fórmulas del *Astronomical
        // Almanac* se degradan a ángulos de fase grandes, y ahí el planeta está
        // pegado al sol: no se ve, y su magnitud no le importa a nadie.
        if (mine.elongationDeg < 15) continue
        errors.push(Math.abs(mine.magnitude - A.Illumination(BODY[id], new Date(at)).mag))
      }
      expect(errors.length).toBeGreaterThan(100)
      errors.sort((a, b) => a - b)
      // MEDIDO: mediana de 0,000 (Marte y Júpiter, que usan la misma fórmula)
      // a 0,121 (Saturno); peor caso 0,22 en Venus. Un cuarto de magnitud no
      // cambia si un planeta se ve o no: la diferencia entre Venus y Sirio son
      // cuatro magnitudes enteras.
      expect(errors[errors.length - 1], `${id}: peor ${errors[errors.length - 1].toFixed(3)}`).toBeLessThan(0.3)
    })
  }

  it('los anillos de Saturno valen casi una magnitud, y por eso están', () => {
    // LA OTRA ORILLA de la corrección de anillos. Sin ella, Saturno se
    // equivocaba 0,50 de mediana y 0,82 en el peor caso; con ella, 0,12. Se
    // comprueba que el término existe y que se mueve con los años: en 2025 los
    // anillos estuvieron de canto y Saturno se vio casi una magnitud más flojo.
    const magnitudes: number[] = []
    for (let year = 2026; year < 2035; year++) {
      const at = Date.UTC(year, 6, 1)
      const s = planetSight(table, 'saturno', at, OBS)
      if (s) magnitudes.push(s.magnitude - 5 * Math.log10(s.sunDistanceAu * s.distanceAu))
    }
    const spread = Math.max(...magnitudes) - Math.min(...magnitudes)
    expect(spread).toBeGreaterThan(0.5)
  })

  it('Venus es el más brillante y Urano el más flojo', () => {
    // Comprobación de que nadie ha cruzado dos constantes: es el orden que
    // cualquiera ve saliendo a la calle, y no depende de ninguna efeméride.
    const at = Date.UTC(2027, 2, 10, 21, 0, 0)
    const mags = new Map(
      VISIBLE_PLANETS.map((id) => [id, planetSight(table, id, at, OBS)!.magnitude]),
    )
    expect(mags.get('venus')!).toBeLessThan(mags.get('jupiter')!)
    expect(mags.get('jupiter')!).toBeLessThan(mags.get('saturno')!)
    expect(mags.get('saturno')!).toBeLessThan(mags.get('urano')!)
    expect(mags.get('urano')!).toBeGreaterThan(5)
    expect(mags.get('urano')!).toBeLessThan(6.5)
  })
})

describe('las fases y los tamaños', () => {
  it('Venus enseña fases y Júpiter no', () => {
    // Es la diferencia entre un planeta interior y uno exterior, y sale sola de
    // la geometría: desde la Tierra, Venus puede ponerse entre nosotros y el
    // sol, y Júpiter nunca. Si algún día Júpiter saliera en cuarto creciente,
    // el signo del ángulo de fase estaría del revés.
    let venusMin = 1
    let jupiterMin = 1
    for (let i = 0; i < SAMPLES; i++) {
      const at = START + i * STEP
      venusMin = Math.min(venusMin, planetSight(table, 'venus', at, OBS)!.illumination)
      jupiterMin = Math.min(jupiterMin, planetSight(table, 'jupiter', at, OBS)!.illumination)
    }
    expect(venusMin).toBeLessThan(0.1)
    expect(jupiterMin).toBeGreaterThan(0.97)
  })

  it('los diámetros angulares están donde tienen que estar', () => {
    // Júpiter va de 30" a 50", Venus de 10" a 66" — la mayor variación del
    // cielo, y la razón de que su magnitud cambie tanto—. Fuera de esos rangos
    // hay un error de unidades o de radio.
    let venus = { min: 999, max: 0 }
    let jupiter = { min: 999, max: 0 }
    for (let i = 0; i < SAMPLES; i++) {
      const at = START + i * STEP
      const v = planetSight(table, 'venus', at, OBS)!.angularDiameterArcsec
      const j = planetSight(table, 'jupiter', at, OBS)!.angularDiameterArcsec
      venus = { min: Math.min(venus.min, v), max: Math.max(venus.max, v) }
      jupiter = { min: Math.min(jupiter.min, j), max: Math.max(jupiter.max, j) }
    }
    expect(venus.min).toBeGreaterThan(9)
    expect(venus.max).toBeLessThan(70)
    expect(jupiter.min).toBeGreaterThan(28)
    expect(jupiter.max).toBeLessThan(52)
  })
})
