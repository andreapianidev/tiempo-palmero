/**
 * El filtro de la red de fotómetros, contra una lunación entera de archivo.
 *
 * ESTE FICHERO NO EXISTÍA Y ERA EL AGUJERO DE LA FUNCIÓN. `network.ts` decide
 * de qué lectura te fías, y de ahí sale la cifra de estrellas que se dibujan;
 * llevaba una tabla en la cabecera con las dos orillas medidas y ni una prueba
 * que la sostuviera. Un umbral medido una vez y no vuelto a medir es un umbral
 * elegido con pasos extra.
 *
 * EL FIXTURE. `sqm-archivo.json` sale de `scripts/checks/sqm-archivo.ts`, que
 * baja el archivo de `skyobservation` día a día —203 918 lecturas de 15
 * estaciones entre el 21 de julio y el 19 de agosto de 2026, una lunación
 * completa— y guarda los casos que DECIDEN: de cada estación y cada banda de
 * altura solar, las cinco lecturas más brillantes y las cinco más oscuras, los
 * artefactos de cada tipo y un muestreo regular. 851 lecturas.
 *
 * No es una muestra al azar a propósito. Una muestra al azar puede perder el
 * artefacto más oscuro del archivo, que es exactamente la mitad de lo que hay
 * que probar aquí.
 *
 * LO QUE EL ARCHIVO ENTERO DICE, y que esta prueba comprueba en pequeño:
 *
 * | | Lecturas |
 * |---|---:|
 * | Total | 203 918 |
 * | Artefactos (−1000, cero exacto, suelo 9,02-9,99) | 116 812 |
 * | Medidas reales | 87 106 |
 * | Artefactos que el criterio solar NO caza | **98** |
 * | Artefactos que sobreviven a los DOS filtros | **0** |
 * | Medidas reales de noche | 81 365 |
 * | Medidas reales de noche que el umbral de valor tira | **0** |
 */

import { describe, expect, it } from 'vitest'
import fixture from '../__fixtures__/sqm-archivo.json'
import type { CdaRow } from '../cabildo'
import {
  decodeSqmNetwork,
  isFrozen,
  updateFrozen,
  MAX_AGE_MS,
  MIN_PLAUSIBLE_SQM,
  SUN_CEILING_DEG,
  type SqmStation,
} from './network'

interface Row {
  station: string
  site: string
  lon: number
  lat: number
  at: string
  sqm: number | null
  sigma: number | null
  skyTemp: number | null
  clouds: string | null
  sunElevationDeg: number
}

const rows = fixture as Row[]

/** Del fixture a la fila cruda que publica el origen. */
function toCda(r: Row): CdaRow {
  return {
    entityid: r.station,
    name: r.site,
    timeinstant: r.at,
    location: JSON.stringify({ type: 'Point', coordinates: [r.lon, r.lat] }),
    skymagnitude: r.sqm,
    sigmamagnitude: r.sigma,
    skytemperature: r.skyTemp,
    clouds: r.clouds,
  }
}

const isArtefact = (v: number | null): boolean =>
  v !== null && (v === -1000 || v === 0 || (v >= 9 && v < 10))

/**
 * Se decodifica con la hora de la lectura más nueva del fixture, para que la
 * antigüedad no se coma la prueba: aquí se está midiendo el filtro de calidad,
 * no el de frescura, y ése tiene su propio bloque más abajo.
 */
const newest = Math.max(...rows.map((r) => Date.parse(`${r.at.slice(0, 19)}Z`)))
const all = rows.map(toCda)

describe('las dos orillas del filtro', () => {
  it('el fixture trae de verdad los dos casos límite del archivo', () => {
    // Si esto falla, el fixture se ha regenerado con otra ventana y las cifras
    // de abajo ya no son las que se midieron. Es la comprobación que evita que
    // el resto de la prueba pase por vacío.
    const nightReal = rows.filter((r) => r.sunElevationDeg <= -6 && !isArtefact(r.sqm) && r.sqm !== null)
    const artefacts = rows.filter((r) => isArtefact(r.sqm) && (r.sqm as number) > 0)
    expect(nightReal.length).toBeGreaterThan(300)
    expect(artefacts.length).toBeGreaterThan(50)
    // Las dos orillas del hueco, medidas sobre las 203 918 del archivo entero y
    // conservadas en el fixture por construcción.
    expect(Math.min(...nightReal.map((r) => r.sqm as number))).toBeCloseTo(12.43, 2)
    expect(Math.max(...artefacts.map((r) => r.sqm as number))).toBeCloseTo(9.99, 2)
  })

  it('no deja pasar ni un artefacto', () => {
    const net = decodeSqmNetwork(all, newest)
    const survivors = [...net.usable, ...net.stale].filter((s) => isArtefact(s.sky))
    expect(survivors).toEqual([])
  })

  it('no tira ni una medida real de noche', () => {
    const net = decodeSqmNetwork(all, newest)
    const kept = new Set([...net.usable, ...net.stale].map((s) => `${s.id}|${s.observedAt}`))
    const lost = rows.filter(
      (r) =>
        r.sunElevationDeg <= SUN_CEILING_DEG &&
        r.sqm !== null &&
        !isArtefact(r.sqm) &&
        !kept.has(`${r.station}|${Date.parse(`${r.at.slice(0, 19)}Z`)}`),
    )
    expect(lost).toEqual([])
  })
})

describe('el umbral de valor no es un cinturón de repuesto', () => {
  /**
   * LA CORRECCIÓN QUE ESTA PRUEBA TRAJO. La cabecera de `network.ts` decía que
   * el criterio solar se lleva los artefactos «sin excepción». Medido sobre dos
   * días era verdad; medido sobre la lunación entera, no: **98 artefactos se
   * publican con el sol ya puesto** —68 ceros de `stars403` con el sol hasta
   * −27,4° y 30 lecturas del suelo del hardware de tres estaciones «Smart» con
   * el sol hasta −46,2°—. No son saturación de día: son sensores averiados de
   * noche.
   *
   * Los caza el umbral de valor, que por tanto no es redundante: es el único
   * que los ve.
   */
  it('hay artefactos que el sol no caza, y el valor sí', () => {
    const nightArtefacts = rows.filter(
      (r) => r.sunElevationDeg <= SUN_CEILING_DEG && isArtefact(r.sqm),
    )
    expect(nightArtefacts.length).toBeGreaterThan(10)
    // Todos por debajo del umbral, que es la razón de que el umbral los pare.
    for (const r of nightArtefacts) {
      expect(r.sqm as number).toBeLessThan(MIN_PLAUSIBLE_SQM)
    }
    // Y ninguno sobrevive.
    const net = decodeSqmNetwork(all, newest)
    const ids = new Set([...net.usable, ...net.stale].map((s) => `${s.id}|${s.observedAt}`))
    for (const r of nightArtefacts) {
      expect(ids.has(`${r.station}|${Date.parse(`${r.at.slice(0, 19)}Z`)}`)).toBe(false)
    }
  })

  it('11,0 está en mitad del hueco, y las dos orillas duelen', () => {
    const nightReal = rows
      .filter((r) => r.sunElevationDeg <= -6 && !isArtefact(r.sqm) && r.sqm !== null)
      .map((r) => r.sqm as number)
    const artefacts = rows
      .filter((r) => isArtefact(r.sqm) && (r.sqm as number) > 0)
      .map((r) => r.sqm as number)

    // ORILLA BAJA: con el umbral en 9,5 —por debajo del suelo del hardware—
    // entrarían artefactos. Es lo que pasaría si alguien lo «ajustara» para no
    // perder nada.
    expect(artefacts.filter((v) => v >= 9.5).length).toBeGreaterThan(0)
    // ORILLA ALTA: con el umbral en 13 se perderían medidas reales de
    // crepúsculo. La más brillante del archivo son 12,43.
    expect(nightReal.filter((v) => v < 13).length).toBeGreaterThan(0)
    // Y en 11,0 no pasa ninguna de las dos cosas.
    expect(artefacts.every((v) => v < MIN_PLAUSIBLE_SQM)).toBe(true)
    expect(nightReal.every((v) => v >= MIN_PLAUSIBLE_SQM)).toBe(true)
  })
})

describe('lo que el criterio solar SÍ se lleva y no es basura', () => {
  /**
   * LA SEGUNDA CORRECCIÓN. «No se lleva ni una lectura buena» tampoco es cierto
   * dicho así. Sobre la lunación, el corte a −6° descarta **2380 lecturas de
   * valor plausible**, de las cuales unas 1700 son medidas reales de crepúsculo
   * civil de dos estaciones urbanas —`stars4`, el colegio de Los Llanos, con
   * el sol hasta −2,3° y valores de 11,0 a 15,0— y el resto son imposibles:
   * `stars394` publica 16,9 con el sol a +24,7°.
   *
   * No importa para lo que se usa —con el sol a −3° no hay ni una estrella que
   * contar— pero la frase correcta es «no se lleva ninguna lectura que sirva
   * para esto», no «no se lleva ninguna lectura buena».
   */
  it('descarta crepúsculos reales de las estaciones urbanas, y hay que saberlo', () => {
    const civilTwilight = rows.filter(
      (r) => r.sunElevationDeg > SUN_CEILING_DEG && r.sunElevationDeg < -2 && (r.sqm ?? 0) >= 11,
    )
    expect(civilTwilight.length).toBeGreaterThan(10)
    const net = decodeSqmNetwork(all, newest)
    const kept = new Set([...net.usable, ...net.stale].map((s) => `${s.id}|${s.observedAt}`))
    for (const r of civilTwilight) {
      expect(kept.has(`${r.station}|${Date.parse(`${r.at.slice(0, 19)}Z`)}`)).toBe(false)
    }
  })

  it('y descarta lo imposible, que es de lo que se trata', () => {
    // Valores de cielo oscuro publicados con el sol alto. Son el motivo del
    // criterio, y sin él entrarían enteros.
    const impossible = rows.filter((r) => r.sunElevationDeg > 10 && (r.sqm ?? 0) > 15)
    expect(impossible.length).toBeGreaterThan(0)
    const net = decodeSqmNetwork(all, newest)
    expect(net.rejected['sol-arriba']).toBeGreaterThanOrEqual(impossible.length)
  })
})

describe('el censo de descartes cuadra', () => {
  it('lo bueno más lo descartado son todas las filas', () => {
    const net = decodeSqmNetwork(all, newest)
    const rejected = Object.values(net.rejected).reduce((a, b) => a + b, 0)
    // `vieja` cuenta a la vez como descarte y como estación en `stale`: es una
    // lectura que existe pero no es de ahora, y el panel la enseña aparte.
    expect(net.usable.length + rejected).toBe(net.registered)
    expect(net.registered).toBe(rows.length)
    expect(net.stale.length).toBe(net.rejected.vieja)
  })

  it('las utilizables salen ordenadas de la más oscura a la más clara', () => {
    const net = decodeSqmNetwork(all, newest)
    for (let i = 1; i < net.usable.length; i++) {
      expect(net.usable[i - 1].sky).toBeGreaterThanOrEqual(net.usable[i].sky)
    }
  })

  it('el centinela se cuenta como centinela y no como «sol arriba»', () => {
    // El orden de los descartes no es indiferente: una estación que publica
    // −1000 de noche está averiada, no midiendo de día, y el censo del panel
    // solo significa algo si esa distinción se mantiene.
    const at = '2026-08-15 02:00:00'
    const net = decodeSqmNetwork(
      [
        {
          entityid: 'X',
          name: 'X',
          timeinstant: at,
          location: JSON.stringify({ coordinates: [-17.88, 28.75] }),
          skymagnitude: -1000,
        },
      ],
      Date.parse('2026-08-15T02:00:00Z'),
    )
    expect(net.rejected.centinela).toBe(1)
    expect(net.rejected['sol-arriba']).toBe(0)
    expect(net.rejected['valor-imposible']).toBe(0)
  })

  it('sin coordenadas, sin hora y sin valor van cada una a su casilla', () => {
    const base = {
      entityid: 'X',
      name: 'X',
      timeinstant: '2026-08-15 02:00:00',
      location: JSON.stringify({ coordinates: [-17.88, 28.75] }),
      skymagnitude: 21,
    }
    const net = decodeSqmNetwork(
      [
        { ...base, location: null },
        { ...base, timeinstant: null },
        { ...base, skymagnitude: null },
      ],
      Date.parse('2026-08-15T02:00:00Z'),
    )
    expect(net.rejected['sin-coordenadas']).toBe(1)
    expect(net.rejected['sin-hora']).toBe(1)
    expect(net.rejected['sin-valor']).toBe(1)
    expect(net.usable).toEqual([])
  })
})

describe('la frescura', () => {
  const good = {
    entityid: 'X',
    name: 'X',
    location: JSON.stringify({ coordinates: [-17.88, 28.75] }),
    skymagnitude: 21.2,
  }
  const at = Date.parse('2026-08-15T02:00:00Z')

  it('dos horas justas todavía cuentan como de ahora', () => {
    const net = decodeSqmNetwork(
      [{ ...good, timeinstant: '2026-08-15 02:00:00' }],
      at + MAX_AGE_MS,
    )
    expect(net.usable.length).toBe(1)
    expect(net.stale).toEqual([])
  })

  it('un minuto más y pasa a vieja, pero no desaparece', () => {
    const net = decodeSqmNetwork(
      [{ ...good, timeinstant: '2026-08-15 02:00:00' }],
      at + MAX_AGE_MS + 60_000,
    )
    expect(net.usable).toEqual([])
    expect(net.stale.length).toBe(1)
    expect(net.rejected.vieja).toBe(1)
    // Se conserva la lectura entera: el panel enseña su hora, no la esconde.
    expect(net.stale[0].sky).toBe(21.2)
  })
})

describe('el sensor congelado', () => {
  const station = (sky: number, iso: string): SqmStation => ({
    id: 'LPL2_023',
    name: 'Centro de Visitantes del Roque',
    lon: -17.88,
    lat: 28.75,
    sky,
    sigma: 0.002,
    skyTemperatureC: -10.09,
    observedAt: Date.parse(iso),
    sunElevationDeg: -30,
  })

  it('hacen falta tres repeticiones con hora nueva', () => {
    let memory = updateFrozen(undefined, station(21.126, '2026-08-17T05:32:00Z'))
    expect(isFrozen(memory)).toBe(false)
    memory = updateFrozen(memory, station(21.126, '2026-08-17T13:15:00Z'))
    expect(isFrozen(memory)).toBe(false)
    memory = updateFrozen(memory, station(21.126, '2026-08-18T07:31:00Z'))
    expect(isFrozen(memory)).toBe(false)
    // La cuarta lectura, tercera repetición: es el caso real del 17-18 de
    // agosto de 2026.
    memory = updateFrozen(memory, station(21.126, '2026-08-18T14:14:00Z'))
    expect(isFrozen(memory)).toBe(true)
  })

  it('releer la misma fila no cuenta como repetición', () => {
    // LA OTRA ORILLA, y la que de verdad importa: la app pide cada diez minutos
    // y las estaciones «Smart» publican cada dos horas. Sin esta regla, una
    // estación sana quedaría congelada en doce peticiones.
    let memory = updateFrozen(undefined, station(21.126, '2026-08-17T05:32:00Z'))
    for (let i = 0; i < 12; i++) {
      memory = updateFrozen(memory, station(21.126, '2026-08-17T05:32:00Z'))
    }
    expect(isFrozen(memory)).toBe(false)
    expect(memory.repeats).toBe(0)
  })

  it('un valor distinto reinicia la cuenta', () => {
    let memory = updateFrozen(undefined, station(21.126, '2026-08-17T05:32:00Z'))
    memory = updateFrozen(memory, station(21.126, '2026-08-17T13:15:00Z'))
    memory = updateFrozen(memory, station(21.126, '2026-08-18T07:31:00Z'))
    memory = updateFrozen(memory, station(21.09, '2026-08-18T14:14:00Z'))
    expect(isFrozen(memory)).toBe(false)
    expect(memory.repeats).toBe(0)
  })

  it('el archivo real trae el sensor congelado de verdad', () => {
    // No es hipotético: se busca en el fixture una estación que repita el mismo
    // valor con horas distintas tres veces seguidas.
    const byStation = new Map<string, Row[]>()
    for (const r of rows) {
      if (r.sqm === null || r.sunElevationDeg > -6) continue
      byStation.set(r.station, [...(byStation.get(r.station) ?? []), r])
    }
    let frozenFound: string | null = null
    for (const [id, list] of byStation) {
      const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at))
      let memory
      for (const r of sorted) {
        memory = updateFrozen(
          memory,
          station(r.sqm as number, `${r.at.slice(0, 19)}Z`),
        )
        if (isFrozen(memory)) {
          frozenFound = id
          break
        }
      }
      if (frozenFound) break
    }
    expect(frozenFound).not.toBeNull()
  })
})
