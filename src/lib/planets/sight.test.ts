/**
 * Los planetas, contra la efeméride y contra el empaquetado.
 *
 * QUÉ COMPARA ESTO, AHORA QUE LA POSICIÓN SALE DE `astronomy-engine`. Cuando
 * detrás había una tabla de Chebyshev, esta prueba medía además el error del
 * ajuste. Ese término ya no existe —la serie es la misma a los dos lados de la
 * comparación— y conviene decirlo en vez de dejar en pie una cifra que ya no
 * mide lo que decía.
 *
 * LO QUE SIGUE SIENDO INDEPENDIENTE, que es casi todo: `HelioVector` da una
 * posición heliocéntrica y nada más. Entre eso y un planeta en el cielo está el
 * tiempo de luz, la conversión a ecuatorial, la precesión, la nutación, la
 * aberración, la paralaje topocéntrica y la refracción, y esta cadena la
 * escribe `sight.ts` con `frame.ts`. `A.Equator(…, ofdate, aberration)` la
 * recorre entera por su cuenta con otro código. Comparar las dos salidas sigue
 * cazando lo que cazó: el error de 14° de una rotación de la oblicuidad
 * aplicada de más, con las distancias y las magnitudes saliendo perfectas
 * mientras tanto.
 *
 * Y HAY UNA PRUEBA QUE NO ES DE PRECISIÓN SINO DE EMPAQUETADO. Toda la razón
 * por la que la tabla se fue —19,61 KB comprimidos en un fragmento aparte
 * contra los 35,85 del binario— depende de que `astronomy-engine` entre por un
 * único `import()` dinámico. Un `import` estático en cualquier fichero que
 * alcance `App.tsx` funde el fragmento con el principal y se lo cobra a todo el
 * mundo, mire o no el cielo. No daría ningún error: daría un bundle más gordo.
 * De ahí el guardián, que es el mismo truco de `mapStyle.portable.test.ts`.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as A from 'astronomy-engine'
import { loadPlanetEphemeris, VISIBLE_PLANETS, type PlanetId } from './ephemeris'
import { planetSight } from './sight'

const eph = await loadPlanetEphemeris()

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

/** Todos los ficheros del proyecto que alcanza uno, siguiendo rutas relativas. */
function reachableFrom(entry: string): string[] {
  const seen = new Set<string>()
  const pending = [entry]
  while (pending.length) {
    const file = pending.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(/^import\s+(?:type\s+)?[^'"]*from\s+'(\.[^']+)'/gm)) {
      const target = resolve(dirname(file), m[1])
      for (const candidate of [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`]) {
        try {
          readFileSync(candidate)
          pending.push(candidate)
          break
        } catch {
          // La siguiente extensión.
        }
      }
    }
  }
  return [...seen]
}

describe('las efemérides', () => {
  it('dan los siete cuerpos, con la Tierra que hace de origen', () => {
    for (const id of [...VISIBLE_PLANETS, 'tierra' as PlanetId]) {
      const v = eph(id, Date.UTC(2026, 6, 1))
      expect(v).toHaveLength(3)
      expect(Number.isFinite(v[0] + v[1] + v[2])).toBe(true)
    }
    // La Tierra a una unidad astronómica del sol, que es la definición.
    const earth = eph('tierra', Date.UTC(2026, 6, 1))
    expect(Math.hypot(...earth)).toBeGreaterThan(0.98)
    expect(Math.hypot(...earth)).toBeLessThan(1.02)
  })

  it('YA NO CADUCAN, que es la otra mitad de por qué se fue la tabla', () => {
    // Aquí vivían dos pruebas: una comprobaba que un Chebyshev fuera de ventana
    // devolvía `null` en vez de dispararse, y otra iba a fallar en 2034 para
    // avisar de que tocaba regenerar el binario. Las dos existían por la tabla.
    // Contra la serie entera, una fecha a la que el binario no llegaba sale
    // igual de bien: se compara con la efeméride en 2045, once años después del
    // final de la ventana que hubo.
    const at = Date.UTC(2045, 3, 20, 22, 0, 0)
    const mine = planetSight(eph, 'jupiter', at, OBS)
    const eq = A.Equator(A.Body.Jupiter, new Date(at), observer, true, true)
    const hor = A.Horizon(new Date(at), observer, eq.ra, eq.dec, undefined)
    expect(
      sepArcsec(
        fromHorizon(mine.elevationDeg, mine.azimuthDeg),
        fromHorizon(hor.altitude, hor.azimuth),
      ),
    ).toBeLessThan(3)
  })

  it('ENTRAN POR UN `import()` Y NO POR UNA IMPORTACIÓN ESTÁTICA', () => {
    // El guardián del empaquetado. `astronomy-engine` tiene que llegar al
    // navegador en su propio fragmento, y eso solo pasa si ningún fichero que
    // alcance `App.tsx` la importa de forma estática. Con una sola importación
    // estática, Rollup funde los 19,61 KB comprimidos con el bundle principal y
    // los paga también quien nunca abre el cielo. No hay error que lo delate:
    // la aplicación funciona igual, solo que más gorda.
    //
    // Las `import type` no cuentan: TypeScript las borra al compilar.
    const app = resolve(dirname(fileURLToPath(import.meta.url)), '../../App.tsx')
    const culprits: string[] = []
    for (const file of reachableFrom(app)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/^import\s+([^;]*?)\s*from\s+'astronomy-engine'/gm)) {
        if (!/^type\s/.test(m[1].trim())) culprits.push(`${file}: ${m[0]}`)
      }
    }
    expect(culprits, culprits.join('\n')).toEqual([])
  })

  it('y el `import()` desestructura por nombre, que es lo que permite podar', () => {
    // Con el espacio de nombres entero en la mano —`import('astronomy-engine')`
    // a secas— Rollup no puede podar nada y el fragmento pasa de 19,61 KB a
    // 44,30 comprimidos. Medido con este build cambiando solo esa línea. El
    // dato está en `ephemeris.ts`; esto comprueba que la forma sigue ahí.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'ephemeris.ts'),
      'utf8',
    )
    expect(src).toMatch(/const\s*\{[^}]+\}\s*=\s*await import\('astronomy-engine'\)/)
  })
})

describe('dónde se ven, contra astronomy-engine', () => {
  for (const id of VISIBLE_PLANETS) {
    it(`${id} coincide por debajo del segundo de arco`, () => {
      const errors: number[] = []
      for (let i = 0; i < SAMPLES; i++) {
        const at = START + i * STEP
        const date = new Date(at)
        const mine = planetSight(eph, id, at, OBS)
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
      // SON LAS MISMAS CIFRAS QUE CON LA TABLA DE CHEBYSHEV, hasta la milésima
      // de segundo de arco, y ése es el dato que justifica haberla quitado: el
      // ajuste estaba apretado a 100 km y ese término nunca asomó por encima
      // del resto de la cadena. Lo que se mide aquí es la precesión, la
      // nutación, la aberración y el tiempo de luz de `sight.ts` contra los de
      // NOVAS, y eso no ha cambiado.
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
    const mine = planetSight(eph, 'jupiter', at, OBS)
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
        const mine = planetSight(eph, id, at, OBS)
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
      const s = planetSight(eph, 'saturno', at, OBS)
      magnitudes.push(s.magnitude - 5 * Math.log10(s.sunDistanceAu * s.distanceAu))
    }
    const spread = Math.max(...magnitudes) - Math.min(...magnitudes)
    expect(spread).toBeGreaterThan(0.5)
  })

  it('Venus es el más brillante y Urano el más flojo', () => {
    // Comprobación de que nadie ha cruzado dos constantes: es el orden que
    // cualquiera ve saliendo a la calle, y no depende de ninguna efeméride.
    const at = Date.UTC(2027, 2, 10, 21, 0, 0)
    const mags = new Map(
      VISIBLE_PLANETS.map((id) => [id, planetSight(eph, id, at, OBS).magnitude]),
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
      venusMin = Math.min(venusMin, planetSight(eph, 'venus', at, OBS).illumination)
      jupiterMin = Math.min(jupiterMin, planetSight(eph, 'jupiter', at, OBS).illumination)
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
      const v = planetSight(eph, 'venus', at, OBS).angularDiameterArcsec
      const j = planetSight(eph, 'jupiter', at, OBS).angularDiameterArcsec
      venus = { min: Math.min(venus.min, v), max: Math.max(venus.max, v) }
      jupiter = { min: Math.min(jupiter.min, j), max: Math.max(jupiter.max, j) }
    }
    expect(venus.min).toBeGreaterThan(9)
    expect(venus.max).toBeLessThan(70)
    expect(jupiter.min).toBeGreaterThan(28)
    expect(jupiter.max).toBeLessThan(52)
  })
})
