/**
 * La curva de fase de la luna, con las dos orillas.
 *
 * LA ORILLA QUE IMPORTA no es «¿da 9 % en cuarto?» —eso es comprobar que la
 * fórmula está copiada— sino «¿se distingue esto de la fracción iluminada?».
 * El fallo que este fichero existe para cazar es que alguien, dentro de dos
 * años, vea `relativeMoonlight(k)` y piense que es un rodeo para devolver `k`.
 * Por eso hay una prueba que compara las dos curvas y exige que se separen.
 */

import { describe, expect, it } from 'vitest'
import {
  FULL_MOON_ILLUMINANCE,
  moonIlluminance,
  opticalPath,
  phaseAngleFromIllumination,
  relativeMoonlight,
} from './moon-brightness'

describe('el ángulo de fase', () => {
  it('va de 0 en la llena a 180 en la nueva', () => {
    expect(phaseAngleFromIllumination(1)).toBeCloseTo(0, 9)
    expect(phaseAngleFromIllumination(0.5)).toBeCloseTo(90, 9)
    expect(phaseAngleFromIllumination(0)).toBeCloseTo(180, 9)
  })

  it('aguanta una fracción fuera de rango sin devolver NaN', () => {
    // Puede llegar un 1,0000000002 de un redondeo, y `Math.acos` de eso es NaN.
    expect(phaseAngleFromIllumination(1.0000001)).toBe(0)
    expect(phaseAngleFromIllumination(-0.0000001)).toBe(180)
  })
})

describe('cuánta luz echa', () => {
  it('la llena es el 100 % por definición', () => {
    expect(relativeMoonlight(1)).toBeCloseTo(1, 12)
    expect(moonIlluminance(0)).toBe(FULL_MOON_ILLUMINANCE)
  })

  it('reproduce la curva de Krisciunas y Schaefer', () => {
    // Los porcentajes de la tabla de la cabecera, medidos con esta misma
    // función. Si alguien toca un coeficiente, esto es lo que salta.
    expect(relativeMoonlight(0.9) * 100).toBeCloseTo(41.1, 1)
    expect(relativeMoonlight(0.75) * 100).toBeCloseTo(22.7, 1)
    expect(relativeMoonlight(0.5) * 100).toBeCloseTo(9.1, 1)
    expect(relativeMoonlight(0.25) * 100).toBeCloseTo(2.6, 1)
    expect(relativeMoonlight(0.1) * 100).toBeCloseTo(0.69, 2)
  })

  it('no se parece a la fracción iluminada, que es la razón de existir', () => {
    // LA PRUEBA DE LAS DOS ORILLAS. Una: en cuarto tiene que estar cinco veces
    // por debajo de lo lineal, o el error viejo habría vuelto. Otra: en la
    // llena tiene que COINCIDIR con lo lineal, o la curva estaría desplazada
    // entera y apagaría también la luna que sí alumbra.
    expect(0.5 / relativeMoonlight(0.5)).toBeGreaterThan(5)
    expect(0.25 / relativeMoonlight(0.25)).toBeGreaterThan(9)
    expect(1 / relativeMoonlight(1)).toBeCloseTo(1, 6)
  })

  it('baja siempre y nunca se sale del cero-uno', () => {
    let previous = Infinity
    for (let k = 1; k >= 0; k -= 0.01) {
      const v = relativeMoonlight(k)
      expect(v).toBeLessThan(previous)
      expect(v).toBeGreaterThan(0)
      expect(v).toBeLessThanOrEqual(1)
      previous = v
    }
  })

  it('la nueva no es negra del todo, y eso es lo que dice la fórmula', () => {
    // 3·10⁻⁴ de la llena. No se ve, pero truncarlo a cero sería escribir otra
    // física de la que se cita.
    expect(relativeMoonlight(0)).toBeGreaterThan(0)
    expect(relativeMoonlight(0)).toBeLessThan(0.001)
  })
})

describe('el camino óptico del modelo', () => {
  it('vale 1 en el cenit y se satura antes del horizonte', () => {
    expect(opticalPath(0)).toBeCloseTo(1, 9)
    // El tope de 0,04 dentro de la raíz deja el camino en 5 exactos: es el
    // freno que impide que el modelo se dispare a infinito en el horizonte,
    // donde de todas formas ya no vale.
    expect(opticalPath(90)).toBeCloseTo(5, 9)
    expect(opticalPath(60)).toBeGreaterThan(opticalPath(30))
  })
})
