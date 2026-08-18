/**
 * Que la aplicación se pueda instalar de verdad, medido sobre los ficheros.
 *
 * No comprueba que el icono sea bonito —eso no lo prueba nadie— sino las cuatro
 * cosas que lo dejan roto en un teléfono sin que nadie se entere hasta que
 * alguien lo instala: que el manifiesto apunte a ficheros que existen, que
 * tengan el tamaño que dice, que el recortable quepa dentro del círculo con el
 * que Android puede recortarlo, y que el de iOS sea opaco.
 *
 * Los iconos los genera `npm run web:icons`. Si este fichero falla después de
 * tocar el generador, se vuelve a pasar; nunca al revés.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')
const read = (rel: string) => readFileSync(join(ROOT, rel))
const png = (rel: string) => PNG.sync.read(read(rel))

interface Manifest {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  theme_color: string
  background_color: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}

const manifest = JSON.parse(read('public/manifest.webmanifest').toString()) as Manifest

describe('el manifiesto', () => {
  it('declara lo que hace falta para que el navegador ofrezca instalar', () => {
    expect(manifest.name).toBe('Tiempo Palmero')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#0d0c0b')
    expect(manifest.background_color).toBe('#0d0c0b')
  })

  /**
   * El nombre corto es la etiqueta de debajo del icono, y ahí caben unos doce
   * caracteres antes de los puntos suspensivos. «Tiempo Palmero» son catorce.
   */
  it('lleva un nombre corto que cabe en una pantalla de inicio', () => {
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('trae los tres iconos, y uno recortable', () => {
    const purposes = manifest.icons.map((i) => i.purpose)
    expect(purposes).toContain('maskable')
    expect(manifest.icons.filter((i) => i.purpose === 'any').length).toBeGreaterThanOrEqual(2)
  })

  it('cada icono existe y mide lo que dice', () => {
    for (const icon of manifest.icons) {
      const image = png(join('public', icon.src))
      expect(`${image.width}x${image.height}`, icon.src).toBe(icon.sizes)
      expect(icon.type).toBe('image/png')
    }
  })
})

/** El fondo del icono. Lo que se separe de él es dibujo. */
const INK = [13, 12, 11]

/** Distancia al centro del píxel pintado más lejano, en fracción del lado. */
function reach(image: PNG): number {
  let far = 0
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const o = (y * image.width + x) * 4
      const alpha = image.data[o + 3]
      if (alpha < 8) continue
      const off =
        Math.abs(image.data[o] - INK[0]) +
        Math.abs(image.data[o + 1] - INK[1]) +
        Math.abs(image.data[o + 2] - INK[2])
      if (off < 24) continue
      const dx = (x + 0.5) / image.width - 0.5
      const dy = (y + 0.5) / image.height - 0.5
      far = Math.max(far, Math.hypot(dx, dy))
    }
  }
  return far
}

describe('el icono recortable', () => {
  const image = png('public/icon-maskable-512.png')

  /**
   * Android puede recortarlo con un círculo del 80 % del lado: lo que quede a
   * más de 0,4 del centro se pierde. Medido hoy: la punta de Fuencaliente queda
   * a 0,338, y la silueta a tamaño normal —la del icono con tarjeta, 0,80 de
   * alto— llegaría a 0,410, que ya se saldría. De ahí que sean dos ficheros.
   */
  it('la silueta entera cabe dentro del círculo de recorte', () => {
    expect(reach(image)).toBeLessThan(0.4)
  })

  it('va a sangre: sin esquina redondeada, que la pone el sistema', () => {
    const corner = (image.data[3] + image.data[(image.width - 1) * 4 + 3]) / 2
    expect(corner).toBe(255)
  })
})

describe('el icono de iOS', () => {
  const image = png('public/apple-touch-icon.png')

  it('mide 180 px', () => {
    expect(image.width).toBe(180)
    expect(image.height).toBe(180)
  })

  /** iOS no compone sobre nada: lo transparente sale negro y el borde se ve. */
  it('es opaco de esquina a esquina', () => {
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255)
  })
})

describe('el icono de la aplicación', () => {
  it('lleva su propia esquina redondeada, y fuera no pinta nada', () => {
    const image = png('public/icon-512.png')
    expect(image.data[3]).toBe(0) // esquina superior izquierda
    const center = ((image.height / 2) * image.width + image.width / 2) * 4
    expect(image.data[center + 3]).toBe(255)
  })
})

describe('el documento de la aplicación', () => {
  const html = read('index.html').toString()

  it('enlaza el manifiesto y los iconos, y todos existen', () => {
    const hrefs = [...html.matchAll(/(?:href|content)="(\/[^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toContain('/manifest.webmanifest')
    expect(hrefs).toContain('/apple-touch-icon.png')
    for (const href of hrefs) expect(() => read(join('public', href)), href).not.toThrow()
  })

  it('declara que es instalable en iOS, que no lee el manifiesto entero', () => {
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"')
    expect(html).toContain('name="mobile-web-app-capable" content="yes"')
  })
})
