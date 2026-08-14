/**
 * El lector del reloj impreso, contra un rótulo fabricado a propósito.
 *
 * NO USA UNA CAPTURA DE VERDAD, y no por comodidad. Una foto real de una tarde
 * concreta pesa medio megabyte, envejece —la fecha que trae dentro se va
 * quedando atrás y el test tendría que mentir sobre «ahora»— y no se puede
 * variar para probar el caso que interesa. Aquí el rótulo se DIBUJA con las
 * mismas plantillas que el lector usa para reconocerlo, sobre un fondo que se
 * elige, y así se puede preguntar exactamente lo que hay que preguntar: ¿lee la
 * hora?, ¿la lee sobre un fondo claro?, ¿avisa cuando la imagen es de hace
 * horas?, ¿se calla cuando no hay rótulo?
 *
 * Lo que este test NO cubre es el paso de la foto real al mapa de bits: el
 * ruido de compresión, la hierba al sol, la rama delante del último dígito.
 * Eso se mide contra las cámaras de verdad con `scripts/checks/webcams.ts`, que
 * pide la red y por eso no es un test.
 */

import { describe, it, expect } from 'vitest'
import { PNG } from 'pngjs'
import { STAMP_FONT } from '../../../scripts/checks/stamp-font'
import { GH, GW, readStamp } from '../../../scripts/checks/stamp'

/** Escala de la fuente al dibujarla: el rótulo real va a ×4 sobre 7×10. */
const CELL_W = 28
const CELL_H = 40
const GAP = 4

function bitsOf(ch: string): Uint8Array {
  const hex = STAMP_FONT[ch]
  const bits = new Uint8Array(GW * GH)
  for (let i = 0; i < hex.length; i++) {
    const nib = parseInt(hex[i], 16)
    for (let b = 0; b < 4; b++) bits[i * 4 + b] = (nib >> (3 - b)) & 1
  }
  return bits
}

/** Una captura sintética con el rótulo abajo a la izquierda. */
function shot(text: string, { background = 40, ink = 245 } = {}): PNG {
  const png = new PNG({ width: 1200, height: 700 })
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = png.data[i + 1] = png.data[i + 2] = background
    png.data[i + 3] = 255
  }
  const top = 620
  text.split('').forEach((ch, i) => {
    if (ch === ' ' || !STAMP_FONT[ch]) return
    const bits = bitsOf(ch)
    const left = 60 + i * (CELL_W + GAP)
    for (let y = 0; y < CELL_H; y++)
      for (let x = 0; x < CELL_W; x++) {
        if (!bits[Math.floor((y / CELL_H) * GH) * GW + Math.floor((x / CELL_W) * GW)]) continue
        const o = ((top + y) * png.width + left + x) * 4
        png.data[o] = png.data[o + 1] = png.data[o + 2] = ink
      }
  })
  return png
}

const NOW = Date.UTC(2026, 7, 14, 16, 0, 0)

describe('reloj impreso en la imagen', () => {
  it('lee una fecha y una hora', () => {
    // 15:30 insular son las 14:30 UTC; 15:30 UTC son las 15:30. Las dos son
    // pasado, así que las dos son posibles y las dos se devuelven.
    const r = readStamp(shot('14-08-2026 15:30:00'), NOW)
    expect(r).not.toBeNull()
    expect(r!.text).toContain('14-08-2026')
    expect(r!.error).toBe(0)
    expect(r!.candidates.map((c) => c.zone).sort()).toEqual(['insular', 'utc'])
  })

  it('da la edad mínima, que es la que no mata cámaras vivas', () => {
    // La ambigüedad de zona vale una hora justa: 30 min en UTC, 90 en insular.
    const r = readStamp(shot('14-08-2026 15:30:00'), NOW)!
    expect(Math.round(r.minAgeMs / 60_000)).toBe(30)
    expect(Math.round(r.maxAgeMs / 60_000)).toBe(90)
  })

  it('lee igual de bien sobre un fondo claro', () => {
    // El umbral no puede ser fijo: sobre hierba al sol el texto ya no destaca
    // como sobre monte en sombra. Si esto falla, Otsu ha dejado de adaptarse.
    const r = readStamp(shot('14-08-2026 15:30:00', { background: 180, ink: 252 }), NOW)
    expect(r?.text).toContain('14-08-2026')
  })

  it('acepta el orden americano y descarta el imposible', () => {
    // `08-14` solo puede ser mes-día: no hay un mes catorce. Con un día ≤ 12
    // los dos órdenes valdrían y se devolverían los dos.
    const r = readStamp(shot('08-14-2026 15:30:00'), NOW)!
    expect(new Set(r.candidates.map((c) => c.order))).toEqual(new Set(['MM-DD']))
  })

  it('delata una imagen de hace horas, que es para lo que existe', () => {
    // El caso real: el segundo ángulo de Las Tricias servía un `200 image/jpeg`
    // impecable con una foto de las diez de la mañana.
    const r = readStamp(shot('14-08-2026 09:59:30'), NOW)!
    expect(r.minAgeMs).toBeGreaterThan(5 * 3_600_000)
  })

  it('no se inventa una hora cuando no hay rótulo', () => {
    expect(readStamp(shot(''), NOW)).toBeNull()
    expect(readStamp(shot('PANORAMICA LAS TRICIAS'), NOW)).toBeNull()
  })

  it('rechaza una fecha del futuro en vez de devolverla', () => {
    // Un reloj adelantado media hora se tolera; uno adelantado un día es una
    // lectura mal hecha, y devolverla sería peor que no devolver nada.
    expect(readStamp(shot('15-08-2026 15:30:00'), NOW)).toBeNull()
  })
})
