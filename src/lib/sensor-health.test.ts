/**
 * El diagnóstico temporal, contra la red real.
 *
 * El fixture son las 37 estaciones que publicaron entre el 11 y el 13 de
 * agosto de 2026, a su cadencia cruda. Se eligió esa ventana porque contiene
 * las dos cosas que hay que separar a la vez:
 *
 *   - una avería de verdad — la 0408, a 1560 m, saltando 16 °C y pasando la
 *     noche del 12 a 3 °C en agosto;
 *   - un episodio meteorológico de verdad — la invasión de aire sahariano de
 *     la madrugada del 13, que hizo saltar a la 0401 de 19,6 °C y 82 % a
 *     25,5 °C y 34 % en quince minutos.
 *
 * Los dos tienen la misma pinta si solo se mira una lectura. El test que
 * importa no es «¿caza la avería?» sino «¿caza la avería SIN borrar el
 * episodio?», y por eso las dos mitades pesan igual aquí.
 *
 * Los umbrales NO se relajan. Si un cambio los rompe, el cambio está mal.
 */

import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/sensor-health-window.json'
import {
  diagnoseNetwork,
  hourlyResiduals,
  jumpFault,
  stuckFault,
  impossibleFault,
  DISPERSION_C,
  JUMP_C,
  STUCK_RUN,
  WINDOW_H,
  type Track,
} from './sensor-health'

const EPOCH = Date.parse(fixture.epoch)

const tracks: Track[] = fixture.stations.map((s) => ({
  entityId: s.entityId,
  name: s.name,
  elevation: s.elevation,
  samples: s.samples.map(([min, c]) => [EPOCH + min * 60_000, c] as const),
}))

const byName = (name: string): Track => {
  const t = tracks.find((x) => x.name === name)
  if (!t) throw new Error(`falta ${name} en el fixture`)
  return t
}

/** La averiada. */
const BROKEN = 'MTD3016CP (SN: 0408)'
/** Las dos que miden el episodio sahariano y NO se pueden marcar. */
const REAL_EPISODE = ['MTD3016CP (SN: 0401)', 'MTD3016CP (SN: 0381)']
/** La congelada: 203 de 203 lecturas clavadas en 70 °C. */
const FROZEN = 'Ecofinca Nogales'

describe('fixture', () => {
  it('cubre la ventana entera con toda la red', () => {
    expect(tracks.length).toBeGreaterThanOrEqual(30)
    expect(fixture.windowHours).toBe(WINDOW_H)
  })
})

describe('salto imposible', () => {
  it('caza el salto de 16 °C de la 0408', () => {
    const fault = jumpFault(byName(BROKEN))
    expect(fault).not.toBeNull()
    expect(fault!.measured).toBeGreaterThan(15)
  })

  it('NO marca a las que miden la entrada de aire sahariano', () => {
    for (const name of REAL_EPISODE) expect(jumpFault(byName(name))).toBeNull()
  })

  it('deja margen sobre el salto sano más extremo del archivo', () => {
    // La 0381 marca 8,1 °C midiendo el borde del frente. Es la cifra sana más
    // alta que existe en el archivo, y el umbral tiene que quedar por encima
    // con holgura: si alguien lo baja hasta rozarla, este test lo dice.
    const worstHealthy = Math.max(
      ...tracks
        .filter((t) => t.name !== BROKEN)
        .map((t) => {
          let step = 0
          for (let i = 1; i < t.samples.length; i++) {
            const gap = t.samples[i][0] - t.samples[i - 1][0]
            if (gap > 0 && gap <= 66 * 60_000) {
              step = Math.max(step, Math.abs(t.samples[i][1] - t.samples[i - 1][1]))
            }
          }
          return step
        }),
    )
    expect(worstHealthy).toBeLessThan(JUMP_C)
    expect(JUMP_C / worstHealthy).toBeGreaterThan(1.4)
  })
})

describe('sensor congelado', () => {
  it('caza las 203 lecturas idénticas de Ecofinca Nogales', () => {
    const fault = stuckFault(byName(FROZEN))
    expect(fault).not.toBeNull()
    expect(fault!.measured).toBeGreaterThanOrEqual(STUCK_RUN)
  })

  it('no confunde con una estación que solo repite unas pocas', () => {
    // Las WSAQPM publican cada 5 min y redondean, así que repiten valor a
    // ratos: la corsa sana más larga del archivo es de 10.
    const healthy = tracks.filter((t) => t.name !== FROZEN)
    for (const t of healthy) {
      const fault = stuckFault(t)
      if (fault) throw new Error(`${t.name} marcada como congelada (${fault.measured})`)
    }
  })
})

describe('valor imposible', () => {
  it('caza los 70 °C de Ecofinca Nogales', () => {
    const fault = impossibleFault(byName(FROZEN))
    expect(fault).not.toBeNull()
    expect(fault!.measured).toBe(70)
  })

  it('no marca a ninguna de las que miden el episodio', () => {
    for (const name of REAL_EPISODE) expect(impossibleFault(byName(name))).toBeNull()
  })
})

describe('desvío incoherente', () => {
  it('el desvío de un sitio raro pero sano es GRANDE y ESTABLE', () => {
    // LasTricias marca +5,7 °C respecto al gradiente de la isla, el desvío más
    // grande del archivo, y aun así está sana: lo que la salva es que ese
    // desvío no se mueve. Es justo la distinción que la regla codifica, así
    // que conviene que un test la fije.
    const res = hourlyResiduals(tracks)
    const tricias = tracks.find((t) => t.name.startsWith('LasTricias'))!
    const values = res.get(tricias.entityId)!
    const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    expect(Math.abs(median)).toBeGreaterThan(4)
    const diag = diagnoseNetwork(tracks).get(tricias.entityId)!
    expect(diag.faults.some((f) => f.kind === 'incoherent')).toBe(false)
  })

  it('la 0408 supera el umbral de dispersión', () => {
    const res = hourlyResiduals(tracks)
    const broken = byName(BROKEN)
    expect(res.get(broken.entityId)!.length).toBeGreaterThanOrEqual(24)
    const diag = diagnoseNetwork(tracks).get(broken.entityId)!
    expect(diag.faults.some((f) => f.kind === 'incoherent')).toBe(true)
  })
})

describe('diagnóstico de la red entera', () => {
  const diagnoses = diagnoseNetwork(tracks)

  it('marca la 0408', () => {
    expect(diagnoses.get(byName(BROKEN).entityId)!.faulty).toBe(true)
  })

  it('marca Ecofinca Nogales', () => {
    expect(diagnoses.get(byName(FROZEN).entityId)!.faulty).toBe(true)
  })

  it('NO marca a las que midieron el episodio sahariano', () => {
    for (const name of REAL_EPISODE) {
      const d = diagnoses.get(byName(name).entityId)!
      expect(d.faulty, `${name}: ${JSON.stringify(d.faults)}`).toBe(false)
    }
  })

  it('no condena a media red: los falsos positivos se quedan en nada', () => {
    // Con 37 estaciones y dos averiadas conocidas, cualquier cosa por encima
    // de tres marcadas significa que un umbral se ha ido de las manos. Este es
    // el test que impide «arreglar» una avería a costa de borrar la red.
    const faulty = [...diagnoses.values()].filter((d) => d.faulty)
    const names = faulty.map(
      (d) => tracks.find((t) => t.entityId === d.entityId)?.name ?? d.entityId,
    )
    expect(names.sort().join(', ')).toBe([BROKEN, FROZEN].sort().join(', '))
  })

  it('la dispersión sana más alta queda por debajo del umbral', () => {
    const res = hourlyResiduals(tracks)
    const brokenIds = new Set([byName(BROKEN).entityId, byName(FROZEN).entityId])
    let worst = 0
    for (const [id, values] of res) {
      if (brokenIds.has(id) || values.length < 24) continue
      const sorted = [...values].sort((a, b) => a - b)
      const med = sorted[Math.floor(sorted.length / 2)]
      const dev = [...values].map((v) => Math.abs(v - med)).sort((a, b) => a - b)
      worst = Math.max(worst, 1.4826 * dev[Math.floor(dev.length / 2)])
    }
    expect(worst).toBeLessThan(DISPERSION_C)
  })
})
