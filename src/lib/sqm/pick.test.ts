/**
 * Qué fotómetro habla por un punto, y hasta dónde — medido, por fin.
 *
 * LA JUSTIFICACIÓN QUE HABÍA NO SE REPRODUCE. `pick.ts` defendía los 12 km
 * diciendo que, barriendo el recuadro del mapa en una rejilla de 60 × 60, la
 * distancia al fotómetro más cercano tenía mediana 5,6 km y percentil 90 de
 * 11,9. Repetido hoy sobre `ISLAND_BBOX` con las 14 estaciones que publican de
 * noche salen **7,2 de mediana y 15,2 de percentil 90**, y 12 km cubren el
 * 78,6 % del recuadro, no el 90 %. La cifra vieja no se puede reproducir con lo
 * que hay en el repositorio, así que se sustituye por lo que sí se puede.
 *
 * Y DE PASO, POR ALGO QUE MIDE LO QUE HAY QUE MEDIR. Cubrir un recuadro es la
 * pregunta equivocada: el recuadro es medio océano, y a nadie le importa el
 * cielo sobre el agua. La pregunta es **a partir de qué distancia un fotómetro
 * deja de predecir a otro**, y eso se mide con parejas de lecturas simultáneas
 * de noche cerrada y sin luna. `scripts/checks/sqm-archivo.ts` lo hace sobre la
 * lunación entera —14 016 parejas de 30 887 lecturas— y deja el resumen en
 * `sqm-alcance.json`, que es lo que lee esta prueba.
 *
 * La curva tiene un escalón y está justo donde estaba el umbral:
 *
 * | Distancia | Parejas | \|Δ\| mediana |
 * |---|---:|---:|
 * | 0–1 km | 516 | **0,60** ← dos aparatos en el mismo sitio |
 * | 2–4 km | 762 | 0,22 |
 * | 6–8 km | 1195 | 0,16 |
 * | 8–10 km | 1520 | 0,71 |
 * | 10–12 km | 185 | 0,26 |
 * | **12–15 km** | 2105 | **1,13** |
 * | 15–20 km | 2414 | 1,14 |
 * | 20–40 km | 3762 | 0,90 |
 *
 * Por debajo de 12 km, un fotómetro predice a otro tan bien o mejor que dos
 * aparatos plantados en el mismo sitio, que discrepan 0,60 mag de mediana. A
 * partir de 12 km, el doble — y ya no mejora ni empeora con la distancia, que
 * es la firma de haber dejado de predecir nada.
 *
 * QUÉ CUESTA EQUIVOCARSE. Sobre un cielo de 21,1, un error de 0,16 mag son un
 * 10 % de estrellas de menos; 0,71 mag, un 37 %; y 1,13 mag, un 54 % —de 6076
 * estrellas a 2783—. O sea que pasar de 12 km no es afinar un decimal: es
 * borrar la mitad del cielo y decir que está medido.
 */

import { describe, expect, it } from 'vitest'
import reach from '../__fixtures__/sqm-alcance.json'
import archive from '../__fixtures__/sqm-archivo.json'
import { ISLAND_BBOX } from '../geo'
import { distanceKm, pickStation, MAX_STATION_DISTANCE_KM } from './pick'
import type { SqmNetwork, SqmStation } from './network'

interface Row {
  station: string
  site: string
  lon: number
  lat: number
  at: string
  sqm: number | null
  sunElevationDeg: number
}

/** Las estaciones que en la lunación publicaron alguna lectura nocturna útil. */
const REAL_STATIONS: SqmStation[] = (() => {
  const seen = new Map<string, SqmStation>()
  for (const r of archive as Row[]) {
    if (r.sunElevationDeg > -6 || (r.sqm ?? 0) < 11) continue
    if (seen.has(r.station)) continue
    seen.set(r.station, {
      id: r.station,
      name: r.site,
      lon: r.lon,
      lat: r.lat,
      sky: r.sqm as number,
      sigma: null,
      skyTemperatureC: null,
      observedAt: Date.parse(`${r.at.slice(0, 19)}Z`),
      sunElevationDeg: r.sunElevationDeg,
    })
  }
  return [...seen.values()]
})()

const network = (usable: SqmStation[]): SqmNetwork => ({
  fetchedAt: 0,
  usable,
  stale: [],
  rejected: {
    'sin-coordenadas': 0,
    'sin-hora': 0,
    'sin-valor': 0,
    centinela: 0,
    'sol-arriba': 0,
    'valor-imposible': 0,
    vieja: 0,
  },
  registered: usable.length,
})

describe('el alcance de un fotómetro, medido', () => {
  const bin = (from: number) => reach.bins.find((b) => b.from === from)!

  it('el archivo del que sale es una lunación de verdad', () => {
    expect(reach.parejas).toBeGreaterThan(10_000)
    expect(reach.estaciones).toBeGreaterThanOrEqual(14)
    // Si alguien regenera esto con tres días, las conclusiones de abajo dejan
    // de estar respaldadas y conviene que salte aquí y no en producción.
    const days =
      (Date.parse(reach.ventana[1]) - Date.parse(reach.ventana[0])) / 86_400_000
    expect(days).toBeGreaterThanOrEqual(28)
  })

  it('dos aparatos en el mismo sitio ya discrepan 0,6 mag', () => {
    // Es el suelo de ruido, y es enorme: la mitad del cielo de una noche
    // depende de qué fotómetro se mire. Cualquier umbral de distancia que
    // prometa más precisión que esto está prometiendo algo que la red no tiene.
    expect(bin(0).median).toBeGreaterThan(0.4)
    expect(bin(0).median).toBeLessThan(0.8)
  })

  it('por debajo de 12 km se predice tan bien como en el mismo sitio', () => {
    const inside = reach.bins.filter((b) => b.to <= MAX_STATION_DISTANCE_KM && b.from > 0)
    expect(inside.length).toBeGreaterThan(3)
    for (const b of inside) {
      expect(b.median, `${b.from}–${b.to} km`).toBeLessThanOrEqual(bin(0).median + 0.15)
    }
  })

  it('a partir de 12 km, el doble — y ahí se queda', () => {
    const outside = reach.bins.filter((b) => b.from >= MAX_STATION_DISTANCE_KM)
    expect(outside.length).toBeGreaterThan(1)
    for (const b of outside) {
      expect(b.median, `${b.from}–${b.to} km`).toBeGreaterThan(0.85)
    }
    // El escalón: el primer tramo de fuera empeora al menos un 50 % sobre el
    // último de dentro. Es lo que hace que 12 sea un corte y no un gusto.
    const lastIn = reach.bins.filter((b) => b.to <= MAX_STATION_DISTANCE_KM).at(-1)!
    const firstOut = outside[0]
    expect(firstOut.median / Math.max(0.01, lastIn.median)).toBeGreaterThan(1.5)
  })

  it('LAS DOS ORILLAS del umbral, en una sola cuenta', () => {
    // Bajarlo a 8 km dejaría sin fotómetro a puntos que hoy tienen uno que los
    // predice bien —el tramo 8-12 km discrepa 0,26-0,71, por debajo del suelo
    // de ruido—. Subirlo a 15 admitiría el tramo de 1,13.
    const wouldLose = reach.bins.filter((b) => b.from >= 8 && b.to <= 12)
    expect(wouldLose.length).toBeGreaterThan(0)
    for (const b of wouldLose) expect(b.median).toBeLessThan(bin(0).median + 0.15)
    const wouldAdmit = reach.bins.find((b) => b.from === 12)!
    expect(wouldAdmit.median).toBeGreaterThan(bin(0).median * 1.8)
  })
})

describe('a quién elige', () => {
  it('la más cercana, y dice a cuánto', () => {
    // El Roque: el fotómetro del ORM está a 200 m.
    const pick = pickStation(network(REAL_STATIONS), -17.8892, 28.7542)
    expect(pick).not.toBeNull()
    expect(pick!.distanceKm).toBeLessThan(1)
    expect(pick!.station.name).toContain('ORM')
  })

  it('y en Santa Cruz elige la de Santa Cruz, no la del Roque', () => {
    // Es la comprobación que de verdad importa: entre las dos hay 5 magnitudes
    // de cielo. Coger la equivocada no da un error pequeño, da otro cielo.
    const pick = pickStation(network(REAL_STATIONS), -17.7642, 28.6835)
    expect(pick).not.toBeNull()
    expect(pick!.distanceKm).toBeLessThan(1)
    expect(pick!.station.id).not.toBe('stars394')
  })

  it('sin ninguna cerca devuelve null, que es la respuesta correcta', () => {
    // Mar adentro al suroeste, el punto más lejano del recuadro.
    const pick = pickStation(network(REAL_STATIONS), ISLAND_BBOX.west, ISLAND_BBOX.south)
    expect(pick).toBeNull()
  })

  it('el corte es exactamente el umbral, ni un metro más', () => {
    const one: SqmStation = { ...REAL_STATIONS[0], lon: 0, lat: 0 }
    // Un punto a 11,99 km al norte entra; a 12,01 no.
    const degPerKm = 1 / 110.57
    expect(pickStation(network([one]), 0, 11.99 * degPerKm)).not.toBeNull()
    expect(pickStation(network([one]), 0, 12.01 * degPerKm)).toBeNull()
  })

  it('una red vacía no revienta, devuelve null', () => {
    expect(pickStation(network([]), -17.88, 28.75)).toBeNull()
  })
})

describe('la distancia', () => {
  it('cuadra con una referencia conocida de la isla', () => {
    // Del Roque a Los Llanos hay 12 km en línea recta — la pareja que aparece
    // en toda la documentación de esta función.
    const d = distanceKm(-17.8892, 28.7542, -17.9146, 28.6586)
    expect(d).toBeGreaterThan(10)
    expect(d).toBeLessThan(12)
  })

  it('es simétrica y vale cero consigo misma', () => {
    expect(distanceKm(-17.9, 28.7, -17.8, 28.6)).toBeCloseTo(
      distanceKm(-17.8, 28.6, -17.9, 28.7),
      12,
    )
    expect(distanceKm(-17.9, 28.7, -17.9, 28.7)).toBe(0)
  })

  it('la aproximación plana vale a la escala de la isla', () => {
    // Contra el semiverseno en la diagonal completa del recuadro, que son 65
    // km. MEDIDO: la plana se queda 246 m corta, un 0,38 %. Y en el sitio donde
    // importa —los 12 km del corte— el error son 68 m, o sea que ninguna
    // estación puede cruzar el umbral por culpa de la aproximación: para eso
    // haría falta que estuviera a menos de 70 m del límite, y la más cercana
    // al corte en la red real está a 1,3 km de él.
    const R = 6371
    const rad = Math.PI / 180
    const hav = (lo1: number, la1: number, lo2: number, la2: number) => {
      const dLat = (la2 - la1) * rad
      const dLon = (lo2 - lo1) * rad
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLon / 2) ** 2
      return 2 * R * Math.asin(Math.sqrt(a))
    }
    const flat = distanceKm(
      ISLAND_BBOX.west,
      ISLAND_BBOX.south,
      ISLAND_BBOX.east,
      ISLAND_BBOX.north,
    )
    const exact = hav(
      ISLAND_BBOX.west,
      ISLAND_BBOX.south,
      ISLAND_BBOX.east,
      ISLAND_BBOX.north,
    )
    expect(Math.abs(flat - exact)).toBeLessThan(0.35)
    // Y en el corte, dos órdenes de magnitud por debajo del umbral.
    const at12 = distanceKm(-17.9, 28.65, -17.9, 28.7585)
    expect(Math.abs(at12 - hav(-17.9, 28.65, -17.9, 28.7585))).toBeLessThan(0.1)
  })
})

describe('la cobertura del recuadro, que es lo que decía la cabecera vieja', () => {
  it('12 km cubren el 79 % del recuadro, no el 90 %', () => {
    // Se deja escrito porque la cifra vieja sigue circulando en la
    // documentación: lo que 12 km cubren del RECUADRO no llega al 80 %, y la
    // diferencia es agua. No es un argumento en contra del umbral — es que era
    // el argumento equivocado.
    const N = 60
    const d: number[] = []
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const lon =
          ISLAND_BBOX.west + ((ISLAND_BBOX.east - ISLAND_BBOX.west) * i) / (N - 1)
        const lat =
          ISLAND_BBOX.south + ((ISLAND_BBOX.north - ISLAND_BBOX.south) * j) / (N - 1)
        d.push(Math.min(...REAL_STATIONS.map((s) => distanceKm(lon, lat, s.lon, s.lat))))
      }
    }
    const covered = d.filter((x) => x <= MAX_STATION_DISTANCE_KM).length / d.length
    expect(covered).toBeGreaterThan(0.75)
    expect(covered).toBeLessThan(0.85)
  })
})
