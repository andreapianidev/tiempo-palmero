/**
 * La geometría de la línea: grosor constante mire donde mire, y ni un triángulo
 * donde el camino se corta.
 */

import { describe, expect, it } from 'vitest'
import type { Rgb } from '../ocean/light'
import { RIBBON_STRIDE, trackRibbon, type RibbonPoint, type RibbonStyle } from './track-ribbon'

const BLANCO: Rgb = [1, 1, 1]

const punto = (x: number, y: number, extra: Partial<RibbonPoint> = {}): RibbonPoint => ({
  x,
  y,
  ahead: true,
  color: BLANCO,
  mark: 'none',
  ...extra,
})

const ESTILO: RibbonStyle = { halfWidth: 0.01, aspect: 2, hourArm: 0.03, nowArm: 0.06 }

const vertices = (data: Float32Array): number => data.length / RIBBON_STRIDE

/** Los seis flotantes del vértice `i`. */
const vertice = (data: Float32Array, i: number): number[] =>
  [...data.slice(i * RIBBON_STRIDE, (i + 1) * RIBBON_STRIDE)]

describe('trackRibbon', () => {
  it('hace dos triángulos por tramo', () => {
    const data = trackRibbon([punto(-0.5, 0), punto(0.5, 0), punto(0.5, 0.5)], ESTILO)
    expect(vertices(data)).toBe(12)
  })

  it('reparte el grosor a los dos lados y lo marca en el través', () => {
    const data = trackRibbon([punto(-0.5, 0), punto(0.5, 0)], ESTILO)
    const ys = [...Array(6)].map((_, i) => vertice(data, i)[1])
    expect(Math.min(...ys)).toBeCloseTo(-ESTILO.halfWidth, 7)
    expect(Math.max(...ys)).toBeCloseTo(ESTILO.halfWidth, 7)
    for (let i = 0; i < 6; i++) expect(Math.abs(vertice(data, i)[2])).toBe(1)
  })

  it('mantiene el grosor cuando la línea gira', () => {
    // Es la prueba de la corrección de aspecto: con la ventana el doble de
    // ancha que de alta, un tramo vertical tiene que desplazarse la MITAD en x
    // para medir lo mismo en pantalla que un tramo horizontal en y.
    const vertical = trackRibbon([punto(0, -0.5), punto(0, 0.5)], ESTILO)
    const xs = [...Array(6)].map((_, i) => vertice(vertical, i)[0])
    expect(Math.max(...xs)).toBeCloseTo(ESTILO.halfWidth / ESTILO.aspect, 7)

    // Y a 45° en pantalla, el ancho medido perpendicular sigue siendo el mismo.
    const diagonal = trackRibbon([punto(-0.5, -0.5), punto(0.5, 0.5)], ESTILO)
    const a = vertice(diagonal, 0)
    const b = vertice(diagonal, 2)
    const ancho = Math.hypot((a[0] - b[0]) * ESTILO.aspect, a[1] - b[1])
    expect(ancho).toBeCloseTo(2 * ESTILO.halfWidth, 7)
  })

  it('corta la línea donde el camino queda a la espalda de la cámara', () => {
    const data = trackRibbon(
      [punto(-0.5, 0), punto(0, 0, { ahead: false }), punto(0.5, 0)],
      ESTILO,
    )
    expect(vertices(data)).toBe(0)
  })

  it('no sigue un punto que se ha ido a tomar viento', () => {
    // Cerca del plano de la cámara la división en perspectiva se dispara. Un
    // vértice a 400 no dibuja nada visible y sí un cuadrilátero absurdo.
    const data = trackRibbon([punto(-0.5, 0), punto(400, 0)], ESTILO)
    expect(vertices(data)).toBe(0)
  })

  it('cruza el camino con las marcas, y la de ahora es más larga', () => {
    const conMarcas = [
      punto(-0.5, 0),
      punto(0, 0, { mark: 'hour' }),
      punto(0.5, 0, { mark: 'now' }),
    ]
    const data = trackRibbon(conMarcas, ESTILO)
    // Dos tramos y dos marcas: cuatro cuadriláteros.
    expect(vertices(data)).toBe(24)

    // La marca de la hora está sobre un camino horizontal, así que cruza en
    // vertical y su largo es el brazo entero, a los dos lados.
    const marca = [...Array(6)].map((_, i) => vertice(data, 12 + i)[1])
    expect(Math.max(...marca)).toBeCloseTo(ESTILO.hourArm, 7)
    expect(Math.min(...marca)).toBeCloseTo(-ESTILO.hourArm, 7)

    const cursor = [...Array(6)].map((_, i) => vertice(data, 18 + i)[1])
    expect(Math.max(...cursor)).toBeCloseTo(ESTILO.nowArm, 7)
  })

  it('no dibuja dos veces el mismo punto', () => {
    // Dos muestras en el mismo sitio no tienen dirección, así que no hay normal
    // que calcular: el tramo se descarta en vez de salir con coordenadas NaN.
    const data = trackRibbon([punto(0.2, 0.2), punto(0.2, 0.2)], ESTILO)
    expect(vertices(data)).toBe(0)
  })

  it('lleva el color de cada extremo a sus vértices', () => {
    const naranja: Rgb = [1, 0.55, 0.24]
    const data = trackRibbon([punto(-0.5, 0, { color: naranja }), punto(0.5, 0)], ESTILO)
    // Con la tolerancia de un flotante de 32 bits, que es lo que sube a la
    // tarjeta: 0,55 no existe exacto ahí dentro y no tiene por qué.
    for (let c = 0; c < 3; c++) {
      expect(vertice(data, 0)[3 + c]).toBeCloseTo(naranja[c], 7)
      expect(vertice(data, 1)[3 + c]).toBeCloseTo(1, 7)
    }
  })
})
