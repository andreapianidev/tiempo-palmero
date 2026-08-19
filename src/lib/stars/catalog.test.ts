/**
 * El catálogo que de verdad se sirve, leído por el mismo decodificador que lo
 * lee en el navegador.
 *
 * NO ES UNA PRUEBA DE JUGUETE: abre `public/cielo/estrellas.bin`, el fichero
 * que `prepare-cielo.ts` genera y que Vercel publica. Si alguien regenera el
 * catálogo con otro corte, otro orden u otra fuente, esto se entera aquí y no
 * en la pantalla de otra persona.
 *
 * Lo que comprueba son las tres cosas de las que depende el resto del sistema y
 * que un fichero binario no puede declarar por sí mismo: que está ORDENADO por
 * magnitud —el corte de cada noche es un prefijo—, que las figuras apuntan
 * DENTRO del catálogo, y que la época no se ha quedado vieja.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeCatalog, decodeFigures, STRIDE_FLOATS } from './catalog'
import { starColor } from './color'
import { limitingMagnitude, visibleCount } from './visibility'

const CIELO = path.resolve(__dirname, '../../../public/cielo')

function read(file: string): ArrayBuffer {
  const buf = readFileSync(path.join(CIELO, file))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const catalog = decodeCatalog(read('estrellas.bin'))
const figures = decodeFigures(read('figuras.bin'), catalog.count)
const manifest = JSON.parse(readFileSync(path.join(CIELO, 'manifest.json'), 'utf8')) as {
  count: number
  magLimit: number
  epochJd: number
  figures: { segments: number; worstSnapArcsec: number }
  measured: { faintestFigureStar: number }
}

describe('el catálogo servido', () => {
  it('tiene las 8920 estrellas hasta magnitud 6,5 y cuadra con su manifiesto', () => {
    expect(catalog.count).toBe(manifest.count)
    expect(catalog.magLimit).toBeCloseTo(manifest.magLimit, 5)
    expect(catalog.epochJd).toBeCloseTo(manifest.epochJd, 5)
    // El corte: ver la cabecera de `prepare-cielo.ts`. 6,5 cubre la noche
    // típica del mejor cielo de la isla —magnitud límite medida 6,39— con
    // margen, y cubre la estrella más débil que usa una figura, de 6,47.
    expect(catalog.magLimit).toBe(6.5)
    expect(manifest.measured.faintestFigureStar).toBeLessThanOrEqual(6.5)
  })

  it('viene ordenado por magnitud, que es de lo que depende el corte', () => {
    // `decodeCatalog` ya lanza si no lo está; esto lo dice explícitamente y
    // además comprueba que la primera es Sirio, la más brillante del cielo.
    for (let i = 1; i < catalog.count; i++) {
      expect(catalog.magnitudes[i]).toBeGreaterThanOrEqual(catalog.magnitudes[i - 1])
    }
    expect(catalog.magnitudes[0] / 100).toBeCloseTo(-1.44, 1)
  })

  it('el corte por magnitud límite da las cuentas de la isla', () => {
    // Las mismas seis lecturas reales de la red del Cabildo del 19 de agosto
    // de 2026 que salen en el README y en el panel. Si el catálogo cambia, esta
    // prueba obliga a actualizar esas cifras en vez de dejarlas mintiendo.
    const count = (sqm: number) => visibleCount(catalog.magnitudes, limitingMagnitude(sqm))
    expect(count(21.52)).toBe(7885)
    expect(count(21.13)).toBe(6180)
    expect(count(20.6)).toBe(4420)
    expect(count(19.5)).toBe(1930)
    expect(count(18.0)).toBe(504)
    expect(count(16.19)).toBe(83)
    // Y de día no se dibuja ni una: el cielo modelado a mediodía queda por
    // encima de Sirio, así que la capa se apaga sola sin ninguna condición de
    // hora escrita en ninguna parte.
    expect(count(6.82)).toBe(0)
  })

  it('las 743 figuras apuntan dentro del catálogo', () => {
    expect(figures.segments.length / 2).toBe(manifest.figures.segments)
    for (const i of figures.segments) {
      expect(i).toBeLessThan(catalog.count)
    }
    // Y ninguna une una estrella consigo misma, que sería un segmento de
    // longitud cero y una línea invisible ocupando sitio en el búfer.
    for (let i = 0; i < figures.segments.length; i += 2) {
      expect(figures.segments[i]).not.toBe(figures.segments[i + 1])
    }
    // El peor enganche medido: α Cancri. Que no crezca es la señal de que el
    // fichero de figuras sigue siendo el mismo y el catálogo también.
    expect(manifest.figures.worstSnapArcsec).toBeLessThan(60)
  })

  it('la época no se ha quedado vieja', () => {
    // El movimiento propio se aplica en build y no en el navegador (ver
    // `prepare-cielo.ts`): eso vale mientras el fichero sea reciente. La
    // estrella más rápida de la muestra, Groombridge 1830, se mueve 7,06" al
    // año, así que en cinco años acumula 35" — todavía muy por debajo de un
    // píxel. A los diez ya conviene regenerar, y esto lo dice antes de que el
    // error sea visible en vez de después.
    const yearsOld = (Date.now() / 86_400_000 + 2_440_587.5 - catalog.epochJd) / 365.25
    expect(yearsOld).toBeGreaterThan(-0.01)
    expect(
      yearsOld,
      'el catálogo tiene más de 10 años: `npm run prepare-cielo`',
    ).toBeLessThan(10)
  })

  it('los colores salen del índice B−V y no de una paleta', () => {
    // Rigel es azul (B−V = −0,03) y Betelgeuse roja (1,85). La comprobación es
    // que el canal azul y el rojo se ordenan al revés en las dos.
    const azul = starColor(-0.03)
    const roja = starColor(1.85)
    expect(azul[2]).toBeGreaterThan(azul[0])
    expect(roja[0]).toBeGreaterThan(roja[2])
    // Y las 40 sin fotometría azul salen blancas: no se afirma un color que no
    // se sabe.
    expect(starColor(null)).toEqual([1, 1, 1])
    // En el búfer, cada estrella lleva sus seis números y ninguno es NaN.
    expect(catalog.vertices.length).toBe(catalog.count * STRIDE_FLOATS)
    for (let i = 0; i < catalog.vertices.length; i++) {
      expect(Number.isFinite(catalog.vertices[i])).toBe(true)
    }
  })
})
