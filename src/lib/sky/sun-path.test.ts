/**
 * El orto y el ocaso salen escritos en el panel con hora y rumbo, así que se
 * verifican contra un tercero.
 *
 * LAS CIFRAS SON LAS DE OPEN-METEO para 28,65 N 17,86 O, consultadas el 15 de
 * agosto de 2026 (`/v1/forecast?daily=sunrise,sunset&timezone=UTC`), que es el
 * mismo servicio del que la aplicación ya saca el modelo. No es una segunda
 * implementación escrita aquí al lado —eso solo probaría que dos copias del
 * mismo error coinciden— sino un cálculo ajeno.
 *
 * Ellos publican al minuto, así que la tolerancia es un minuto: por debajo de
 * eso no hay nada que comparar.
 */

import { describe, expect, it } from 'vitest'
import { skyVector, sunPosition } from '../sun'
import { RISE_SET_ELEVATION_DEG, sunEvents, sunTrack, TRACK_STEP_MIN } from './sun-path'

const LON = -17.86
const LAT = 28.65
const MINUTE = 60_000

/** Lo que publica Open-Meteo para ese punto, en UTC. */
const REFERENCIA = [
  { dia: '2026-05-14', orto: '06:21', ocaso: '19:54' },
  { dia: '2026-06-21', orto: '06:14', ocaso: '20:12' },
  { dia: '2026-08-15', orto: '06:40', ocaso: '19:51' },
  { dia: '2026-08-30', orto: '06:48', ocaso: '19:35' },
]

const minutosUtc = (ms: number): number => (ms % 86_400_000) / MINUTE
const minutosDe = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

describe('sunEvents', () => {
  for (const { dia, orto, ocaso } of REFERENCIA) {
    it(`da el orto y el ocaso del ${dia} como Open-Meteo`, () => {
      const { sunrise, sunset } = sunEvents(Date.parse(`${dia}T12:00:00Z`), LON, LAT)
      expect(sunrise).not.toBeNull()
      expect(sunset).not.toBeNull()
      expect(Math.abs(minutosUtc(sunrise!.at) - minutosDe(orto))).toBeLessThanOrEqual(1)
      expect(Math.abs(minutosUtc(sunset!.at) - minutosDe(ocaso))).toBeLessThanOrEqual(1)
    })
  }

  it('deja el sol a la altura del orto en el instante del orto', () => {
    // La comprobación que no depende de nadie: sea cual sea la hora que salga,
    // el sol tiene que estar EXACTAMENTE a −0,833° en ella. Si la iteración no
    // convergiera, esto se iría antes que la comparación con Open-Meteo.
    for (const { dia } of REFERENCIA) {
      const { sunrise, sunset } = sunEvents(Date.parse(`${dia}T12:00:00Z`), LON, LAT)
      for (const t of [sunrise!.at, sunset!.at]) {
        const { elevationDeg } = sunPosition(t, LON, LAT)
        expect(Math.abs(elevationDeg - RISE_SET_ELEVATION_DEG)).toBeLessThan(0.01)
      }
    }
  })

  it('pone el tránsito en el punto más alto del día', () => {
    const at = Date.parse('2026-08-15T09:00:00Z')
    const { transitMs, maxElevationDeg } = sunEvents(at, LON, LAT)
    for (let d = -180; d <= 180; d += 5) {
      const e = sunPosition(transitMs + d * MINUTE, LON, LAT).elevationDeg
      expect(e).toBeLessThanOrEqual(maxElevationDeg + 1e-6)
    }
    // 21 de junio: 84,8° es el máximo anual de la isla, el que ya está escrito
    // en `sun.ts`. Que salga aquí es que las dos cuentas siguen siendo la misma.
    const junio = sunEvents(Date.parse('2026-06-21T12:00:00Z'), LON, LAT)
    expect(junio.maxElevationDeg).toBeCloseTo(84.8, 1)
  })

  it('encuentra el tránsito del día aunque se pregunte de madrugada', () => {
    const madrugada = Date.parse('2026-08-15T02:00:00Z')
    const tarde = Date.parse('2026-08-15T14:00:00Z')
    expect(
      Math.abs(sunEvents(madrugada, LON, LAT).transitMs - sunEvents(tarde, LON, LAT).transitMs),
    ).toBeLessThan(MINUTE)
  })

  it('dice por dónde sale y por dónde se pone', () => {
    // 15 de agosto: el sol todavía sale al norte del este. Los dos rumbos son
    // simétricos respecto al eje norte-sur, que es lo que obliga la esfera:
    // acimut del ocaso = 360 − acimut del orto, salvo lo que se mueve la
    // declinación en las trece horas de por medio.
    const { sunrise, sunset } = sunEvents(Date.parse('2026-08-15T12:00:00Z'), LON, LAT)
    expect(sunrise!.azimuthDeg).toBeGreaterThan(70)
    expect(sunrise!.azimuthDeg).toBeLessThan(80)
    expect(sunrise!.azimuthDeg + sunset!.azimuthDeg).toBeCloseTo(360, 0)
  })

  it('sabe decir que no hay orto ni ocaso', () => {
    // Ártico en pleno verano: sol de medianoche. Devolver una hora inventada
    // sería peor que devolver nada.
    const { sunrise, sunset, daylightHours } = sunEvents(
      Date.parse('2026-06-21T12:00:00Z'),
      15,
      78,
    )
    expect(sunrise).toBeNull()
    expect(sunset).toBeNull()
    expect(daylightHours).toBeNull()
  })
})

describe('sunTrack', () => {
  /** Las 15:20 de la isla: a media tarde y sin caer en una hora en punto. */
  const at = Date.parse('2026-08-15T14:20:00Z')

  it('empieza y acaba en el horizonte', () => {
    const track = sunTrack(at, LON, LAT)
    expect(track.length).toBeGreaterThan(30)
    for (const extremo of [track[0], track[track.length - 1]]) {
      expect(Math.abs(extremo.elevationDeg - RISE_SET_ELEVATION_DEG)).toBeLessThan(0.01)
    }
    // Sale por el este y se pone por el oeste, que es lo mínimo que se le pide
    // a un camino del sol y lo que delataría un signo cambiado en el acimut.
    expect(track[0].azimuthDeg).toBeLessThan(180)
    expect(track[track.length - 1].azimuthDeg).toBeGreaterThan(180)
  })

  it('marca las horas en punto del reloj de la isla', () => {
    const horas = sunTrack(at, LON, LAT).filter((p) => p.mark === 'hour')
    // 15 de agosto: 13 h 10 min de luz, o sea trece horas en punto dentro.
    expect(horas).toHaveLength(13)
    for (const h of horas) {
      // Agosto: Canarias en UTC+1, así que la hora en punto local cae a y cero
      // en UTC menos una hora. Se comprueba sobre el propio instante para que
      // el día que cambie el huso esto se queje.
      const local = new Date(h.at + 3_600_000)
      expect(local.getUTCMinutes()).toBe(0)
      expect(local.getUTCSeconds()).toBe(0)
    }
  })

  it('pone la marca de ahora solo con el sol fuera', () => {
    const dia = sunTrack(at, LON, LAT).filter((p) => p.mark === 'now')
    expect(dia).toHaveLength(1)
    expect(Math.abs(dia[0].at - at)).toBeLessThan(MINUTE)

    const noche = sunTrack(Date.parse('2026-08-15T03:00:00Z'), LON, LAT)
    expect(noche.filter((p) => p.mark === 'now')).toHaveLength(0)
    // Y el camino se dibuja igual: de noche es la única manera de ver por dónde
    // va a salir el sol dentro de tres horas.
    expect(noche.length).toBeGreaterThan(30)
  })

  it('gana la marca de ahora cuando cae en una hora en punto', () => {
    // Canarias va una hora justa por delante en verano, así que las horas en
    // punto locales son horas en punto UTC: preguntar a y cero pone las dos
    // marcas en el mismo instante. Sin un orden entre ellas, el cursor
    // desaparecía justo a en punto —una vez cada hora—.
    const enPunto = sunTrack(Date.parse('2026-08-15T14:00:00Z'), LON, LAT)
    expect(enPunto.filter((p) => p.mark === 'now')).toHaveLength(1)
    expect(enPunto.filter((p) => p.mark !== 'none')).toHaveLength(13)
  })

  it('no deja dos muestras pegadas', () => {
    // Una hora en punto o el instante de ahora pueden caer encima de un punto
    // de paso. Un segmento de tres segundos de largo no se ve y sí deja la
    // normal del grosor apuntando a cualquier sitio.
    const track = sunTrack(at, LON, LAT)
    for (let i = 1; i < track.length; i++) {
      expect(track[i].at - track[i - 1].at).toBeGreaterThanOrEqual(MINUTE)
    }
  })

  it('se separa del arco de verdad menos de un píxel', () => {
    // La medida que fija `TRACK_STEP_MIN`. El 21 de junio, el día más largo:
    // 0,020° con el paso de 20 minutos, contra un muestreo de un minuto. Con
    // 24 píxeles por grado —36,87° de campo de visión en 900 px— son 0,5 px.
    // A 30 minutos serían 0,045° (1,1 px) y a 60, 0,180° (4,4 px).
    const track = sunTrack(Date.parse('2026-06-21T12:00:00Z'), LON, LAT)
    let peor = 0
    for (let i = 0; i < track.length - 1; i++) {
      const a = skyVector(track[i])
      const b = skyVector(track[i + 1])
      for (let t = track[i].at; t <= track[i + 1].at; t += MINUTE) {
        peor = Math.max(peor, separacionDeg(skyVector(sunPosition(t, LON, LAT)), a, b))
      }
    }
    expect(peor).toBeLessThan(1 / 24)
    expect(TRACK_STEP_MIN).toBe(20)
  })
})

/** Cuánto se aparta una dirección del segmento de cuerda a–b, en grados. */
function separacionDeg(
  v: [number, number, number],
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dot = (p: number[], q: number[]): number => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const s = Math.max(0, Math.min(1, dot([v[0] - a[0], v[1] - a[1], v[2] - a[2]], ab) / dot(ab, ab)))
  const p = [a[0] + s * ab[0], a[1] + s * ab[1], a[2] + s * ab[2]]
  const n = Math.hypot(p[0], p[1], p[2])
  const cos = Math.max(-1, Math.min(1, dot(v, [p[0] / n, p[1] / n, p[2] / n])))
  return (Math.acos(cos) * 180) / Math.PI
}
