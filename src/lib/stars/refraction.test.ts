/**
 * La refracción, y la vigilancia de su gemelo en GLSL.
 *
 * La fórmula está escrita dos veces —aquí en TypeScript y en el sombreador de
 * `components/stars/star-shaders.ts`— porque la capa la aplica por estrella en
 * la GPU y el panel la necesita en la CPU. Dos copias de una fórmula se separan
 * solas en cuanto alguien toca una: esta prueba lee el texto del sombreador y
 * comprueba que sigue teniendo las mismas constantes, y además evalúa la misma
 * expresión sobre una rejilla de alturas.
 */

import { describe, expect, it } from 'vitest'
import { STAR_VERTEX_SHADER } from '../../components/stars/star-shaders'
import {
  horizonDipDeg,
  refractionDeg,
  REFERENCE_PRESSURE_HPA,
  visibleFloorDeg,
} from './refraction'

describe('refracción atmosférica', () => {
  it('levanta 34 minutos en el horizonte y nada en el cenit', () => {
    // La cifra de manual: en el horizonte la refracción vale un diámetro lunar.
    // Bennett 16.3 evaluado en 0° da 28,98', que corresponde a la altura
    // VERDADERA cero; los 34' clásicos son para la altura APARENTE cero, o sea
    // para una estrella que geométricamente está a −0,57°. Las dos cifras son la
    // misma curva leída por sitios distintos, y confundirlas es el error que
    // este comentario evita.
    expect(refractionDeg(0) * 60).toBeCloseTo(28.98, 1)
    expect(refractionDeg(-0.57) * 60).toBeCloseTo(34.0, 0)
    // A 45° ya es un minuto escaso, y en el cenit prácticamente nada.
    expect(refractionDeg(45) * 60).toBeCloseTo(1.0, 1)
    expect(refractionDeg(90) * 60).toBeLessThan(0.02)
    // Nunca negativa y siempre decreciente.
    for (let h = -1; h < 90; h += 0.5) {
      expect(refractionDeg(h)).toBeGreaterThanOrEqual(refractionDeg(h + 0.5))
      expect(refractionDeg(h)).toBeGreaterThanOrEqual(0)
    }
  })

  it('la presión de la cumbre la baja un cuarto', () => {
    // A 2387 m la presión ronda los 757 hPa. La refracción es proporcional a la
    // densidad del aire, así que allí arriba vale un 25 % menos que al nivel del
    // mar: 8' menos en el horizonte, que es lo que separa ver salir una estrella
    // de no verla.
    const sea = refractionDeg(0, REFERENCE_PRESSURE_HPA, 10)
    const summit = refractionDeg(0, 757, 5)
    expect(summit / sea).toBeGreaterThan(0.7)
    expect(summit / sea).toBeLessThan(0.8)
    expect((sea - summit) * 60).toBeGreaterThan(6)
  })

  it('desde el Roque el horizonte está 1,43° por debajo', () => {
    expect(horizonDipDeg(2387)).toBeCloseTo(1.428, 2)
    expect(horizonDipDeg(0)).toBe(0)
    // Y el suelo visible es todavía más bajo, porque el aire levanta lo que hay
    // ahí abajo. Desde la cumbre se ven estrellas que desde la costa están
    // puestas: ésa es la cifra que lo dice.
    const summit = visibleFloorDeg(2387, 757, 5)
    expect(summit).toBeLessThan(-1.9)
    expect(summit).toBeGreaterThan(-2.3)
    // Al nivel del mar el suelo es el propio horizonte levantado por el aire.
    expect(visibleFloorDeg(0)).toBeCloseTo(-refractionDeg(0), 5)
  })

  it('el gemelo en GLSL no se ha separado', () => {
    // Las tres constantes de Bennett/Sæmundsson, tal cual, en el sombreador.
    expect(STAR_VERTEX_SHADER).toContain('1.02 / tan((eB + 10.3 / (eB + 5.11)) / DEG)')
    expect(STAR_VERTEX_SHADER).toContain('float eB = max(elDeg, -1.0);')
    expect(STAR_VERTEX_SHADER).toContain('u_density / 60.0')
    // Y la evaluación numérica de la misma expresión, sobre una rejilla que
    // cubre desde el horizonte deprimido de la cumbre hasta el cenit.
    const glsl = (elDeg: number, density: number) => {
      const eB = Math.max(elDeg, -1)
      return Math.max(
        0,
        (1.02 / Math.tan(((eB + 10.3 / (eB + 5.11)) * Math.PI) / 180)) * density / 60,
      )
    }
    for (let h = -1.5; h <= 90; h += 0.25) {
      for (const p of [1010, 757]) {
        const density = (p / 1010) * (283 / (273 + 10))
        expect(glsl(h, density)).toBeCloseTo(refractionDeg(h, p, 10), 9)
      }
    }
  })

  it('la masa de aire del sombreador es la misma de la aplicación', () => {
    // Kasten y Young, escrita igual en los dos sitios.
    expect(STAR_VERTEX_SHADER).toContain('0.50572 * pow(elClamped + 6.07995, -1.6364)')
  })
})
