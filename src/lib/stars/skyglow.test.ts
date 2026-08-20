/**
 * El modelo del cielo, contra el cielo.
 *
 * El fixture `sqm-noche.json` son 183 lecturas reales de la red de fotómetros
 * del Cabildo —tres estaciones, del 17 al 18 de agosto de 2026— con la posición
 * del sol y de la luna de cada una calculada al lado. Cubre las tres
 * situaciones que el modelo tiene que acertar: 112 lecturas de noche cerrada sin
 * luna, 38 de crepúsculo entre −16° y −3°, y 12 con la luna alta.
 *
 * LA PRUEBA QUE IMPORTA NO ES «¿SE PARECE?». Es que el modelo acierte **en las
 * tres zonas a la vez**, porque cada una la gobierna un término distinto y un
 * error compensado entre dos se lee como un acierto. Por eso hay un umbral por
 * zona y no uno global.
 */

import { describe, expect, it } from 'vitest'
import fixture from '../__fixtures__/sqm-noche.json'
import {
  ISLAND_DARK_SKY,
  MOON_MODEL_BIAS,
  magArcsec2,
  modelledSkyGlow,
  nanoLamberts,
  twilightExcess,
} from './skyglow'
import { extinctionCoefficient, limitingMagnitude, visibleCount } from './visibility'

interface Row {
  station: string
  site: string
  elevationM: number
  at: string
  sqm: number
  sunElevationDeg: number
  moonElevationDeg: number
  moonIllumination: number
  moonZenithSeparationDeg: number
}

const rows = fixture as Row[]

/**
 * El cielo oscuro propio de cada estación del fixture, percentil 90 de sus
 * lecturas con el sol bajo −18° y la luna puesta. Se mide aquí en vez de
 * escribirlo a mano para que la prueba siga valiendo si se regenera el fixture.
 */
function darkSkyOf(station: string): number {
  const own = rows
    .filter(
      (r) =>
        r.station === station && r.sunElevationDeg < -18 && r.moonElevationDeg < 0,
    )
    .map((r) => r.sqm)
    .sort((a, b) => a - b)
  return own[Math.floor(own.length * 0.9)]
}

function modelFor(r: Row): number {
  return modelledSkyGlow({
    sunElevationDeg: r.sunElevationDeg,
    moon:
      r.moonElevationDeg > 0
        ? {
            illumination: r.moonIllumination,
            elevationDeg: r.moonElevationDeg,
          }
        : null,
    moonSeparationDeg: r.moonZenithSeparationDeg,
    skyElevationDeg: 90,
    darkSky: darkSkyOf(r.station),
    extinctionK: extinctionCoefficient(r.elevationM),
  })
}

function errors(subset: Row[]): { mean: number; worst: number; n: number } {
  const e = subset.map((r) => Math.abs(modelFor(r) - r.sqm))
  return {
    mean: e.reduce((a, b) => a + b, 0) / e.length,
    worst: Math.max(...e),
    n: e.length,
  }
}

describe('brillo del fondo de cielo', () => {
  it('acierta la noche cerrada sin luna', () => {
    const night = rows.filter(
      (r) => r.sunElevationDeg < -18 && r.moonElevationDeg < 0,
    )
    expect(night.length).toBeGreaterThan(80)
    const { mean, worst } = errors(night)
    // Aquí el modelo casi no hace nada: devuelve la base de la estación. El
    // error MEDIDO —0,188 mag de media, 0,57 en el peor caso sobre las 112
    // lecturas— es la variabilidad propia del cielo de una noche: airglow,
    // cirros altos y la Vía Láctea pasando por el cenit, que sube el fondo
    // medio punto largo cuando cruza. Los dos lados: 0,3 deja sitio a esa
    // variabilidad real —bajarlo a 0,2 haría fallar la prueba por culpa del
    // cielo y no del código— y no deja pasar una base desplazada medio punto,
    // que es el fallo que tiene que cazar.
    expect(mean).toBeLessThan(0.3)
    expect(worst).toBeLessThan(1.0)
  })

  it('acierta el crepúsculo, que es donde el cielo cambia 1,1 mag por grado', () => {
    const dusk = rows.filter(
      (r) =>
        r.sunElevationDeg > -16 && r.sunElevationDeg < -3 && r.moonElevationDeg < 0,
    )
    expect(dusk.length).toBeGreaterThan(10)
    const { mean, worst } = errors(dusk)
    // Medido: 0,252 de media, 0,57 en el peor caso. En esta zona el cielo se
    // mueve 1,1 mag por grado de sol, o sea que medio punto de error son menos
    // de treinta segundos de reloj. El umbral en 0,4/1,2 caza una pendiente
    // equivocada —que daría varias magnitudes en los extremos del rango— sin
    // exigirle al ajuste de dos parámetros una precisión que no tiene.
    expect(mean).toBeLessThan(0.4)
    expect(worst).toBeLessThan(1.2)
  })

  it('con la luna alta ya no arrastra el sesgo que arrastraba', () => {
    const moonlit = rows.filter(
      (r) => r.sunElevationDeg < -18 && r.moonElevationDeg > 10,
    )
    expect(moonlit.length).toBeGreaterThan(5)
    // AQUÍ PONÍA QUE EL SESGO ERA DE 0,64 MAG Y QUE SE DECLARABA SIN CORREGIR,
    // a la espera de una lunación entera de archivo para poder corregirlo bien.
    // Esa lunación se bajó —203 918 lecturas, `scripts/checks/luna-sesgo.ts`—,
    // enseñó que el sesgo CRECE CON LA FASE y que un factor de 3 sobre el flujo
    // lunar lo aplana en todas ellas. Ver `MOON_SCATTER_FACTOR`.
    //
    // Sobre este fixture de dos noches con la luna al 29-39 %, el sesgo baja de
    // 0,64 a 0,13. Los dos lados: por arriba, 0,4 caza que alguien quite la
    // calibración —volvería a 0,64—; por abajo, −0,4 caza que alguien la suba
    // de más. Sin las dos cotas, esta prueba pasaría con el modelo roto en
    // cualquiera de las dos direcciones.
    const signed = moonlit.map((r) => modelFor(r) - r.sqm).sort((a, b) => a - b)
    const median = signed[signed.length >> 1]
    expect(median).toBeLessThan(0.4)
    expect(median).toBeGreaterThan(-0.4)
    // Y el residuo declarado sigue siendo el que dice la constante, medido
    // sobre la lunación y no sobre estas dos noches.
    expect(Math.abs(MOON_MODEL_BIAS)).toBeLessThan(0.1)
    const { worst } = errors(moonlit)
    expect(worst).toBeLessThan(1.3)
  })

  it('la luna nueva no aclara el cielo', () => {
    // La contraprueba del error que costó descubrir el sesgo: una corrección
    // aplicada al cielo ENTERO en vez de al término lunar daba un cielo 0,6 mag
    // más claro con la luna nueva a 45°, que no ilumina nada.
    const dark = modelledSkyGlow({
      sunElevationDeg: -30,
      moon: null,
      moonSeparationDeg: 90,
      skyElevationDeg: 90,
      extinctionK: 0.15,
    })
    const newMoon = modelledSkyGlow({
      sunElevationDeg: -30,
      moon: { illumination: 0, elevationDeg: 45 },
      moonSeparationDeg: 45,
      skyElevationDeg: 90,
      extinctionK: 0.15,
    })
    expect(Math.abs(newMoon - dark)).toBeLessThan(0.05)
    // Y la llena sí, mucho: tres magnitudes largas de cielo.
    const full = modelledSkyGlow({
      sunElevationDeg: -30,
      moon: { illumination: 1, elevationDeg: 45 },
      moonSeparationDeg: 45,
      skyElevationDeg: 90,
      extinctionK: 0.15,
    })
    expect(dark - full).toBeGreaterThan(2.5)
    // ESTA COTA ERA LA BIBLIOGRAFÍA Y AHORA ES LA RED. Antes exigía 17,5-18,5
    // mag/arcsec², «el valor de un sitio oscuro con luna llena que publica la
    // bibliografía», y con ese número se descartó la calibración lunar durante
    // dos meses. Medido sobre 987 lecturas con la luna llena por encima de 40°
    // en los seis sitios oscuros de la isla, lo que los fotómetros del Cabildo
    // miden es **16,18 - 17,26, mediana 16,62**: el cielo de La Palma con luna
    // llena es más de una magnitud más claro que el sitio oscuro de manual.
    //
    // Se comprueba contra lo que mide la red de esta isla y no contra lo que
    // publica un artículo sobre otra. Las dos orillas: por debajo de 15,5 el
    // modelo estaría inventando una luna que ciega, y por encima de 17,5
    // estaría otra vez donde estaba, prediciendo un cielo que aquí no se da.
    expect(full).toBeGreaterThan(15.5)
    expect(full).toBeLessThan(17.5)
  })

  it('el crepúsculo se suma en flujo, no en magnitudes', () => {
    // La comprobación de unidades que costó un error real: el ajuste se hizo en
    // flujo `10^(−0,4·V)` y el modelo trabaja en nanolamberts, con un factor
    // 3,4 × 10¹⁰ entre medias. Con las unidades cruzadas, el término del
    // crepúsculo sería diez órdenes de magnitud más pequeño que el cielo oscuro
    // y no movería nada: a −6° del sol el cielo seguiría saliendo a 21,6.
    const dark = nanoLamberts(ISLAND_DARK_SKY)
    expect(twilightExcess(-6)).toBeGreaterThan(dark * 100)
    expect(twilightExcess(-30)).toBeLessThan(dark / 100)
    // Y la suma en flujo tiene que dar un cielo más claro que cualquiera de los
    // dos sumandos por separado, que es lo que una suma de magnitudes no haría.
    const both = magArcsec2(dark + twilightExcess(-8))
    expect(both).toBeLessThan(ISLAND_DARK_SKY)
  })
})

describe('de brillo de fondo a estrellas', () => {
  it('reproduce la tabla de la isla: de 7885 estrellas a 83 en 34 km', () => {
    // Los seis brillos son lecturas reales de la red del Cabildo. Las cuentas de
    // estrellas salen del catálogo generado por `prepare-cielo.ts`, y lo que
    // esta prueba fija es la RELACIÓN, no las cuentas: que el sitio oscuro tenga
    // dos órdenes de magnitud más de estrellas que el iluminado.
    expect(limitingMagnitude(21.52)).toBeCloseTo(6.39, 2)
    expect(limitingMagnitude(21.13)).toBeCloseTo(6.19, 2)
    expect(limitingMagnitude(19.5)).toBeCloseTo(5.14, 2)
    expect(limitingMagnitude(16.19)).toBeCloseTo(2.37, 2)
    // Monótona: más oscuro nunca puede dar menos estrellas.
    for (let s = 15; s < 22; s += 0.25) {
      expect(limitingMagnitude(s + 0.25)).toBeGreaterThan(limitingMagnitude(s))
    }
  })

  it('la extinción pasa por los dos anclajes publicados', () => {
    // Roque de los Muchachos: la mediana de 20 años del Carlsberg Meridian
    // Telescope, k_V = 0,13 (arXiv:1009.4056).
    expect(extinctionCoefficient(2387)).toBeCloseTo(0.13, 2)
    // Nivel del mar: el total con aerosol marino, ~0,25.
    expect(extinctionCoefficient(0)).toBeCloseTo(0.25, 2)
    // Y baja monótonamente con la altura: una estrella se ve mejor desde arriba.
    for (let h = 0; h < 2400; h += 100) {
      expect(extinctionCoefficient(h + 100)).toBeLessThan(extinctionCoefficient(h))
    }
  })

  it('el corte por magnitud es un prefijo del catálogo ordenado', () => {
    const mags = Int16Array.from([-146, 0, 120, 250, 250, 400, 649, 650, 651])
    expect(visibleCount(mags, 6.5)).toBe(8)
    expect(visibleCount(mags, 2.5)).toBe(5)
    // Y el límite NO se redondea: 6,499 deja fuera las de 6,50, que es lo que
    // hacía entrar 63 estrellas de más en el catálogo real.
    expect(visibleCount(mags, 6.499)).toBe(7)
    // −1,46 es Sirio: entra con el límite en −1,0 y no con el límite en −2,0.
    expect(visibleCount(mags, -1)).toBe(1)
    expect(visibleCount(mags, -2)).toBe(0)
    // Por debajo de la más brillante no se dibuja ninguna, y eso es un cielo
    // encapotado, no un fallo.
    expect(visibleCount(mags, -30)).toBe(0)
  })
})
