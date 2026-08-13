import { describe, expect, it } from 'vitest'
import { DOT, GAP_X, RANK, pillRank, place, type DeclutterItem } from './declutter'

/** Una pastilla de estación de tamaño real (34–48 px de ancho, 18 de alto). */
const pill = (x: number, y: number, rank = pillRank(500, 1560)): DeclutterItem => ({
  rank,
  collapsible: true,
  box: { x, y, w: 44, h: 18 },
})

/** Un triángulo de cámara: pequeño, y nunca encogible. */
const fire = (x: number, y: number, alert: boolean): DeclutterItem => ({
  rank: alert ? RANK.fireAlert : RANK.fireQuiet,
  collapsible: false,
  box: { x, y, w: 18, h: 18 },
})

const placeLabel = (x: number, y: number, major: boolean): DeclutterItem => ({
  rank: major ? RANK.placeMajor : RANK.placeMinor,
  collapsible: false,
  box: { x, y, w: 90, h: 14 },
})

describe('reparto del sitio en el mapa', () => {
  it('devuelve una respuesta por elemento y en el orden de entrada', () => {
    const r = place([pill(0, 0), pill(500, 500), pill(1000, 1000)])
    expect(r).toEqual(['full', 'full', 'full'])
  })

  it('lo que no se pisa se queda entero', () => {
    expect(place([pill(0, 0), fire(400, 400, true)])).toEqual(['full', 'full'])
  })

  /**
   * LA REGRESIÓN DEL 13 DE AGOSTO DE 2026.
   *
   * Una cámara con aviso cayó justo sobre la pastilla de LasTricias y, como no
   * entraba en el reparto, se dibujó encima: «29,1°» se leía «29▲1°». El aviso
   * quedaba camuflado de coma decimal.
   */
  it('un aviso de incendio encima de una pastilla: gana el aviso y la pastilla se aparta', () => {
    const [avisoSolo, pastilla] = place([fire(300, 300, true), pill(300, 300)])
    expect(avisoSolo).toBe('full')
    expect(pastilla).not.toBe('full')
  })

  it('da igual el orden en que lleguen: manda el rango, no la posición en la lista', () => {
    const [pastilla, aviso] = place([pill(300, 300), fire(300, 300, true)])
    expect(aviso).toBe('full')
    expect(pastilla).not.toBe('full')
  })

  it('una cámara SIN aviso no le quita el sitio a una temperatura', () => {
    const [pastilla, camara] = place([pill(300, 300), fire(300, 300, false)])
    expect(pastilla).toBe('full')
    expect(camara).toBe('hidden')
  })

  it('un aviso de incendio gana incluso al nombre de la capital', () => {
    const [nombre, aviso] = place([placeLabel(300, 300, true), fire(300, 300, true)])
    expect(aviso).toBe('full')
    expect(nombre).toBe('hidden')
  })

  it('el dato manda sobre el topónimo menor, y el mayor sobre el dato', () => {
    const [menor, pastilla] = place([placeLabel(300, 300, false), pill(300, 300)])
    expect(pastilla).toBe('full')
    expect(menor).toBe('hidden')

    const [mayor, pastilla2] = place([placeLabel(700, 700, true), pill(700, 700)])
    expect(mayor).toBe('full')
    expect(pastilla2).not.toBe('full')
  })

  it('entre pastillas gana la más alta', () => {
    const alta = pill(300, 300, pillRank(1560, 1560))
    const baja = pill(300, 300, pillRank(5, 1560))
    const [a, b] = place([baja, alta])
    expect(b).toBe('full')
    expect(a).not.toBe('full')
  })

  it('una pastilla tapada se encoge a punto si el punto cabe, y solo entonces', () => {
    // A 30 px el rectángulo de 44 se pisa (44/2+44/2+3 = 47) pero el punto de
    // 12 no llega a tocar al vecino entero: 44/2+12/2+3 = 31 > 30, así que aún
    // choca. A 34 px ya cabe.
    const [, justo] = place([pill(0, 0), pill(34, 0)])
    expect(justo).toBe('dot')

    const [, encima] = place([pill(0, 0), pill(0, 0)])
    expect(encima).toBe('hidden')
  })

  it('dos puntos en el mismo sitio son un punto: el segundo desaparece', () => {
    const r = place([pill(0, 0), pill(34, 0), pill(34, 0)])
    expect(r).toEqual(['full', 'dot', 'hidden'])
  })

  it('la holgura cuenta: pegadas al ras se consideran solapadas', () => {
    const sinHolgura = 44 // exactamente w/2 + w/2
    const [, alRas] = place([pill(0, 0), pill(sinHolgura, 0)])
    expect(alRas).toBe('dot')
    const [, conHolgura] = place([pill(0, 0), pill(sinHolgura + GAP_X, 0)])
    expect(conHolgura).toBe('full')
  })

  it('el rango de una pastilla siempre cae entre el topónimo mayor y el menor', () => {
    for (let z = 0; z <= 2426; z += 1) {
      const r = pillRank(z, 2426)
      expect(r).toBeGreaterThan(RANK.placeMajor)
      expect(r).toBeLessThan(RANK.placeMinor)
    }
  })

  it('y siempre por delante de una cámara sin aviso', () => {
    expect(pillRank(0, 2426)).toBeLessThan(RANK.fireQuiet)
  })

  it('prioridad 0 y máximo 0 no rompen el rango', () => {
    expect(Number.isFinite(pillRank(0, 0))).toBe(true)
    expect(pillRank(0, 0)).toBeLessThan(RANK.placeMinor)
  })

  it('el punto al que se encoge una pastilla es más pequeño que ella', () => {
    expect(DOT).toBeLessThan(44)
  })
})
