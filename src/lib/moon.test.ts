/**
 * La luna, medida contra una efeméride de verdad y contra la que había antes.
 *
 * LA PRUEBA TIENE DOS ORILLAS, como todas las de este repositorio. Que la luna
 * nueva coincida con `astronomy-engine` por debajo de medio minuto de arco
 * demuestra que la cadena está bien; lo que demuestra que la prueba SIRVE es
 * que la luna vieja —la serie de un término que estuvo dos meses moviendo el
 * reflejo del mar— no la pasa ni de lejos. Por eso está aquí copiada tal cual
 * era: es el control negativo, y sin él el umbral sería un número elegido.
 *
 * `astronomy-engine` (MIT, Don Cross) es solo dependencia de desarrollo. Lo que
 * corre en el navegador son las tablas de `moon.ts`.
 */

import { describe, expect, it } from 'vitest'
import * as A from 'astronomy-engine'
import { moonGeocentric, moonSight, moonState } from './moon'
import { sunPosition, skyVector } from './sun'

/** El Roque de los Muchachos, el mismo sitio que usa `frame.test.ts`. */
const LON = -17.8892
const LAT = 28.7542
const ALT = 2387

const observer = new A.Observer(LAT, LON, ALT)
const RAD = Math.PI / 180

/** Santa Cruz de La Palma, para las comprobaciones que no son de precisión. */
const TOWN_LON = -17.7642
const TOWN_LAT = 28.6835
const utc = (iso: string) => Date.parse(iso)

function fromHorizon(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = elevationDeg * RAD
  const a = azimuthDeg * RAD
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
}

/** Separación angular entre dos vectores unitarios, en minutos de arco. */
function sepArcmin(a: [number, number, number], b: [number, number, number]): number {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  return (Math.acos(dot) * 180 * 60) / Math.PI
}

/**
 * La luna que había en `sun.ts` hasta este cambio: un término de longitud, uno
 * de latitud, geocéntrica y con UTC por Tiempo Terrestre. Está aquí para poder
 * decir cuánto vale la diferencia, no para usarla.
 */
function moonBeforeThisChange(at: number, lonDeg: number, latDeg: number) {
  const DEG = 180 / Math.PI
  const d = at / 86400000 + 2440587.5 - 2451545
  const l = (218.316 + 13.176396 * d) * RAD
  const m = (134.963 + 13.064993 * d) * RAD
  const f = (93.272 + 13.22935 * d) * RAD
  const lambda = l + 6.289 * RAD * Math.sin(m)
  const beta = 5.128 * RAD * Math.sin(f)
  const obliq = 23.4397 * RAD
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(obliq) - Math.tan(beta) * Math.sin(obliq),
    Math.cos(lambda),
  )
  const dec = Math.asin(
    Math.sin(beta) * Math.cos(obliq) + Math.cos(beta) * Math.sin(obliq) * Math.sin(lambda),
  )
  const sidereal = 280.16 + 360.9856235 * d + lonDeg
  const ha = (((sidereal - ra * DEG + 540) % 360) - 180) * RAD
  const lat = latDeg * RAD
  const elevation = Math.asin(
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha),
  )
  const azimuth = Math.atan2(
    -Math.sin(ha) * Math.cos(dec),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(ha),
  )
  return { elevationDeg: elevation * DEG, azimuthDeg: (azimuth * DEG + 360) % 360 }
}

/** Dos años cada once horas: 1593 instantes, todas las fases y todas las alturas. */
const STEP_MS = 11 * 3600_000
const SAMPLES = 1593
const START = Date.UTC(2026, 0, 1, 0, 0, 0)

describe('la luna contra astronomy-engine', () => {
  it('coincide por debajo de medio minuto de arco durante dos años', () => {
    const mine: number[] = []
    const before: number[] = []
    let worst = 0
    let worstAt = ''

    for (let i = 0; i < SAMPLES; i++) {
      const at = START + i * STEP_MS
      const date = new Date(at)
      // Topocéntrica —`true`— y de la fecha, que es lo que ve alguien de pie en
      // el Roque. Sin refracción: eso lo pone `refraction.ts` aparte, y
      // mezclarlo aquí haría que un fallo suyo se leyera como un fallo de la
      // efeméride.
      const eq = A.Equator(A.Body.Moon, date, observer, true, true)
      const hor = A.Horizon(date, observer, eq.ra, eq.dec, undefined)
      const reference = fromHorizon(hor.altitude, hor.azimuth)

      const sight = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
      const d = sepArcmin(fromHorizon(sight.elevationDeg, sight.azimuthDeg), reference)
      mine.push(d)
      if (d > worst) {
        worst = d
        worstAt = date.toISOString()
      }

      const old = moonBeforeThisChange(at, LON, LAT)
      before.push(sepArcmin(fromHorizon(old.elevationDeg, old.azimuthDeg), reference))
    }

    mine.sort((a, b) => a - b)
    before.sort((a, b) => a - b)
    const median = mine[Math.floor(mine.length / 2)]
    const oldMedian = before[Math.floor(before.length / 2)]

    // MEDIDO sobre 5840 comparaciones cada tres horas: mediana 3,4", p95 7,6" y
    // peor caso 10,5". La luna llena mide 31 minutos de arco, así que el peor
    // caso es una centésima setenta y siete avos del disco: invisible.
    //
    // EL UMBRAL, con sus dos orillas. 0,5' está treinta veces por encima del
    // peor caso real —sitio de sobra para que la serie se degrade con los años—
    // y muy por debajo de los tres fallos que esta prueba tiene que cazar: los
    // 38" del reloj en Tiempo Terrestre, los 23' de la paralaje y el grado
    // largo de la serie corta. Bajarlo a 0,1' lo haría fallar solo en 2040;
    // subirlo a 5' dejaría pasar la paralaje entera.
    expect(worst, `peor caso en ${worstAt}`).toBeLessThan(0.5)
    expect(median).toBeLessThan(0.2)

    // LA OTRA ORILLA: la luna vieja se equivoca en más de un diámetro lunar de
    // mediana. Si alguien vuelve a meter una serie truncada aquí, esta línea
    // deja de pasar antes que ninguna otra cosa.
    expect(oldMedian).toBeGreaterThan(31)
    expect(oldMedian / median).toBeGreaterThan(100)
  })

  it('la fracción iluminada coincide hasta la diezmilésima', () => {
    let worst = 0
    for (let i = 0; i < 200; i++) {
      const at = START + i * 4 * 3600_000
      const sight = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
      const reference = A.Illumination(A.Body.Moon, new Date(at)).phase_fraction
      worst = Math.max(worst, Math.abs(sight.illumination - reference))
    }
    // Medido: 8·10⁻⁵. Es lo que decide cuánta luz echa sobre el mar y de qué
    // grosor sale el cuerno, y las dos cosas se notarían con un 1 % de error.
    expect(worst).toBeLessThan(0.002)
  })

  it('la distancia coincide en una parte de veinte mil', () => {
    let worst = 0
    for (let i = 0; i < 200; i++) {
      const at = START + i * 4 * 3600_000
      const sight = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
      const eq = A.Equator(A.Body.Moon, new Date(at), observer, true, true)
      worst = Math.max(worst, Math.abs(sight.topocentricKm - eq.dist * A.KM_PER_AU))
    }
    // Medido: 19,6 km de 380 000, o sea 5·10⁻⁵. De aquí sale el tamaño del
    // disco, así que 20 km son 0,06" de diámetro angular.
    expect(worst).toBeLessThan(60)
  })
})

describe('la paralaje, que es lo que la vieja no tenía', () => {
  it('en el cenit la luna está un radio terrestre más cerca', () => {
    // Se busca el paso más alto de un mes entero y se mira cuánto se acorta la
    // distancia. En el cenit exacto tienen que ser los 6378 km del radio; a 80°
    // de altura, casi todos.
    let best = -90
    let bestAt = START
    for (let i = 0; i < 24 * 30; i++) {
      const at = START + i * 3600_000
      const sight = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
      if (sight.elevationDeg > best) {
        best = sight.elevationDeg
        bestAt = at
      }
    }
    const high = moonSight(bestAt, { lon: LON, lat: LAT, elevationM: ALT })
    const shortening = high.distanceKm - high.topocentricKm
    // A la altura máxima que alcanza desde esta latitud —unos 80°— se acorta
    // casi el radio entero: 6378·sen(80°) = 6281 km.
    expect(best).toBeGreaterThan(60)
    expect(shortening).toBeGreaterThan(5000)
    expect(shortening).toBeLessThan(6400)
  })

  it('el disco crece un 1,7 % del horizonte al cenit, que es al revés de lo que parece', () => {
    // La ilusión lunar dice que la luna del horizonte es más grande. La
    // geometría dice lo contrario, y esta es la cifra: un radio terrestre de
    // 384 000 es un 1,66 % de distancia menos.
    let low = 90
    let lowAt = START
    let high = -90
    let highAt = START
    for (let i = 0; i < 24 * 30; i++) {
      const at = START + i * 3600_000
      const s = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
      // Solo entre lunas de tamaño parecido: si se compara una luna en el
      // perigeo con otra en el apogeo, lo que se mide es la órbita y no la
      // paralaje.
      if (Math.abs(s.distanceKm - 384400) > 3000) continue
      if (s.elevationDeg > high) {
        high = s.elevationDeg
        highAt = at
      }
      if (s.elevationDeg > 0 && s.elevationDeg < low) {
        low = s.elevationDeg
        lowAt = at
      }
    }
    const atHorizon = moonSight(lowAt, { lon: LON, lat: LAT, elevationM: ALT })
    const atTop = moonSight(highAt, { lon: LON, lat: LAT, elevationM: ALT })
    expect(atTop.angularDiameterDeg).toBeGreaterThan(atHorizon.angularDiameterDeg)
  })

  it('el diámetro angular se queda dentro de lo que existe', () => {
    // Entre el perigeo y el apogeo, la luna GEOCÉNTRICA mide entre 29,4' y
    // 33,5'. Vista desde la superficie el rango se abre por los dos lados —más
    // pequeña en el horizonte, más grande en el cenit—, y medido sobre seis
    // años desde el Roque va de 28,93' a 34,07'. Los límites de aquí abajo son
    // esos con un pelo de margen: fuera de ahí no hay una luna, hay un error de
    // unidades o de radio.
    for (let i = 0; i < 400; i++) {
      const s = moonSight(START + i * 5 * 3600_000, { lon: LON, lat: LAT, elevationM: ALT })
      expect(s.angularDiameterDeg * 60).toBeGreaterThan(28.8)
      expect(s.angularDiameterDeg * 60).toBeLessThan(34.2)
    }
  })
})

describe('el cuerno brillante', () => {
  it('es perpendicular a la luna y apunta al sol', () => {
    for (let i = 0; i < 300; i++) {
      const at = START + i * 7 * 3600_000
      const s = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
      const dot =
        s.brightLimb[0] * s.direction[0] +
        s.brightLimb[1] * s.direction[1] +
        s.brightLimb[2] * s.direction[2]
      // Perpendicular: vive en el plano del cielo, que es donde se dibuja.
      expect(Math.abs(dot)).toBeLessThan(1e-9)
      expect(Math.hypot(...s.brightLimb)).toBeCloseTo(1, 9)

      // Y del lado del sol. Con la luna casi nueva o casi llena la proyección
      // se vuelve pequeña y el signo pierde sentido: ahí no hay cuerno.
      if (s.illumination > 0.05 && s.illumination < 0.95) {
        const sun = skyVector(sunPosition(at, LON, LAT))
        const toward =
          s.brightLimb[0] * sun[0] + s.brightLimb[1] * sun[1] + s.brightLimb[2] * sun[2]
        expect(toward).toBeGreaterThan(0)
      }
    }
  })

  it('la creciente de la tarde enseña el cuerno hacia abajo', () => {
    // Con el sol recién puesto por el oeste y una luna creciente en el cielo,
    // la parte iluminada mira hacia el horizonte. Es lo que se ve desde
    // cualquier ventana de la isla y no depende de ninguna convención.
    //
    // LA CONDICIÓN DE FASE NO ES DECORATIVA. Solo vale para elongaciones
    // menores de 90°, o sea con la luna medio disco o menos: pasada la
    // cuadratura, el camino corto de la luna al sol por la esfera celeste
    // empieza a ir por ARRIBA, y una gibosa de la tarde enseña el cuerno hacia
    // el cenit. Medido: con este filtro salen 75 crepúsculos en medio año y
    // ninguno lo contradice.
    let found = 0
    for (let i = 0; i < 3 * 24 * 180; i++) {
      const at = START + i * 20 * 60_000
      const sun = sunPosition(at, TOWN_LON, TOWN_LAT)
      if (sun.elevationDeg > -4 || sun.elevationDeg < -14) continue
      const s = moonSight(at, { lon: TOWN_LON, lat: TOWN_LAT, elevationM: 30 })
      if (!s.waxing || s.elevationDeg < 5) continue
      if (s.illumination < 0.05 || s.illumination > 0.45) continue
      found++
      // La componente «arriba» del cuerno es negativa: apunta al suelo, hacia
      // el sol que acaba de ponerse.
      expect(s.brightLimb[2], new Date(at).toISOString()).toBeLessThan(0)
    }
    expect(found).toBeGreaterThan(20)
  })
})

/**
 * Las tres de siempre, que vivían en `sun.test.ts` y se vinieron con la luna.
 *
 * No comprueban precisión sino que la efeméride SEA una luna: que tenga mes
 * sinódico, que la llena salga cuando se pone el sol y que la nueva no ilumine.
 * Un error de transcripción en las tablas que dejara la posición plausible pero
 * la fase rota lo caza esto y no la comparación de arriba.
 */
describe('la luna, sin mirar ninguna efeméride', () => {
  it('la fase va de cero a uno y vuelve, con el mes sinódico', () => {
    const start = utc('2026-01-01T00:00:00Z')
    const peaks: number[] = []
    let previous = 0
    let rising = true
    for (let h = 0; h < 24 * 70; h++) {
      const at = start + h * 3600000
      const f = moonState(at, TOWN_LON, TOWN_LAT).illumination
      if (rising && f < previous) {
        peaks.push(at)
        rising = false
      }
      if (!rising && f > previous) rising = true
      previous = f
    }
    expect(peaks.length).toBeGreaterThanOrEqual(2)
    const days = (peaks[1] - peaks[0]) / 86400000
    expect(days).toBeCloseTo(29.53, 0)
  })

  it('la luna llena sale cuando se pone el sol', () => {
    const start = utc('2026-01-01T00:00:00Z')
    let full = start
    let best = 0
    for (let h = 0; h < 24 * 40; h++) {
      const at = start + h * 3600000
      const f = moonState(at, TOWN_LON, TOWN_LAT).illumination
      if (f > best) {
        best = f
        full = at
      }
    }
    expect(best).toBeGreaterThan(0.99)
    const sun = sunPosition(full, TOWN_LON, TOWN_LAT)
    const moon = moonState(full, TOWN_LON, TOWN_LAT)
    const separation = Math.abs(((moon.azimuthDeg - sun.azimuthDeg + 540) % 360) - 180)
    expect(separation).toBeGreaterThan(145)
    expect(Math.sign(moon.elevationDeg)).toBe(-Math.sign(sun.elevationDeg))
  })

  it('la nueva no ilumina nada', () => {
    const start = utc('2026-01-01T00:00:00Z')
    let worst = 1
    for (let h = 0; h < 24 * 40; h++) {
      worst = Math.min(worst, moonState(start + h * 3600000, TOWN_LON, TOWN_LAT).illumination)
    }
    expect(worst).toBeLessThan(0.01)
  })

  it('`moonState` devuelve la altura aparente, no la geométrica', () => {
    // La diferencia son 34' en el horizonte, o sea un diámetro lunar entero: es
    // la razón por la que la luna «se pone» cuando geométricamente ya está
    // debajo. El mar necesita la que se ve.
    let checked = 0
    for (let h = 0; h < 24 * 40; h++) {
      const at = utc('2026-01-01T00:00:00Z') + h * 3600000
      const sight = moonSight(at, { lon: TOWN_LON, lat: TOWN_LAT, elevationM: 0 })
      if (Math.abs(sight.elevationDeg) > 0.5) continue
      const state = moonState(at, TOWN_LON, TOWN_LAT)
      expect(state.elevationDeg).toBeGreaterThan(sight.elevationDeg + 0.4)
      checked++
    }
    expect(checked).toBeGreaterThan(3)
  })
})

describe('la geocéntrica, que es la que fija la fase', () => {
  it('no depende de dónde esté el observador', () => {
    const at = utc('2026-08-19T23:00:00Z')
    const a = moonGeocentric(at)
    const desdeElRoque = moonSight(at, { lon: LON, lat: LAT, elevationM: ALT })
    const desdeTazacorte = moonSight(at, { lon: -17.94, lat: 28.64, elevationM: 5 })
    expect(desdeElRoque.raDeg).toBe(a.raDeg)
    expect(desdeTazacorte.raDeg).toBe(a.raDeg)
    // La fase es la misma desde toda la isla; la posición en el cielo no.
    expect(desdeTazacorte.illumination).toBeCloseTo(desdeElRoque.illumination, 12)
    expect(desdeTazacorte.azimuthDeg).not.toBe(desdeElRoque.azimuthDeg)
  })
})
