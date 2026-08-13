/**
 * El álgebra de la rejilla proyectada.
 *
 * La matriz de prueba no es aleatoria: es una perspectiva con la cámara
 * inclinada 60° sobre un punto Mercator del tamaño real de esta isla, que es el
 * caso donde la precisión importa y donde una inversa mal escrita se nota como
 * un temblor y no como un error.
 */

import { describe, expect, it } from 'vitest'
import {
  cameraPosition,
  invert,
  multiply,
  transformPoint,
  translation,
  unprojectToPlane,
} from './mat4'

/** Perspectiva · rotación en X · traslación, montada a mano. */
function scene(pitchDeg: number, distance: number): Float64Array {
  const f = 1 / Math.tan(Math.PI / 6) // fov 60°
  const near = 1e-4
  const far = 10
  const projection = new Float64Array([
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ])
  // El signo de la rotación es el que deja el horizonte ARRIBA, como en el
  // mapa: con el contrario, la cámara mira al cielo y la prueba comprobaría una
  // escena que no existe.
  const p = (pitchDeg * Math.PI) / 180
  const rotation = new Float64Array([
    1, 0, 0, 0,
    0, Math.cos(p), -Math.sin(p), 0,
    0, Math.sin(p), Math.cos(p), 0,
    0, 0, 0, 1,
  ])
  const view = multiply(rotation, translation(-0.4506, -0.3712, 0))
  return multiply(multiply(projection, translation(0, 0, -distance)), view)
}

describe('multiply', () => {
  it('la identidad no cambia nada', () => {
    const m = scene(45, 0.01)
    const id = translation(0, 0, 0)
    const r = multiply(m, id)
    for (let i = 0; i < 16; i++) expect(r[i]).toBeCloseTo(m[i], 12)
  })

  it('encadena traslaciones', () => {
    const r = multiply(translation(1, 2, 3), translation(10, 20, 30))
    expect([r[12], r[13], r[14]]).toEqual([11, 22, 33])
  })
})

describe('invert', () => {
  it('devuelve la identidad al multiplicarla por la original', () => {
    const m = scene(60, 0.008)
    const inv = invert(m)!
    expect(inv).not.toBeNull()
    const id = multiply(m, inv)
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        expect(id[c * 4 + r]).toBeCloseTo(c === r ? 1 : 0, 9)
      }
    }
  })

  it('avisa en vez de devolver infinitos cuando la matriz es singular', () => {
    expect(invert(new Float64Array(16))).toBeNull()
    // Una matriz con dos columnas iguales tampoco tiene inversa.
    const degenerate = new Float64Array(scene(30, 0.01))
    degenerate.set(degenerate.subarray(0, 4), 4)
    expect(invert(degenerate)).toBeNull()
  })

  it('aguanta la escala Mercator sin perder precisión', () => {
    // Un texel de pantalla al máximo acercamiento son 1,5·10⁻⁸ unidades
    // Mercator. Se proyecta un punto, se desproyecta y tiene que volver al
    // mismo sitio con holgura de sobra frente a esa cifra.
    const m = scene(60, 0.008)
    const inv = invert(m)!
    const x = 0.4506 + 1.5e-8
    const y = 0.3712 - 2.5e-8
    const clip = transformPoint(m, x, y, 0)!
    const back = unprojectToPlane(inv, clip[0], clip[1], 0)!
    expect(Math.abs(back[0] - x)).toBeLessThan(1e-12)
    expect(Math.abs(back[1] - y)).toBeLessThan(1e-12)
  })
})

describe('cameraPosition', () => {
  it('encuentra el ojo donde se cortan los rayos de la pantalla', () => {
    // La escena mira el punto (0,4506, 0,3712) desde 0,008 unidades Mercator
    // por detrás, inclinada 60°: el ojo tiene que estar por encima del plano y
    // desplazado hacia el sur, que es de donde viene la mirada.
    const inv = invert(scene(60, 0.008))!
    const eye = cameraPosition(inv)!
    expect(eye).not.toBeNull()
    expect(eye[2]).toBeGreaterThan(0)
    expect(eye[1]).toBeLessThan(0.3712)
    // Y a la distancia que se le puso, con el reparto del coseno y el seno.
    expect(Math.hypot(eye[1] - 0.3712, eye[2])).toBeCloseTo(0.008, 6)
    expect(eye[0]).toBeCloseTo(0.4506, 9)
  })

  it('el ojo está en la prolongación de cualquier rayo de la pantalla', () => {
    const inv = invert(scene(45, 0.02))!
    const eye = cameraPosition(inv)!
    // Un punto del plano visto desde una esquina de la pantalla, el ojo y esa
    // esquina tienen que estar alineados: es la definición de perspectiva.
    const onWater = unprojectToPlane(inv, -0.7, -0.6, 0)!
    const toWater = [onWater[0] - eye[0], onWater[1] - eye[1], -eye[2]]
    const centre = unprojectToPlane(inv, -0.7, -0.6, 0.004)!
    const toCentre = [centre[0] - eye[0], centre[1] - eye[1], 0.004 - eye[2]]
    const cross = Math.hypot(
      toWater[1] * toCentre[2] - toWater[2] * toCentre[1],
      toWater[2] * toCentre[0] - toWater[0] * toCentre[2],
      toWater[0] * toCentre[1] - toWater[1] * toCentre[0],
    )
    expect(cross).toBeLessThan(1e-12)
  })
})

describe('unprojectToPlane', () => {
  const m = scene(60, 0.008)
  const inv = invert(m)!

  it('el centro de la pantalla cae en el centro de la vista', () => {
    const p = unprojectToPlane(inv, 0, 0, 0)!
    expect(p[0]).toBeCloseTo(0.4506, 9)
    expect(p[1]).toBeCloseTo(0.3712, 9)
  })

  it('la parte de abajo de la pantalla queda más cerca que la de arriba', () => {
    // Es LO QUE HACE FALTA que pase: la rejilla es regular en pantalla, así que
    // esta desigualdad es la que reparte triángulos pequeños cerca y grandes
    // lejos sin ningún sistema de niveles de detalle.
    const near = unprojectToPlane(inv, 0, -0.9, 0)!
    const middle = unprojectToPlane(inv, 0, 0.5, 0)!
    const far = unprojectToPlane(inv, 0, 0.9, 0)!
    expect(Math.abs(near[1] - 0.3712)).toBeLessThan(Math.abs(middle[1] - 0.3712))
    expect(Math.abs(middle[1] - 0.3712)).toBeLessThan(Math.abs(far[1] - 0.3712))
    // Y el estirón es brutal: el último 40 % de pantalla se come veinte veces
    // más mar que el primero. Por eso el horizonte hay que difuminarlo.
    expect(Math.abs(far[1] - 0.3712) / Math.abs(middle[1] - 0.3712)).toBeGreaterThan(8)
  })

  it('devuelve null por encima del horizonte en vez de un punto inventado', () => {
    // Con 60° de inclinación, el borde superior de la pantalla ya es cielo.
    expect(unprojectToPlane(inv, 0, 1, 0)).toBeNull()
  })

  it('sigue el plano cuando la marea lo sube', () => {
    const surface = unprojectToPlane(inv, 0.3, -0.4, 0)!
    const raised = unprojectToPlane(inv, 0.3, -0.4, 1e-5)!
    // El mismo píxel, con el agua más alta, apunta a un sitio distinto: es la
    // razón por la que la marea no puede aplicarse después de desproyectar.
    expect(raised[1]).not.toBeCloseTo(surface[1], 9)
  })
})
