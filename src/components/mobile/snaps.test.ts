import { describe, expect, it } from 'vitest'
import {
  clampDrag,
  nearestSnap,
  nextSnap,
  settleSnap,
  snapOffsets,
  SNAP,
} from './snaps'

/** Un iPhone 14/15 en Safari: 852 px de alto útil y 59 px de muesca. */
const PHONE = { height: 852, headHeight: 96, topInset: 59 }

describe('snapOffsets', () => {
  it('deja la cabecera asomando en reposo y la hoja abierta bajo la muesca', () => {
    const o = snapOffsets(PHONE)
    expect(o[SNAP.peek]).toBe(852 - 96)
    expect(o[SNAP.half]).toBe(392)
    expect(o[SNAP.full]).toBe(59)
    // El orden es el que hace que subir sea siempre «menos desplazamiento».
    expect(o[SNAP.peek]).toBeGreaterThan(o[SNAP.half])
    expect(o[SNAP.half]).toBeGreaterThan(o[SNAP.full])
  })

  it('no deja que una cabecera enorme empuje la hoja por encima de la muesca', () => {
    // Una ficha con nombre largo en una pantalla corta: sin el tope, `peek`
    // saldría por encima de `full` y la hoja arrancaría abierta del todo.
    const o = snapOffsets({ height: 420, headHeight: 500, topInset: 20 })
    expect(o[SNAP.peek]).toBe(20)
  })
})

describe('nearestSnap', () => {
  const o = snapOffsets(PHONE)

  it('devuelve el escalón al que se ha soltado más cerca', () => {
    expect(nearestSnap(o, 750)).toBe(SNAP.peek)
    expect(nearestSnap(o, 400)).toBe(SNAP.half)
    expect(nearestSnap(o, 70)).toBe(SNAP.full)
  })

  it('parte en dos la distancia entre escalones', () => {
    const middle = (o[SNAP.peek] + o[SNAP.half]) / 2
    expect(nearestSnap(o, middle - 1)).toBe(SNAP.half)
    expect(nearestSnap(o, middle + 1)).toBe(SNAP.peek)
  })
})

describe('settleSnap', () => {
  const o = snapOffsets(PHONE)

  it('un lanzamiento hacia arriba sube un escalón aunque el dedo se mueva poco', () => {
    expect(settleSnap(o, SNAP.peek, o[SNAP.peek] - 12, -0.9)).toBe(SNAP.half)
  })

  it('un lanzamiento hacia abajo baja uno, y no se pasa del reposo', () => {
    expect(settleSnap(o, SNAP.half, o[SNAP.half] + 12, 0.9)).toBe(SNAP.peek)
    expect(settleSnap(o, SNAP.peek, o[SNAP.peek] + 12, 0.9)).toBe(SNAP.peek)
  })

  it('un arrastre lento se queda donde lo hayan soltado', () => {
    // 0,3 px/ms es un arrastre normal: por debajo del umbral de lanzamiento.
    expect(settleSnap(o, SNAP.peek, 400, -0.3)).toBe(SNAP.half)
    expect(settleSnap(o, SNAP.full, 740, 0.2)).toBe(SNAP.peek)
  })
})

describe('nextSnap', () => {
  it('el toque en la cabecera sube, sube y vuelve abajo', () => {
    expect(nextSnap(SNAP.peek)).toBe(SNAP.half)
    expect(nextSnap(SNAP.half)).toBe(SNAP.full)
    expect(nextSnap(SNAP.full)).toBe(SNAP.peek)
  })
})

describe('clampDrag', () => {
  const o = snapOffsets(PHONE)

  it('deja 40 px de goma y ni uno más', () => {
    expect(clampDrag(o, 5000)).toBe(o[SNAP.peek] + 40)
    expect(clampDrag(o, -5000)).toBe(o[SNAP.full] - 40)
  })

  it('no toca las posiciones normales', () => {
    expect(clampDrag(o, 300)).toBe(300)
  })
})
