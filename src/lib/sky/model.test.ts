import { describe, expect, it } from 'vitest'
import { ISLAND_BBOX, MAP_BBOX } from '../geo'
import { decodeSkySample, parseModelTime, skyGridPoints } from './model'

/** Un bloque `current` completo, como el que devuelve la API. */
const full = {
  time: '2026-08-15T08:30',
  cloud_cover_low: 72,
  cloud_cover_mid: 10,
  cloud_cover_high: 0,
  precipitation: 0.4,
  is_day: 1,
  wind_speed_900hPa: 5.35,
  wind_direction_900hPa: 44,
  wind_speed_700hPa: 6.23,
  wind_direction_700hPa: 275,
  wind_speed_300hPa: 6.44,
  wind_direction_300hPa: 21,
}

describe('rejilla del cielo', () => {
  it('pide 70 puntos: 54 sobre la isla y 16 sobre el mar', () => {
    const points = skyGridPoints()
    expect(points).toHaveLength(70)
    // Y todos caben en lo que admite el proxy.
    expect(points.length).toBeLessThanOrEqual(128)
  })

  it('los 54 finos caen dentro de la isla y los 16 del anillo, en el borde', () => {
    const points = skyGridPoints()
    const inside = points.filter(
      (p) =>
        p.lon > ISLAND_BBOX.west &&
        p.lon < ISLAND_BBOX.east &&
        p.lat > ISLAND_BBOX.south &&
        p.lat < ISLAND_BBOX.north,
    )
    expect(inside).toHaveLength(54)
    // Ninguno se sale del rectángulo del mapa, que es donde se dibuja.
    for (const p of points) {
      expect(p.lon).toBeGreaterThanOrEqual(MAP_BBOX.west)
      expect(p.lon).toBeLessThanOrEqual(MAP_BBOX.east)
      expect(p.lat).toBeGreaterThanOrEqual(MAP_BBOX.south)
      expect(p.lat).toBeLessThanOrEqual(MAP_BBOX.north)
    }
  })
})

describe('decodificar una muestra', () => {
  it('lee los tres estratos, la lluvia y el viento de cada nivel', () => {
    const s = decodeSkySample(full, -17.86, 28.66)!
    expect(s.low).toBe(72)
    expect(s.mid).toBe(10)
    expect(s.high).toBe(0)
    expect(s.precipMm).toBeCloseTo(0.4)
    // 900 hPa: 5,35 m/s del 44°. Viene DEL noreste, así que empuja hacia el
    // suroeste: la componente este es negativa y la norte también.
    expect(s.wind.low.u).toBeLessThan(0)
    expect(s.wind.low.v).toBeLessThan(0)
    // 700 hPa: del 275°, o sea del oeste. Empuja hacia el este.
    expect(s.wind.mid.u).toBeGreaterThan(0)
  })

  it('descarta la muestra si le falta cualquiera de los tres estratos', () => {
    // Un estrato a `null` interpolado con los enteros de al lado abriría un
    // agujero de cielo despejado donde el modelo no ha dicho nada, y un agujero
    // se lee como una afirmación.
    for (const key of ['cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high']) {
      const partial = { ...full, [key]: undefined }
      expect(decodeSkySample(partial, -17.86, 28.66)).toBeNull()
    }
  })

  it('acepta la muestra sin lluvia: su ausencia y su cero dicen lo mismo', () => {
    const s = decodeSkySample({ ...full, precipitation: undefined }, -17.86, 28.66)
    expect(s).not.toBeNull()
    expect(s!.precipMm).toBe(0)
  })

  it('sin viento de un nivel deja ese estrato en calma, no a la deriva', () => {
    // Una velocidad sin dirección no dice hacia dónde empuja. Suponerle el
    // norte movería la nube hacia un sitio inventado; la calma se ve como lo
    // que es —una nube quieta— y no afirma nada.
    const s = decodeSkySample(
      { ...full, wind_direction_700hPa: undefined },
      -17.86,
      28.66,
    )!
    expect(s.wind.mid).toEqual({ u: 0, v: 0 })
    // Y no contagia a los otros niveles.
    expect(s.wind.low.u).not.toBe(0)
  })

  it('recorta los porcentajes fuera de rango en vez de propagarlos', () => {
    const s = decodeSkySample({ ...full, cloud_cover_low: 140 }, -17.86, 28.66)!
    expect(s.low).toBe(100)
  })
})

describe('hora de la pasada', () => {
  it('lee la hora del modelo como UTC aunque no traiga sufijo', () => {
    // Sin la Z el navegador la leería como hora local, y en Canarias eso es una
    // hora de desfase en verano: la escena diría que es del mediodía cuando es
    // de las once.
    expect(parseModelTime('2026-08-15T08:30')).toBe(Date.parse('2026-08-15T08:30:00Z'))
  })

  it('devuelve NaN sin hora, para que la muestra se descarte', () => {
    expect(parseModelTime(undefined)).toBeNaN()
    expect(parseModelTime('mañana')).toBeNaN()
  })
})
