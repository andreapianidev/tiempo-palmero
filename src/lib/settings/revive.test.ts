import { describe, expect, it } from 'vitest'
import { bool, flags, oneOf, shape, type Revive } from './revive'

/**
 * Lo que se prueba aquí son las dos orillas, no una.
 *
 * Un validador que rechace todo lo raro es trivial de escribir y deja al
 * usuario sin sus ajustes cada vez que la aplicación cambia; uno que acepte
 * todo mete `undefined` en el motor de dibujo. Por eso cada caso de basura va
 * acompañado de su caso sano más parecido, y los dos pesan igual:
 *
 * - Una capa retirada del catálogo no puede llevarse por delante las que siguen.
 * - Una capa añadida esta semana no puede impedir leer lo guardado el mes pasado.
 * - Un campo inválido de un objeto no puede apagar los campos válidos.
 */

describe('bool', () => {
  it('acepta booleanos y rechaza lo que solo se les parece', () => {
    expect(bool(true, false)).toBe(true)
    expect(bool(false, true)).toBe(false)
    // Lo que un JSON escrito por otra versión podría traer en su lugar.
    for (const raw of [0, 1, 'true', 'false', null, undefined, {}, []]) {
      expect(bool(raw, false), String(raw)).toBeNull()
    }
  })
})

describe('oneOf', () => {
  const variable = oneOf(['temperature', 'dewpoint', 'vpd'] as const)

  it('acepta lo que está en el catálogo', () => {
    expect(variable('dewpoint', 'temperature')).toBe('dewpoint')
  })

  it('rechaza lo que se retiró del catálogo', () => {
    // El caso real: una variable que existía en una versión anterior y hoy no.
    expect(variable('presion', 'temperature')).toBeNull()
    expect(variable(3, 'temperature')).toBeNull()
    expect(variable(null, 'temperature')).toBeNull()
  })

  it('sirve también para catálogos de números, como la exageración', () => {
    const exaggeration = oneOf([1, 1.25, 1.5] as const)
    expect(exaggeration(1.25, 1)).toBe(1.25)
    expect(exaggeration(2, 1)).toBeNull()
    // Un número guardado como texto no vale: `stops[1.25]` y `stops['1.25']`
    // no son lo mismo para quien lo consume.
    expect(exaggeration('1.25', 1)).toBeNull()
  })
})

describe('flags', () => {
  const layers = flags<'grid' | 'stations' | 'wind'>()
  const FACTORY = { grid: true, stations: true, wind: false }

  it('devuelve lo guardado cuando lo guardado está entero', () => {
    expect(layers({ grid: false, stations: true, wind: true }, FACTORY)).toEqual({
      grid: false,
      stations: true,
      wind: true,
    })
  })

  it('una capa que ya no existe no se lleva por delante a las que siguen', () => {
    // `vapor` se retiró; las tres vivas se conservan tal y como estaban.
    const revived = layers({ grid: false, stations: false, wind: true, vapor: true }, FACTORY)
    expect(revived).toEqual({ grid: false, stations: false, wind: true })
    expect(revived).not.toHaveProperty('vapor')
  })

  it('una capa nueva entra con su valor de fábrica sin invalidar lo demás', () => {
    // Guardado por una versión que no conocía `wind`: las otras dos se respetan
    // y `wind` toma el valor de fábrica, no un `undefined`.
    expect(layers({ grid: false, stations: false }, FACTORY)).toEqual({
      grid: false,
      stations: false,
      wind: false,
    })
  })

  it('un valor que no es booleano cae al de fábrica y no contagia', () => {
    expect(layers({ grid: 'si', stations: false, wind: true }, FACTORY)).toEqual({
      grid: true,
      stations: false,
      wind: true,
    })
  })

  it('rechaza lo que no es un objeto de interruptores', () => {
    for (const raw of [null, 'grid', 7, ['grid'], true]) {
      expect(layers(raw, FACTORY), String(raw)).toBeNull()
    }
  })
})

describe('shape', () => {
  interface Ocean {
    on: boolean
    quality: 'alta' | 'ligera'
  }
  const FACTORY: Ocean = { on: false, quality: 'ligera' }
  const ocean: Revive<Ocean> = shape<Ocean>({
    on: bool,
    quality: oneOf(['alta', 'ligera'] as const),
  })

  it('devuelve el objeto entero cuando todo es válido', () => {
    expect(ocean({ on: true, quality: 'alta' }, FACTORY)).toEqual({ on: true, quality: 'alta' })
  })

  it('un campo inválido NO apaga los campos válidos', () => {
    // El caso que importa: una calidad renombrada no puede apagarle el mar a
    // quien lo tenía encendido.
    expect(ocean({ on: true, quality: 'ultra' }, FACTORY)).toEqual({
      on: true,
      quality: 'ligera',
    })
  })

  it('un campo que falta toma el de fábrica', () => {
    expect(ocean({ on: true }, FACTORY)).toEqual({ on: true, quality: 'ligera' })
  })

  it('ignora los campos que ya no forman parte del objeto', () => {
    const revived = ocean({ on: true, quality: 'alta', seamarks: true }, FACTORY)
    expect(revived).toEqual({ on: true, quality: 'alta' })
    expect(revived).not.toHaveProperty('seamarks')
  })

  it('rechaza lo que no es un objeto', () => {
    for (const raw of [null, 'on', 3, [true]]) {
      expect(ocean(raw, FACTORY), String(raw)).toBeNull()
    }
  })
})
