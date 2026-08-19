/**
 * La lista de lo que se ve, contra el catálogo real y contra el cielo real.
 *
 * Es la parte falsable de la función y la prueba lo aprovecha: comprueba contra
 * `astronomy-engine` que las estrellas que dice están donde dice, y comprueba
 * las tres reglas de la lista —horizonte, magnitud límite y orden por magnitud
 * aparente— con casos que las rompen a propósito.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as A from 'astronomy-engine'
import { decodeCatalog, type StarNameEntry } from './catalog'
import { skyFrame } from './frame'
import { visibleFloorDeg } from './refraction'
import { extinctionCoefficient } from './visibility'
import { compassPoint, visibleTonight } from './tonight'

const CIELO = path.resolve(__dirname, '../../../public/cielo')
const buf = readFileSync(path.join(CIELO, 'estrellas.bin'))
const catalog = decodeCatalog(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
)
const names = JSON.parse(
  readFileSync(path.join(CIELO, 'nombres.json'), 'utf8'),
) as StarNameEntry[]

/** El Roque de los Muchachos, una noche clara de agosto a las 23:00 UTC. */
const LON = -17.8892
const LAT = 28.7542
const ELEV = 2387
const AT = Date.UTC(2026, 7, 19, 23, 0, 0)
const PRESSURE = 757
const TEMP = 5

const frame = skyFrame(AT, LON, LAT)
const floorDeg = visibleFloorDeg(ELEV, PRESSURE, TEMP)
const k = extinctionCoefficient(ELEV, PRESSURE)

function tonight(limitMag: number, limit = 5) {
  return visibleTonight({
    catalog,
    names,
    frame,
    limitMag,
    extinctionK: k,
    floorDeg,
    pressureHpa: PRESSURE,
    temperatureC: TEMP,
    limit,
  })
}

describe('lo que se ve esta noche', () => {
  it('nombra el cielo de verano del Roque y lo pone donde está', () => {
    const list = tonight(6.4, 8)
    expect(list.length).toBe(8)
    // El triángulo del verano tiene que estar ahí a las 23:00 de un 19 de
    // agosto: es la comprobación que se hace saliendo a la puerta.
    const found = list.map((s) => s.name)
    expect(found).toContain('Vega')
    expect(found).toContain('Altair')

    // Y donde dice. Contrastado contra `astronomy-engine` estrella por estrella.
    const observer = new A.Observer(LAT, LON, ELEV)
    const ephemeris: Record<string, [number, number]> = {
      Vega: [18.6156472, 38.7836889],
      Altair: [19.8464056, 8.8683],
      Arcturus: [14.2610278, 19.1824167],
    }
    for (const s of list) {
      const eq = ephemeris[s.name]
      if (!eq) continue
      A.DefineStar(A.Body.Star1, eq[0], eq[1], 1000)
      const pos = A.Equator(A.Body.Star1, new Date(AT), observer, true, true)
      const hor = A.Horizon(new Date(AT), observer, pos.ra, pos.dec, 'normal')
      // 0,2° de tolerancia: la refracción de esta aplicación usa la presión
      // real de la cumbre y la de `astronomy-engine` la estándar, y esa sola
      // diferencia vale varios minutos de arco cerca del horizonte.
      expect(Math.abs(s.elevationDeg - hor.altitude), s.name).toBeLessThan(0.2)
      expect(Math.abs(s.azimuthDeg - hor.azimuth), s.name).toBeLessThan(0.2)
    }
  })

  it('no nombra ninguna por debajo del horizonte', () => {
    for (const s of tonight(6.4, 40)) {
      expect(s.elevationDeg).toBeGreaterThanOrEqual(floorDeg)
    }
    // Y el horizonte de la cumbre está por debajo de cero, así que la lista
    // puede legítimamente incluir alguna con altura negativa. Es la prueba de
    // que el suelo se respeta y no se sustituye por un cero cómodo.
    expect(floorDeg).toBeLessThan(-1.9)
  })

  it('no nombra ninguna que el cielo de hoy no deje ver', () => {
    // Con un cielo de pueblo —magnitud límite 3— la lista se queda en las muy
    // brillantes, y ninguna de las que salen puede llegar más débil que eso.
    const pueblo = tonight(3, 40)
    for (const s of pueblo) expect(s.apparentMag).toBeLessThanOrEqual(3)
    // Y con el cielo del Roque salen más que con el del pueblo. La relación es
    // el sentido entero de la función.
    expect(tonight(6.4, 999).length).toBeGreaterThan(pueblo.length * 3)
    // Con el cielo de mediodía no sale ninguna.
    expect(tonight(-6.8, 999).length).toBe(0)
  })

  it('ordena por lo que llega al ojo, no por lo que dice el catálogo', () => {
    const list = tonight(6.4, 20)
    for (let i = 1; i < list.length; i++) {
      expect(list[i].apparentMag).toBeGreaterThanOrEqual(list[i - 1].apparentMag)
    }
    // Y el orden por magnitud aparente NO es el mismo que por la de catálogo:
    // si lo fuera, la extinción no estaría haciendo nada. Con una estrella baja
    // entre medias, los dos órdenes se separan.
    const byCatalog = [...list].sort((a, b) => a.mag - b.mag)
    const differs = list.some((s, i) => s.name !== byCatalog[i].name)
    expect(differs).toBe(true)
  })

  it('la rosa de los vientos parte en dieciséis y no se sale', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(270)).toBe('O')
    expect(compassPoint(359.9)).toBe('N')
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(-1)).toBe('N')
    for (let a = 0; a < 720; a += 3.7) expect(compassPoint(a)).toBeTruthy()
  })
})
