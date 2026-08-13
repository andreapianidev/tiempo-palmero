/**
 * La cumbre dentro del motor.
 *
 * Los dos lados pesan igual, como en todo lo que decide si un dato se enseña o
 * se tira: estos tests comprueban que la lectura del TNG entra cuando es buena
 * Y que no entra cuando no lo es. Un filtro que solo se prueba por el lado que
 * rechaza acaba rechazándolo todo y nadie se entera.
 *
 * El cuerpo de prueba es la respuesta REAL del TNG del 13 ago 2026 a las 11:43
 * UTC —23,5 °C, 14 % y el rocío con cuatro horas de retraso, que es su estado
 * habitual—, más el fixture de la red del Cabildo para la parte del motor.
 */

import { describe, expect, it } from 'vitest'
import snapshot from './__fixtures__/weather-snapshot.json'
import { decodeRoque } from './roque'
import { SUMMIT_ENTITY_ID, summitLayer, summitStation } from './summit'
import { buildStations, type Station } from './quality'
import { buildModel, estimate } from './interpolate'
import { parseLocation, type CdaRow } from './cabildo'
import { MAX_AGE_H } from './quality'

/** 2026-08-13T11:43:01Z, la lectura con la que se midió todo lo de abajo. */
const T = 1_786_621_381_000

const LIVE = {
  data: {
    temperature: { value: 23.5, epoch: T, outdated: false, level: 'STABLE' },
    humidity: { value: 14.0, epoch: T, outdated: false, level: 'STABLE' },
    // Cuatro horas de retraso y el origen lo dice. Es su estado normal.
    dewpoint: { value: -20.6197642667, epoch: T - 14_400_000, outdated: true, level: 'UNKNOWN' },
    windspeed: { value: 2.2, epoch: T, outdated: false, level: 'STABLE' },
    winddir: { value: 234.0, epoch: T, outdated: false, level: 'STABLE' },
    pressure: { value: 779.1, epoch: T, outdated: false, level: 'STABLE' },
    dust: { value: 2.92, epoch: T, outdated: false, level: 'STABLE' },
    solarimeter: { value: 0.0, epoch: T, outdated: false, level: 'STABLE' },
    seeing: { value: 0.703, epoch: T - 432_000_000, outdated: true, level: 'UNKNOWN' },
  },
}

const parte = (patch: Record<string, unknown> = {}) =>
  decodeRoque({ data: { ...LIVE.data, ...patch } }, T)

describe('summitStation', () => {
  it('monta la estación de la cumbre con la lectura real', () => {
    const s = summitStation(parte(), T)!
    expect(s.entityId).toBe(SUMMIT_ENTITY_ID)
    expect(s.network).toBe('tng')
    expect(s.elevation).toBe(2387)
    expect(s.temperature).toBe(23.5)
    expect(s.relativehumidity).toBe(14)
    // La hora es la de la MEDIDA de temperatura, no la de la descarga.
    expect(s.timeinstant).toBe(T)
    expect(s.ageHours).toBe(0)
  })

  it('convierte el viento de m/s a km/h, que es la unidad de la app', () => {
    // 2,2 m/s son 7,92 km/h. Sin la conversión, la cumbre saldría con un
    // viento flojo permanente y con aspecto de cifra razonable.
    expect(summitStation(parte(), T)!.windspeed).toBeCloseTo(7.92, 5)
  })

  it('reduce la presión de estación al nivel del mar y lo declara', () => {
    const s = summitStation(parte(), T)!
    // 779,1 hPa a 2387 m con aire a 23,5 °C. Sin reducir sería un valor
    // incomparable con el resto de la red, que publica MSLP.
    expect(s.atmosphericpressure).toBeGreaterThan(1000)
    expect(s.atmosphericpressure).toBeLessThan(1035)
    expect(s.pressureWasReduced).toBe(true)
  })

  it('no lee el rocío del origen: lo deja derivar de T y humedad', () => {
    // El campo llega marcado obsoleto casi siempre. `stationReading` lo
    // reconstruye de T y humedad y lo marca como calculado.
    expect(summitStation(parte(), T)!.dewpoint).toBeNull()
  })

  it('no inventa lluvia donde el observatorio no la mide', () => {
    const s = summitStation(parte(), T)!
    expect(s.precipitation).toBeNull()
    expect(s.dailyprecipitation).toBeNull()
  })

  // --- el otro lado: cuándo NO entra --------------------------------------

  it('sin temperatura no hay estación, aunque lleguen los demás campos', () => {
    expect(summitStation(parte({ temperature: undefined }), T)).toBeNull()
  })

  it('respeta el flag `outdated` del propio origen', () => {
    const stale = parte({ temperature: { value: 23.5, epoch: T, outdated: true } })
    expect(summitStation(stale, T)).toBeNull()
  })

  it('caduca con el mismo `MAX_AGE_H` que cualquier estación del Cabildo', () => {
    const justInside = T + MAX_AGE_H * 3_600_000 - 1000
    const justOutside = T + MAX_AGE_H * 3_600_000 + 1000
    expect(summitStation(parte(), justInside)).not.toBeNull()
    expect(summitStation(parte(), justOutside)).toBeNull()
  })

  it('aplica los mismos BOUNDS que la red', () => {
    // 60 °C en la cumbre de La Palma es un sensor, no un día.
    expect(summitStation(parte({ temperature: { value: 60, epoch: T, outdated: false } }), T))
      .toBeNull()
    // Y una helada de −5 °C a 2387 m sí es un día, y tiene que pasar.
    const cold = summitStation(
      parte({ temperature: { value: -5, epoch: T, outdated: false } }),
      T,
    )
    expect(cold?.temperature).toBe(-5)
  })

  it('un campo malo no se lleva por delante a los buenos', () => {
    // Humedad imposible: cae ella sola. La temperatura sigue entrando, que es
    // lo que sostiene la muestra.
    const s = summitStation(parte({ humidity: { value: 140, epoch: T, outdated: false } }), T)!
    expect(s.temperature).toBe(23.5)
    expect(s.relativehumidity).toBeNull()
  })

  it('sin parte no hay estación, y no es un error', () => {
    expect(summitStation(null, T)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// La capa entre el techo de la red y la cumbre
// ---------------------------------------------------------------------------

const station = (over: Partial<Station>): Station =>
  ({
    entityId: 'x',
    name: 'x',
    lon: -17.87,
    lat: 28.7,
    elevation: 1000,
    timeinstant: T,
    ageHours: 0,
    temperature: 20,
    relativehumidity: 50,
    dewpoint: null,
    windspeed: null,
    winddirection: null,
    precipitation: null,
    dailyprecipitation: null,
    atmosphericpressure: null,
    pressureWasReduced: false,
    uv: null,
    solarradiation: null,
    dailyevapotranspiration: null,
    feellikestemperature: null,
    illuminance: null,
    visibility: null,
    raw: {},
    ...over,
  }) as Station

describe('summitLayer', () => {
  it('mide el tramo real entre la estación más alta y la cumbre', () => {
    const summit = summitStation(parte(), T)!
    const layer = summitLayer(
      [
        station({ entityId: 'a', name: 'alta', elevation: 1561, temperature: 29.11, relativehumidity: 12 }),
        station({ entityId: 'b', name: 'baja', elevation: 300, temperature: 27 }),
      ],
      summit,
    )!
    expect(layer.fromElevation).toBe(1561)
    expect(layer.spanM).toBe(826)
    // El caso REAL del 13 ago 2026 a las 11:48 UTC: de 29,11 °C a 1561 m a
    // 23,5 °C a 2387 m son −0,68 K/100 m. Bien mezclado, no una capa estable.
    expect(layer.gradient).toBeCloseTo(-0.679, 2)
    expect(layer.deltaRh).toBe(2)
    expect(layer.subsident).toBe(false)
  })

  it('reconoce una capa subsidente cuando de verdad la hay', () => {
    // Estable Y secándose: los dos requisitos del criterio canario, con los
    // mismos umbrales que `detectInversion` usa sobre el modelo.
    const summit = summitStation(
      parte({
        temperature: { value: 24, epoch: T, outdated: false },
        humidity: { value: 15, epoch: T, outdated: false },
      }),
      T,
    )!
    const layer = summitLayer(
      [station({ elevation: 1500, temperature: 22, relativehumidity: 80 })],
      summit,
    )!
    expect(layer.gradient).toBeGreaterThan(0)
    expect(layer.deltaRh).toBe(-65)
    expect(layer.subsident).toBe(true)
  })

  it('no dice nada si falta cualquiera de los dos extremos', () => {
    expect(summitLayer([station({})], null)).toBeNull()
    expect(summitLayer([], summitStation(parte(), T))).toBeNull()
  })

  it('ignora las estaciones que están por encima de la cumbre', () => {
    // Una coordenada corrupta con 3000 m de altitud no puede ser la base de
    // una capa que va hacia arriba.
    expect(
      summitLayer([station({ elevation: 3000 })], summitStation(parte(), T)),
    ).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Dentro del motor
// ---------------------------------------------------------------------------

describe('la cumbre en buildModel', () => {
  const rows = snapshot.rows as unknown as CdaRow[]

  /** El DEM ya viene muestreado en el fixture, igual que en `interpolate.test`. */
  const at = (lon: number, lat: number): number | null => {
    for (const r of rows) {
      const loc = parseLocation(r.location)
      if (loc && Math.abs(loc[0] - lon) < 1e-9 && Math.abs(loc[1] - lat) < 1e-9) {
        return (r as { _demElevation: number | null })._demElevation
      }
    }
    return null
  }

  const { stations } = buildStations(rows, at, { now: snapshot.capturedAtMs })
  const summit = summitStation(parte(), T)!
  const ceiling = Math.max(...stations.map((s) => s.elevation))

  it('el fixture no llega a la cumbre, que es justo el problema', () => {
    expect(ceiling).toBeLessThan(2000)
  })

  it('entra en el campo y se declara', () => {
    const bare = buildModel(stations, 'temperature')
    const withSummit = buildModel(stations, 'temperature', [], null, null, null, summit)
    expect(bare.summit).toBe(false)
    expect(withSummit.summit).toBe(true)
    expect(withSummit.used.filter((s) => s.source === 'roque')).toHaveLength(1)
  })

  it('NO toca el ajuste: gradiente, R² y σ siguen siendo los del Cabildo', () => {
    const bare = buildModel(stations, 'temperature')
    const withSummit = buildModel(stations, 'temperature', [], null, null, null, summit)
    expect(withSummit.b).toBe(bare.b)
    expect(withSummit.r2).toBe(bare.r2)
    expect(withSummit.sigma).toBe(bare.sigma)
    expect(withSummit.elevationRange).toEqual(bare.elevationRange)
  })

  it('acerca la estimación de la cumbre a lo que la cumbre mide', () => {
    const bare = buildModel(stations, 'temperature')
    const withSummit = buildModel(stations, 'temperature', [], null, null, null, summit)
    const before = estimate(bare, summit.lon, summit.lat, summit.elevation)!
    const after = estimate(withSummit, summit.lon, summit.lat, summit.elevation)!
    const errBefore = Math.abs(before.value - summit.temperature!)
    const errAfter = Math.abs(after.value - summit.temperature!)
    expect(errAfter).toBeLessThan(errBefore)
    // En su propio punto y a su propia altitud, el termómetro manda.
    expect(errAfter).toBeLessThan(0.5)
  })

  it('y NO toca nada hasta el techo del ajuste', () => {
    // La regla que no se negocia: donde el Cabildo mide, manda el Cabildo. La
    // rampa de `ANCHOR_TAPER_M` apaga la cumbre igual que apaga un ancla, y
    // «apagada» quiere decir peso CERO, no peso pequeño.
    const bare = buildModel(stations, 'temperature')
    const withSummit = buildModel(stations, 'temperature', [], null, null, null, summit)
    const ceilingOfFit = bare.elevationRange[1]

    let checked = 0
    for (const s of stations) {
      if (s.elevation > ceilingOfFit) continue
      const a = estimate(bare, s.lon, s.lat, s.elevation)!
      const b = estimate(withSummit, s.lon, s.lat, s.elevation)!
      expect(b.value).toBeCloseTo(a.value, 10)
      checked++
    }
    // Que el bucle haya mirado algo, no que haya pasado por estar vacío.
    expect(checked).toBeGreaterThan(20)
  })

  it('por ENCIMA del techo del ajuste sí se nota, y ahí es donde debe', () => {
    /**
     * El techo del ajuste no es el de la red: es el de las estaciones que han
     * SOBREVIVIDO al rechazo. En este fixture la de 1560,7 m queda fuera, así
     * que el techo baja a 1394,7 m y esa estación pasa a estar 166 m por
     * encima —un 55 % de la rampa de 300 m—. Es el único punto de la red donde
     * la cumbre cambia algo, y cambiarlo es justo lo que se quería: ahí ya no
     * hay ninguna medida del Cabildo sosteniendo la cifra.
     */
    const bare = buildModel(stations, 'temperature')
    const withSummit = buildModel(stations, 'temperature', [], null, null, null, summit)
    const moved = stations.filter((s) => {
      const a = estimate(bare, s.lon, s.lat, s.elevation)!
      const b = estimate(withSummit, s.lon, s.lat, s.elevation)!
      return Math.abs(a.value - b.value) > 1e-9
    })
    expect(moved).toHaveLength(1)
    expect(moved[0].elevation).toBeGreaterThan(bare.elevationRange[1])
    // Y esa estación estaba fuera del ajuste, no dentro.
    expect(bare.rejected.some((r) => r.entityId === moved[0].entityId)).toBe(true)
  })

  it('sin cumbre el modelo es idéntico al de antes', () => {
    const bare = buildModel(stations, 'temperature')
    const withNull = buildModel(stations, 'temperature', [], null, null, null, null)
    expect(withNull.used).toEqual(bare.used)
    expect(withNull.summit).toBe(false)
  })
})
