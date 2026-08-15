import { describe, expect, it } from 'vitest'
import { skyDome } from './sky-dome'
import { SKY } from './terrain'
import { oceanLight } from './ocean/light'
import { sunPosition } from './sun'

const LON = -17.86
const LAT = 28.66
/** Cielo raso y sin calima: la geometría sola, que es lo que se quiere probar. */
const CLEAR = { pm10: null, solarWm2: null }

const domeAt = (at: number) =>
  skyDome(oceanLight(at, LON, LAT, CLEAR), sunPosition(at, LON, LAT))

const rgb = (hex: string) =>
  [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16))

/** El instante del día en que el sol pasa más cerca de una altura dada. */
function whenSunIs(day: number, targetDeg: number, morning: boolean): number {
  let best = day
  let bestErr = Infinity
  const from = morning ? 0 : 12 * 60
  const to = morning ? 12 * 60 : 24 * 60
  for (let m = from; m < to; m++) {
    const at = day + m * 60_000
    const err = Math.abs(sunPosition(at, LON, LAT).elevationDeg - targetDeg)
    if (err < bestErr) {
      bestErr = err
      best = at
    }
  }
  return best
}

const AUGUST = Date.UTC(2026, 7, 15)

describe('la cúpula del cielo', () => {
  it('de noche es exactamente el cielo de casa', () => {
    // El suelo de legibilidad: el horizonte tiene que separarse del mar para que
    // la silueta de la isla se lea, y de noche el cielo físico —el que refleja
    // el agua— es más oscuro que eso. Manda el color de casa, y sin aproximarse:
    // idéntico, o encender el interruptor cambiaría el mapa a medianoche.
    const midnight = domeAt(Date.UTC(2026, 7, 15, 2, 0))
    expect(midnight['sky-color']).toBe(SKY['sky-color'])
    expect(midnight['horizon-color']).toBe(SKY['horizon-color'])
    expect(midnight['fog-color']).toBe(SKY['fog-color'])
  })

  it('no toca la geometría de la bruma', () => {
    // `fog-ground-blend` y `horizon-fog-blend` dicen CUÁNTO se funde la ladera
    // lejana con el cielo, y eso es la distancia que hay, no la hora que es.
    const noon = domeAt(whenSunIs(AUGUST, 70, false))
    expect(noon['fog-ground-blend']).toBe(SKY['fog-ground-blend'])
    expect(noon['horizon-fog-blend']).toBe(SKY['horizon-fog-blend'])
    expect(noon['sky-horizon-blend']).toBe(SKY['sky-horizon-blend'])
  })

  it('de día el cenit es azul y más oscuro que el horizonte', () => {
    // Lo que hace que un cielo se lea como cielo: el azul se concentra arriba y
    // el horizonte se lava. Al revés —cenit claro, horizonte oscuro— es un
    // degradado de fondo de pantalla, no aire.
    const noon = domeAt(whenSunIs(AUGUST, 70, false))
    const zenith = rgb(noon['sky-color'] as string)
    const horizon = rgb(noon['horizon-color'] as string)
    expect(zenith[2]).toBeGreaterThan(zenith[0])
    const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    expect(lum(horizon)).toBeGreaterThan(lum(zenith))
  })

  it('al atardecer el horizonte se calienta y el cenit no', () => {
    // Es la razón de ser de todo esto. Con el sol rasante el rayo cruza treinta
    // veces más atmósfera, el azul se queda por el camino y lo que llega al
    // horizonte es rojo; el cenit, que se mira a través de una sola atmósfera,
    // sigue siendo azul. Eso es lo que separa un atardecer de un mediodía
    // apagado, y lo que la cúpula fija no podía hacer.
    const dusk = domeAt(whenSunIs(AUGUST, 2, false))
    const horizon = rgb(dusk['horizon-color'] as string)
    const zenith = rgb(dusk['sky-color'] as string)
    expect(horizon[0]).toBeGreaterThan(horizon[2])
    expect(zenith[2]).toBeGreaterThan(zenith[0])

    // Y a mediodía no: el horizonte de un mediodía no es naranja.
    const noon = rgb(domeAt(whenSunIs(AUGUST, 70, false))['horizon-color'] as string)
    expect(noon[2]).toBeGreaterThan(noon[0])
  })

  it('la bruma converge al color del horizonte cuando hay día', () => {
    // La perspectiva aérea no tiene color propio: una cumbre infinitamente
    // lejana se ve del color del cielo que tiene detrás. Con el día hecho, los
    // dos colores son el mismo y la ladera se funde por donde le toca.
    const noon = domeAt(whenSunIs(AUGUST, 70, false))
    expect(noon['fog-color']).toBe(noon['horizon-color'])
  })

  it('el amanecer no da un salto: es la trampa que ya cazó al relieve', () => {
    // `terrain-light.ts` tuvo exactamente este fallo —dos ramas, día y noche,
    // que no coincidían en el borde— y lo cazó una prueba que recorría el orto
    // minuto a minuto. Aquí la mezcla también es continua por construcción, y
    // esto es lo que lo vigila: medio cielo cambiando de color de golpe se ve.
    const dawn = whenSunIs(AUGUST, 0, true)
    let worst = 0
    for (let m = -90; m <= 90; m++) {
      const a = rgb(domeAt(dawn + m * 60_000)['horizon-color'] as string)
      const b = rgb(domeAt(dawn + (m + 1) * 60_000)['horizon-color'] as string)
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(a[c] - b[c]))
    }
    // Medido sobre el orto del 15 de agosto de 2026, en la ventana de ±2 h y
    // minuto a minuto: **máximo 5 niveles de 255, p95 4, mediana 0**, y el
    // perfil sube y baja suave —0, 2, 3, 4, 5, 3, 1, 0— sin un solo pico
    // aislado. Seis es el tope con margen sobre esa medida, y discrimina de
    // sobra lo que se busca: la rama que se quiere evitar sería saltar del
    // horizonte de casa al físico, que son 45 niveles de golpe.
    expect(worst).toBeLessThanOrEqual(6)
  })

  it('la calima lava el cielo, y con la medida real', () => {
    // El PM10 no es un adorno del mar: con calima cerrada el cielo deja de ser
    // azul y se vuelve lechoso y dorado, y el de la vista 3D tiene que hacer lo
    // mismo que el que el agua refleja, porque es el mismo cielo.
    const at = whenSunIs(AUGUST, 40, false)
    const sun = sunPosition(at, LON, LAT)
    const clean = skyDome(oceanLight(at, LON, LAT, CLEAR), sun)
    const dust = skyDome(
      oceanLight(at, LON, LAT, { pm10: 300, solarWm2: null }),
      sun,
    )
    const cleanZ = rgb(clean['sky-color'] as string)
    const dustZ = rgb(dust['sky-color'] as string)
    // Menos azul y más rojo: el cielo pierde el color y gana el del polvo.
    expect(dustZ[0]).toBeGreaterThan(cleanZ[0])
    expect(dustZ[2] - dustZ[0]).toBeLessThan(cleanZ[2] - cleanZ[0])
  })
})
