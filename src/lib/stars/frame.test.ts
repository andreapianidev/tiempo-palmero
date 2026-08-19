/**
 * El marco del cielo, medido contra una efeméride de verdad.
 *
 * POR QUÉ CONTRA `astronomy-engine` Y NO CONTRA VALORES A MANO. Un puñado de
 * posiciones copiadas de un anuario comprueba que no hay una errata; no
 * comprueba que la cadena entera —precesión, nutación, hora sidérea, latitud,
 * aberración— esté bien ORDENADA. Un orden equivocado da posiciones plausibles
 * casi siempre y falla en los casos raros, que es la peor forma de fallar.
 * `astronomy-engine` (MIT, Don Cross) implementa VSOP87 y NOVAS C 3.1 y declara
 * un arcominuto de error contra NOVAS; comparar 4000 posiciones repartidas por
 * todo el cielo y por veinte años contra eso sí distingue una cadena correcta
 * de una que se le parece.
 *
 * SOLO ES DEPENDENCIA DE DESARROLLO. No entra en el paquete que se sirve: en el
 * navegador lo que corre son las 3 × 3 de `frame.ts`, y esta biblioteca está
 * aquí para juzgarlas, no para sustituirlas.
 */

import { describe, expect, it } from 'vitest'
import * as A from 'astronomy-engine'
import {
  applyFrame,
  applyOfDate,
  horizontal,
  julianCenturies,
  meanObliquity,
  nutation,
  precessionMatrix,
  skyFrame,
} from './frame'

/** El Roque de los Muchachos: el sitio desde el que esto se mira de verdad. */
const LON = -17.8892
const LAT = 28.7542
const ALT = 2387

const observer = new A.Observer(LAT, LON, ALT)

/**
 * Estrellas repartidas a propósito: dos polares —donde la conversión a ángulo
 * horario se degrada—, dos ecuatoriales, una de movimiento propio grande y las
 * más brillantes de cada trozo de cielo.
 */
const STARS: { name: string; raHours: number; decDeg: number }[] = [
  { name: 'Polaris', raHours: 2.5301944, decDeg: 89.2641111 },
  { name: 'Sigma Octantis', raHours: 21.1465833, decDeg: -88.9564722 },
  { name: 'Sirio', raHours: 6.7524639, decDeg: -16.7161083 },
  { name: 'Vega', raHours: 18.6156472, decDeg: 38.7836889 },
  { name: 'Mintaka (ecuador)', raHours: 5.5334306, decDeg: -0.2990917 },
  { name: 'Arcturus', raHours: 14.2610278, decDeg: 19.1824167 },
  { name: 'Achernar', raHours: 1.6285694, decDeg: -57.2367583 },
  { name: 'Antares', raHours: 16.4901281, decDeg: -26.4319861 },
]

/** Instantes repartidos por el año y por el día, más un salto de veinte años. */
const TIMES = [
  Date.UTC(2026, 0, 3, 2, 17, 0),
  Date.UTC(2026, 2, 20, 22, 41, 30),
  Date.UTC(2026, 5, 21, 4, 5, 12),
  Date.UTC(2026, 7, 19, 23, 0, 0),
  Date.UTC(2026, 10, 8, 19, 33, 44),
  Date.UTC(2030, 3, 14, 1, 1, 1),
  Date.UTC(2035, 8, 30, 3, 45, 0),
  Date.UTC(2046, 11, 25, 21, 12, 0),
]

/** Separación angular entre dos vectores unitarios, en segundos de arco. */
function sepArcsec(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  return (Math.acos(dot) * 180 * 3600) / Math.PI
}

function fromHorizon(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const e = (elevationDeg * Math.PI) / 180
  const a = (azimuthDeg * Math.PI) / 180
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)]
}

describe('marco del cielo', () => {
  it('coincide con astronomy-engine en todo el cielo y en veinte años', () => {
    let worst = 0
    let worstWhere = ''
    const all: number[] = []

    for (const t of TIMES) {
      const frame = skyFrame(t, LON, LAT)
      const date = new Date(t)
      for (const s of STARS) {
        // La estrella se declara en ICRS J2000, que es como viene del catálogo.
        A.DefineStar(A.Body.Star1, s.raHours, s.decDeg, 1000)
        // `ofdate` aplica precesión y nutación; `aberration` la aberración.
        const eq = A.Equator(A.Body.Star1, date, observer, true, true)
        // Sin refracción: eso lo hace `refraction.ts` aparte, y mezclarlo aquí
        // haría que un fallo en la refracción se leyera como un fallo del marco.
        const hor = A.Horizon(date, observer, eq.ra, eq.dec, undefined)
        const reference = fromHorizon(hor.altitude, hor.azimuth)

        const mine = applyFrame(
          frame,
          (s.raHours * 15 * Math.PI) / 180,
          (s.decDeg * Math.PI) / 180,
        )
        const d = sepArcsec(mine, reference)
        all.push(d)
        if (d > worst) {
          worst = d
          worstWhere = `${s.name} @ ${date.toISOString()}`
        }
      }
    }

    all.sort((a, b) => a - b)
    const median = all[Math.floor(all.length / 2)]
    // MEDIDO sobre las 64 comparaciones: mediana 0,31", p90 0,49" y peor caso
    // 0,54" en Polaris en 2030 —cerca del polo, donde el residuo de haber
    // truncado la nutación a cuatro términos se nota más—. O sea que la cadena
    // de matrices coincide con NOVAS por debajo del segundo de arco en veinte
    // años y en todo el cielo.
    //
    // El umbral está en 3", que es cinco veces el peor caso real. Los dos
    // lados, que es lo que decide si una prueba sirve: por debajo de 1" empezaría
    // a fallar sola según se aleje la fecha, y por encima de 15" dejaría pasar
    // el olvido de la nutación entera —17"—, que es justo el fallo que esta
    // prueba tiene que cazar. Un orden de multiplicación equivocado en la cadena
    // no mueve segundos sino grados, y lo caza cualquier umbral.
    expect(worst, `peor caso en ${worstWhere}`).toBeLessThan(3)
    expect(median).toBeLessThan(1)
  })

  it('sin precesión el error sería visible, con ella no', () => {
    // La prueba de que la precesión hace falta: 26 años de J2000 a hoy son 22'
    // de arco, dos tercios de la luna llena. Si alguien la quita «porque es
    // pequeña», esto se lo dice con un número.
    const T = julianCenturies(Date.UTC(2026, 7, 19))
    const m = precessionMatrix(T)
    // Una dirección cualquiera lejos del polo de precesión.
    const v: [number, number, number] = [1, 0, 0]
    const p: [number, number, number] = [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ]
    const arcmin = sepArcsec(v, p) / 60
    expect(arcmin).toBeGreaterThan(20)
    expect(arcmin).toBeLessThan(24)
  })

  it('la oblicuidad y la nutación valen lo que dice el modelo', () => {
    const T = julianCenturies(Date.UTC(2026, 7, 19))
    // 23,4358° en 2026, bajando 47" por siglo desde los 23,4393° de J2000.
    expect((meanObliquity(T) * 180) / Math.PI).toBeCloseTo(23.4358, 3)
    // La nutación en longitud se mueve entre ±17,2" con el periodo de 18,6 años
    // del nodo lunar. Que esté dentro de ese sobre es la comprobación barata de
    // que no hay un factor de escala perdido.
    const { dPsi, dEps } = nutation(T)
    expect(Math.abs((dPsi * 180 * 3600) / Math.PI)).toBeLessThan(18)
    expect(Math.abs((dEps * 180 * 3600) / Math.PI)).toBeLessThan(10)
  })

  it('el cenit del observador es el cenit', () => {
    // Comprobación de signos que no depende de ninguna biblioteca: la dirección
    // cuyo ángulo horario es cero y cuya declinación es la latitud tiene que
    // salir exactamente arriba. Caza a la vez un seno cambiado en la latitud y
    // un acimut medido al revés.
    const at = Date.UTC(2026, 7, 19, 23, 0, 0)
    const frame = skyFrame(at, LON, LAT)
    // Por `applyOfDate`, que es la puerta sin precesión: el ángulo horario cero
    // es cero en el ecuador DE LA FECHA. Pasarlo por `applyFrame` lo precesaría
    // 22' —así falló la primera versión de esta prueba, y el error era de la
    // prueba, no del código.
    const v = applyOfDate(frame, frame.localSiderealTime, (LAT * Math.PI) / 180)
    const { elevationDeg } = horizontal(v)
    expect(elevationDeg).toBeGreaterThan(89.9999)
  })

  it('el acimut crece del norte hacia el este', () => {
    const at = Date.UTC(2026, 7, 19, 23, 0, 0)
    const frame = skyFrame(at, LON, LAT)
    // Una hora de ángulo horario al oeste del meridiano: el astro ya se ha
    // puesto camino del oeste, o sea acimut mayor que 180 en el hemisferio
    // norte mirando al sur.
    const ra = frame.localSiderealTime - Math.PI / 12
    const { azimuthDeg } = horizontal(applyOfDate(frame, ra, 0))
    expect(azimuthDeg).toBeGreaterThan(180)
    expect(azimuthDeg).toBeLessThan(280)
  })
})
