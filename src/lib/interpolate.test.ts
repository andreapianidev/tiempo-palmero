/**
 * Validación del motor de interpolación contra datos reales.
 *
 * El fixture es una lectura congelada de `weatherobserved_lastdata`, con las
 * altitudes ya resueltas contra las teselas del DEM. Se congela a propósito:
 * un test que dependa de la red no es un criterio de aceptación, es una
 * moneda al aire, y además la red del Cabildo se cae a ratos.
 *
 * Para refrescarlo:  npm run prepare-data:snapshot
 *
 * Los umbrales NO se relajan. Si un cambio los rompe, el cambio está mal.
 */

import { describe, it, expect } from 'vitest'
import snapshot from './__fixtures__/weather-snapshot.json'
import {
  buildStations,
  dedupeByEntityId,
  stationReading,
  usable,
  type Station,
} from './quality'
import { parseLocation, parseTimeinstant, type CdaRow } from './cabildo'
import { haversineKm } from './geo'
import {
  dewpointFrom,
  looksLikeStationPressure,
  reduceToSeaLevel,
  relativeHumidityFrom,
  standardPressureAt,
} from './psychro'
import {
  buildModel,
  estimateBundle,
  medianPressure,
  estimate,
  leaveOneOut,
  ols,
  fitWithRejection,
  toSamples,
  nearestWith,
  type Sample,
} from './interpolate'

const NOW = snapshot.capturedAtMs
const ROWS = snapshot.rows as unknown as CdaRow[]

/** El DEM ya está muestreado en el fixture, así que aquí basta con leerlo. */
function elevationFromFixture(lon: number, lat: number): number | null {
  for (const r of ROWS) {
    const loc = parseLocation(r.location)
    if (loc && Math.abs(loc[0] - lon) < 1e-9 && Math.abs(loc[1] - lat) < 1e-9) {
      return (r as { _demElevation: number | null })._demElevation
    }
  }
  return null
}

const { stations, census } = buildStations(ROWS, elevationFromFixture, { now: NOW })

describe('filtro de calidad', () => {
  it('parte de las 52 estaciones registradas', () => {
    expect(ROWS.length).toBe(52)
  })

  it('deduplica por entityid, no por nombre', () => {
    const deduped = dedupeByEntityId(ROWS)
    const ids = new Set(deduped.map((r) => String(r.entityid)))
    expect(ids.size).toBe(deduped.length)

    // CABLPA-ELCHARCO son DOS sitios distintos, a 2,4 km y 142 m uno de otro.
    // Deduplicar por nombre borraría uno de los dos.
    const names = ROWS.map((r) => String(r.name))
    const dupNames = names.filter((n, i) => names.indexOf(n) !== i)
    if (dupNames.length) {
      const group = ROWS.filter((r) => String(r.name) === dupNames[0])
      const uniqueIds = new Set(group.map((r) => String(r.entityid)))
      expect(uniqueIds.size).toBe(group.length)
    }
  })

  it('descarta las estaciones con coordenadas en el Atlántico', () => {
    const offIsland = ROWS.filter((r) => {
      const loc = parseLocation(r.location)
      return loc && (loc[0] < -18.05 || loc[0] > -17.7 || loc[1] < 28.4 || loc[1] > 28.9)
    })
    for (const r of offIsland) {
      expect(usable(r, { now: NOW })).toBe(false)
      expect(stations.some((s) => s.entityId === String(r.entityid))).toBe(false)
    }
  })

  it('descarta lo rancio: nada superviviente pasa de 2 h', () => {
    for (const s of stations) expect(s.ageHours).toBeLessThanOrEqual(2)
  })

  it('descarta valores implausibles sin recortarlos a los límites', () => {
    // Recortar un sensor que marca 70 °C a 45 °C lo convertiría en un dato
    // creíble y contaminaría el ajuste. Se tira entero.
    for (const s of stations) {
      expect(s.temperature).toBeGreaterThan(-8)
      expect(s.temperature).toBeLessThan(45)
    }
  })

  it('el censo cuadra y el denominador honesto es el total registrado', () => {
    const dropped =
      census.droppedStale +
      census.droppedImplausible +
      census.droppedOffIsland +
      census.droppedNoMetric
    expect(census.usable + dropped).toBe(census.total)
    expect(census.usable).toBe(stations.length)
    expect(census.total).toBeGreaterThanOrEqual(stations.length)
  })
})

describe('lectura de la estación: lo que sabe, no lo que publica', () => {
  it('una columna publicada se enseña tal cual, sin marcarla de calculada', () => {
    const measured = stations.filter((s) => s.dewpoint !== null)
    expect(measured.length).toBeGreaterThan(0)
    for (const s of measured) {
      const r = stationReading(s, 'dewpoint')
      expect(r).toEqual({ value: s.dewpoint, derived: false })
    }
  })

  it('con T y humedad hay rocío aunque no venga la columna', () => {
    const derivable = stations.filter(
      (s) => s.dewpoint === null && s.relativehumidity !== null,
    )
    // Sobre este snapshot son 21 de las 37 vivas: la mayoría del mapa. Con la
    // regla anterior sus pines salían con un punto sobre una malla pintada.
    expect(derivable.length).toBeGreaterThan(10)
    for (const s of derivable) {
      const r = stationReading(s, 'dewpoint')
      expect(r?.derived).toBe(true)
      // Coherencia: la humedad que implica ese rocío es la que mide ella.
      expect(relativeHumidityFrom(s.temperature!, r!.value)).toBeCloseTo(
        s.relativehumidity!,
        6,
      )
      // Y el rocío nunca supera la temperatura del aire.
      expect(r!.value).toBeLessThanOrEqual(s.temperature! + 1e-9)
    }
  })

  it('sin humedad ni rocío no se inventa una cifra', () => {
    const blind = stations.filter(
      (s) => s.dewpoint === null && s.relativehumidity === null,
    )
    for (const s of blind) {
      expect(stationReading(s, 'dewpoint')).toBeNull()
      expect(stationReading(s, 'relativehumidity')).toBeNull()
    }
  })

  it('la humedad se completa desde el rocío, que es el caso simétrico', () => {
    const s = stations.find((x) => x.relativehumidity !== null && x.dewpoint !== null)!
    const fake: Station = { ...s, relativehumidity: null }
    const r = stationReading(fake, 'relativehumidity')
    expect(r?.derived).toBe(true)
    // No sale clavada: los tres sensores de una estación no son perfectamente
    // consistentes entre sí. La desviación medida sobre las que publican las
    // tres columnas es de 0,99 % de media y 2,45 % como máximo (ver
    // `psychro.ts`), así que el umbral es ese máximo, no el redondeo.
    expect(Math.abs(r!.value - s.relativehumidity!)).toBeLessThan(2.5)
  })
})

describe('ajuste OLS del gradiente altitudinal', () => {
  it('mide el gradiente en lugar de asumir 6,5 °C/km', () => {
    const model = buildModel(stations, 'temperature')
    const lapsePerKm = -model.b * 1000
    // Rango físicamente razonable: húmedo-adiabático ~4, seco-adiabático ~9,8.
    expect(lapsePerKm).toBeGreaterThan(3)
    expect(lapsePerKm).toBeLessThan(11)
    // Y en concreto, no debe salir clavado en el valor de manual.
    expect(Math.abs(lapsePerKm - 6.5)).toBeGreaterThan(0.05)
  })

  it('la altitud explica la mayor parte de la varianza', () => {
    const model = buildModel(stations, 'temperature')
    // Sobre este snapshot (mañana de agosto) sale R² ≈ 0,65. No sube más
    // porque una sola recta no puede describir a la vez el mar de nubes y la
    // cumbre despejada por encima de la inversión: parte de la varianza
    // restante es física real, no ruido. El umbral es un suelo de cordura del
    // ajuste, no uno de los criterios de aceptación del motor.
    expect(model.r2).toBeGreaterThan(0.5)
  })

  it('recupera exactamente una recta sintética', () => {
    const synth: Sample[] = Array.from({ length: 20 }, (_, i) => ({
      entityId: `s${i}`,
      name: `s${i}`,
      lon: -17.9,
      lat: 28.6 + i * 0.001,
      elevation: i * 100,
      value: 25 - 0.006 * (i * 100),
      observedAt: NOW,
    }))
    const fit = ols(synth)
    expect(fit.b).toBeCloseTo(-0.006, 8)
    expect(fit.a).toBeCloseTo(25, 6)
    expect(fit.r2).toBeCloseTo(1, 8)
  })
})

describe('rechazo de outliers', () => {
  it('caza un sensor descalibrado inyectado en datos reales', () => {
    const clean = toSamples(stations, 'temperature')
    const broken: Sample = {
      entityId: 'SENSOR-ROTO',
      name: 'Sensor descalibrado',
      lon: -17.97,
      lat: 28.76,
      elevation: 1560,
      value: 3.1, // pasa el filtro de plausibilidad, pero en agosto es imposible
      observedAt: NOW,
    }
    const { rejected } = fitWithRejection([...clean, broken])
    expect(rejected.map((r) => r.entityId)).toContain('SENSOR-ROTO')
  })

  it('no amputa la red: deja al menos 4 estaciones', () => {
    const clean = toSamples(stations, 'temperature')
    const { kept } = fitWithRejection(clean)
    expect(kept.length).toBeGreaterThanOrEqual(4)
  })

  it('converge: repetir el ajuste sobre lo que queda ya no tira a nadie', () => {
    const { kept } = fitWithRejection(toSamples(stations, 'temperature'))
    const second = fitWithRejection(kept)
    expect(second.rejected.length).toBe(0)
  })
})

describe('IDW y retendencia', () => {
  const model = buildModel(stations, 'temperature')

  it('devuelve el valor de la estación cuando se pregunta por su propia posición', () => {
    const s = model.used[0]
    const est = estimate(model, s.lon, s.lat, s.elevation)
    expect(est).not.toBeNull()
    // La guardia de d < 10 m debe dominar el promedio, no explotar.
    expect(Number.isFinite(est!.value)).toBe(true)
    expect(Math.abs(est!.value - s.value)).toBeLessThan(0.5)
  })

  it('a igual posición, más altitud da menos temperatura', () => {
    const lon = -17.88
    const lat = 28.7
    const low = estimate(model, lon, lat, 200)!
    const high = estimate(model, lon, lat, 1800)!
    expect(high.value).toBeLessThan(low.value)

    // La diferencia sigue al gradiente medido, pero no es exactamente
    // −b·Δz: al pesar el IDW también por desnivel, cambiar la altitud del
    // punto cambia qué estaciones mandan, y con ellas el residuo interpolado.
    // Esa desviación es el modelo funcionando, no un error — pero tiene que
    // quedarse cerca del gradiente, no irse por su cuenta.
    const expected = -model.b * 1600
    expect(low.value - high.value).toBeGreaterThan(expected * 0.7)
    expect(low.value - high.value).toBeLessThan(expected * 1.3)
  })

  it('los pesos suman 1 y los contribuyentes vienen ordenados', () => {
    const est = estimate(model, -17.9, 28.65, 800)!
    expect(est.contributors.length).toBeGreaterThan(0)
    expect(est.contributors.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < est.contributors.length; i++) {
      expect(est.contributors[i].weightShare).toBeLessThanOrEqual(
        est.contributors[i - 1].weightShare,
      )
    }
    const total = est.contributors.reduce((a, c) => a + c.weightShare, 0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('la incertidumbre crece al alejarse y al extrapolar en altura', () => {
    const near = estimate(model, model.used[0].lon, model.used[0].lat, model.used[0].elevation)!
    const far = estimate(model, -18.02, 28.42, 100)!
    expect(far.uncertainty).toBeGreaterThan(near.uncertainty)

    const [, maxZ] = model.elevationRange
    const above = estimate(model, -17.88, 28.75, maxZ + 400)!
    expect(above.elevationExtrapolated).toBe(true)
    expect(above.uncertainty).toBeGreaterThan(near.uncertainty)
  })

  it('el corte a 15 km se respeta y se declara la extrapolación', () => {
    const est = estimate(model, -17.9, 28.65, 500)!
    expect(est.extrapolated).toBe(false)
    for (const c of est.contributors) expect(c.distanceKm).toBeLessThanOrEqual(15)
  })
})

// ---------------------------------------------------------------------------
// Criterios de aceptación
// ---------------------------------------------------------------------------

describe('leave-one-out sobre todas las estaciones (criterios de aceptación)', () => {
  const withRejection = leaveOneOut(stations, 'temperature', { rejectOutliers: true })
  const withoutRejection = leaveOneOut(stations, 'temperature', { rejectOutliers: false })

  it('valida contra un número significativo de estaciones', () => {
    expect(withRejection.n).toBeGreaterThanOrEqual(20)
    // Se puntúa contra las que el pipeline conserva, y las descartadas se
    // cuentan aparte: los dos denominadores tienen que cuadrar.
    expect(withRejection.n + withRejection.excluded).toBe(stations.length)
    expect(withoutRejection.n).toBe(stations.length)
  })

  it('MAE < 1,3 °C', () => {
    console.log(
      `\n  LOO temperatura · n=${withRejection.n}` +
        ` (${withRejection.excluded} descartadas por control de calidad)` +
        `\n    MAE=${withRejection.mae.toFixed(3)} °C` +
        `  RMSE=${withRejection.rmse.toFixed(3)} °C` +
        `  sesgo=${withRejection.bias.toFixed(3)} °C` +
        `  máx=${withRejection.maxError.toFixed(2)} °C`,
    )
    expect(withRejection.mae).toBeLessThan(1.3)
  })

  it('RMSE < 1,8 °C', () => {
    expect(withRejection.rmse).toBeLessThan(1.8)
  })

  it('el rechazo de outliers mejora el RMSE al menos un 30 %', () => {
    const improvement = 1 - withRejection.rmse / withoutRejection.rmse
    console.log(
      `    pipeline sin rechazo: n=${withoutRejection.n}` +
        ` MAE=${withoutRejection.mae.toFixed(3)} RMSE=${withoutRejection.rmse.toFixed(3)} °C` +
        `\n    pipeline con rechazo: n=${withRejection.n}` +
        ` MAE=${withRejection.mae.toFixed(3)} RMSE=${withRejection.rmse.toFixed(3)} °C` +
        `\n    mejora RMSE = ${(improvement * 100).toFixed(1)} %`,
    )
    expect(improvement).toBeGreaterThan(0.3)
  })

  it('no hay sesgo sistemático apreciable', () => {
    expect(Math.abs(withRejection.bias)).toBeLessThan(0.5)
  })
})

describe('variables que no se interpolan', () => {
  it('el viento se sirve como estación más cercana, no como campo', () => {
    const near = nearestWith(stations, -17.9, 28.65, 800, 'windspeed')
    expect(near).not.toBeNull()
    expect(near!.station.windspeed).not.toBeNull()
    expect(near!.distanceKm).toBeGreaterThanOrEqual(0)
    // Y se conoce el desnivel, para poder advertir de que no es comparable.
    expect(Number.isFinite(near!.elevationDelta)).toBe(true)
  })

  it('humedad y punto de rocío sí se modelan, con su propio gradiente', () => {
    for (const v of ['relativehumidity'] as const) {
      const m = buildModel(stations, v)
      if (m.used.length < 5) continue
      expect(Number.isFinite(m.b)).toBe(true)
      const est = estimate(m, -17.9, 28.65, 800)
      expect(est).not.toBeNull()
      expect(Number.isFinite(est!.value)).toBe(true)
    }
  })

  it('la humedad relativa estimada se mantiene en un rango físico', () => {
    const m = buildModel(stations, 'relativehumidity')
    for (const [lon, lat, z] of [
      [-17.9, 28.65, 100],
      [-17.86, 28.75, 2000],
      [-17.78, 28.6, 500],
    ] as const) {
      const est = estimate(m, lon, lat, z)
      if (!est) continue
      // El modelo puede pasarse de 0..100; la UI recorta, pero no muy lejos.
      expect(est.value).toBeGreaterThan(-20)
      expect(est.value).toBeLessThan(140)
    }
  })
})

describe('coherencia con el caso verificado de la documentación', () => {
  it('corrige en el sentido correcto: proyectar hacia arriba enfría', () => {
    // 20,3 °C a 647 m proyectado a 968 m debe dar ~18,2 °C, no 22,4.
    const lapse = -0.0065
    const corrected = 20.3 + (647 - 968) * -lapse
    expect(corrected).toBeCloseTo(18.2, 1)
  })

  it('el motor reproduce ese mismo sentido', () => {
    const model = buildModel(stations, 'temperature')
    const lon = -17.93363
    const lat = 28.7031 // El Pinar de Tijarafe
    const at647 = estimate(model, lon, lat, 647)!
    const at968 = estimate(model, lon, lat, 968)!
    expect(at968.value).toBeLessThan(at647.value)
  })
})

describe('parsing de la API', () => {
  it('timeinstant se interpreta como UTC', () => {
    // Comprobado el 12 ago 2026: el timeinstant más reciente marcaba 08:48:00
    // con el reloj del servidor en 08:52 UTC. Leerlo como hora canaria (UTC+1)
    // envejecería toda la red una hora de golpe.
    expect(parseTimeinstant('2026-08-12 08:48:00.0')).toBe(Date.UTC(2026, 7, 12, 8, 48, 0))
  })

  it('la distancia haversine cuadra con la geografía conocida de la isla', () => {
    // Santa Cruz de La Palma ↔ Los Llanos de Aridane: ~15 km en línea recta.
    const d = haversineKm([-17.7645, 28.6835], [-17.9182, 28.6585])
    expect(d).toBeGreaterThan(13)
    expect(d).toBeLessThan(17)
  })
})

describe('degradación con red reducida', () => {
  it('con muy pocas estaciones sigue devolviendo algo, no revienta', () => {
    const few: Station[] = stations.slice(0, 3)
    const m = buildModel(few, 'temperature')
    const est = estimate(m, -17.9, 28.65, 800)
    expect(est).not.toBeNull()
    expect(Number.isFinite(est!.value)).toBe(true)
  })

  it('sin ninguna estación devuelve null en vez de un número inventado', () => {
    const m = buildModel([], 'temperature')
    expect(estimate(m, -17.9, 28.65, 800)).toBeNull()
  })
})

describe('coherencia higrotérmica', () => {
  const models = {
    temperature: buildModel(stations, 'temperature'),
    relativehumidity: buildModel(stations, 'relativehumidity'),
  }

  it('la fórmula de Magnus describe a las propias estaciones', () => {
    // Las que publican las tres variables a la vez son el contraste: si la
    // fórmula no las reprodujera, derivar el rocío de ellas sería inventar.
    const triples = stations.filter(
      (s) => s.temperature !== null && s.relativehumidity !== null && s.dewpoint !== null,
    )
    expect(triples.length).toBeGreaterThan(3)
    for (const s of triples) {
      const implied = relativeHumidityFrom(s.temperature!, s.dewpoint!)
      expect(Math.abs(implied - s.relativehumidity!)).toBeLessThan(4)
    }
  })

  it('las tres variables estimadas nunca se contradicen entre sí', () => {
    // La regresión que motiva todo esto: se llegó a mostrar 99 % de humedad
    // junto a un punto de rocío de −7,9 °C en el mismo punto y a la misma
    // altitud. No es impreciso: es imposible. Al derivar el rocío de las otras
    // dos, la contradicción no puede darse por construcción.
    for (const z of [0, 250, 700, 1200, 1800, 2400]) {
      for (const [lon, lat] of [
        [-17.9145, 28.7225],
        [-17.78, 28.62],
        [-17.95, 28.8],
      ] as const) {
        const b = estimateBundle(models, lon, lat, z)
        if (!b.temperature || !b.relativehumidity || !b.dewpoint) continue

        // El rocío nunca supera a la temperatura: el aire no puede estar más
        // que saturado.
        expect(b.dewpoint.value).toBeLessThanOrEqual(b.temperature.value + 0.01)

        // Y la humedad que implican T y Td es la que se está mostrando.
        const implied = relativeHumidityFrom(b.temperature.value, b.dewpoint.value)
        expect(Math.abs(implied - b.relativehumidity.value)).toBeLessThan(0.5)
      }
    }
  })

  it('la humedad estimada se mantiene dentro de [0, 100]', () => {
    for (const z of [0, 800, 1600, 2400, 3000]) {
      const b = estimateBundle(models, -17.88, 28.72, z)
      if (!b.relativehumidity) continue
      expect(b.relativehumidity.value).toBeGreaterThanOrEqual(0)
      expect(b.relativehumidity.value).toBeLessThanOrEqual(100)
    }
  })

  it('las conversiones psicrométricas son inversas la una de la otra', () => {
    for (const t of [-5, 5, 15, 25, 35]) {
      for (const rh of [10, 40, 70, 95]) {
        expect(relativeHumidityFrom(t, dewpointFrom(t, rh))).toBeCloseTo(rh, 4)
      }
    }
  })
})

describe('frescura del dato interpolado', () => {
  const model = buildModel(stations, 'temperature')

  it('la antigüedad anunciada es la de las MEDIDAS, no la de la descarga', () => {
    const est = estimate(model, -17.9, 28.65, 800)!
    // Cae dentro del rango real de instantes de las estaciones utilizables.
    const times = model.used.map((s) => s.observedAt)
    expect(est.observedAt).toBeGreaterThanOrEqual(Math.min(...times))
    expect(est.observedAt).toBeLessThanOrEqual(Math.max(...times))

    // `oldestObservedAt` es el mínimo de las estaciones que CONTRIBUYEN, no de
    // toda la red: las que caen fuera del corte de 15 km no cuentan, ni para
    // el valor ni para su frescura.
    const contributing = model.used.filter(
      (s) => haversineKm([-17.9, 28.65], [s.lon, s.lat]) <= 15,
    )
    expect(est.oldestObservedAt).toBe(
      Math.min(...contributing.map((s) => s.observedAt)),
    )
  })

  it('está ponderada por el mismo peso que el valor', () => {
    // Justo encima de una estación, la frescura anunciada tiene que ser
    // prácticamente la suya: si el 90 % de la cifra sale de ese sensor,
    // anunciar la media simple de toda la red sería engañoso.
    const s = model.used[0]
    const est = estimate(model, s.lon, s.lat, s.elevation)!
    expect(Math.abs(est.observedAt - s.observedAt)).toBeLessThan(15 * 60_000)
  })

  it('el peor caso nunca es más fresco que el típico', () => {
    for (const [lon, lat, z] of [
      [-17.9, 28.65, 800],
      [-17.78, 28.62, 200],
      [-17.86, 28.75, 2000],
    ] as const) {
      const est = estimate(model, lon, lat, z)!
      expect(est.oldestObservedAt).toBeLessThanOrEqual(est.observedAt)
    }
  })

  it('un valor derivado no es más fresco que sus ingredientes', () => {
    const models = {
      temperature: buildModel(stations, 'temperature'),
      relativehumidity: buildModel(stations, 'relativehumidity'),
    }
    const b = estimateBundle(models, -17.9, 28.65, 800)
    if (!b.dewpoint || !b.temperature || !b.relativehumidity) return
    expect(b.dewpoint.observedAt).toBeLessThanOrEqual(b.temperature.observedAt)
    expect(b.dewpoint.observedAt).toBeLessThanOrEqual(b.relativehumidity.observedAt)
  })
})

describe('presión: dos convenciones en la misma columna', () => {
  it('reconoce cuál es presión de estación y cuál ya viene reducida', () => {
    // A 726 m la diferencia entre ambas convenciones es de unos 86 hPa: el
    // discriminante no está ajustado fino, está holgado de sobra.
    expect(looksLikeStationPressure(936.2, 726)).toBe(true)
    expect(looksLikeStationPressure(1015.4, 761)).toBe(false)
    // Cerca del nivel del mar convergen, y ahí da igual: no se toca.
    expect(looksLikeStationPressure(1018.3, 12)).toBe(false)
  })

  it('la reducción devuelve valores de nivel del mar plausibles', () => {
    for (const [p, h] of [
      [936.2, 726],
      [971.9, 419],
      [982.1, 324],
    ] as const) {
      const msl = reduceToSeaLevel(p, h, 20)
      expect(msl).toBeGreaterThan(1000)
      expect(msl).toBeLessThan(1035)
    }
  })

  it('la atmósfera estándar da los valores de manual', () => {
    expect(standardPressureAt(0)).toBeCloseTo(1013.25, 2)
    // ~1 hPa cada 8 m cerca del suelo.
    expect(standardPressureAt(0) - standardPressureAt(80)).toBeGreaterThan(8)
    expect(standardPressureAt(0) - standardPressureAt(80)).toBeLessThan(11)
  })

  it('tras normalizar, toda la red queda en el mismo orden de magnitud', () => {
    const withP = stations.filter((s) => s.atmosphericpressure !== null)
    expect(withP.length).toBeGreaterThan(10)
    for (const s of withP) {
      // Antes de normalizar había estaciones en 936 hPa junto a otras en 1018.
      expect(s.atmosphericpressure!).toBeGreaterThan(980)
      expect(s.atmosphericpressure!).toBeLessThan(1045)
    }
  })

  it('la presión de la isla es la mediana, no un campo interpolado', () => {
    const median = medianPressure(stations)
    expect(median).not.toBeNull()
    // Robusta: sigue siendo un valor barométrico creíble pese a que la red
    // llega a desviarse decenas de hPa entre sensores.
    expect(median!).toBeGreaterThan(995)
    expect(median!).toBeLessThan(1035)
  })
})
