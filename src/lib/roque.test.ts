/**
 * El parte de la cumbre, y sobre todo el respeto al flag `outdated`.
 *
 * El cuerpo de prueba es la respuesta REAL del TNG leída el 12 ago 2026 a las
 * 21:20 UTC, recortada a los campos que la aplicación usa. Es un caso feliz
 * para casi todo y un caso incómodo para el seeing, que ese día llevaba cuatro
 * días parado: exactamente la situación que este módulo existe para contar
 * bien.
 */

import { describe, expect, it } from 'vitest'
import { ROQUE_KEYS, decodeRoque, dustLevel, seeingQuality } from './roque'

const T = 1_786_569_631_000 // 2026-08-12T21:20:31Z

const REAL = {
  data: {
    temperature: { value: 18.2, epoch: T, outdated: false, level: 'STABLE' },
    humidity: { value: 24.0, epoch: T, outdated: false, level: 'STABLE' },
    dewpoint: { value: -4.4247878382, epoch: T - 4000, outdated: false, level: 'STABLE' },
    windspeed: { value: 1.341, epoch: T - 4000, outdated: false, level: 'STABLE' },
    winddir: { value: 358.0, epoch: T, outdated: false, level: 'STABLE' },
    pressure: { value: 777.7, epoch: T, outdated: false, level: 'STABLE' },
    dust: { value: 0.15933724, epoch: T - 161_000, outdated: false, level: 'STABLE' },
    solarimeter: { value: 0.0, epoch: T, outdated: false, level: 'STABLE' },
    // Cuatro días parado, y el propio origen lo dice.
    seeing: { value: 0.70326444, epoch: 1_786_243_789_000, outdated: true, level: 'UNKNOWN' },
    // Ruido que no debe llegar a la interfaz.
    dust_d0_3: { value: 803396, epoch: T, outdated: false, level: 'STABLE' },
    trend: { value: 0.748, epoch: T, outdated: false, level: 'STABLE' },
  },
}

describe('decodeRoque', () => {
  it('lee los nueve campos que la app enseña y descarta el resto', () => {
    const s = decodeRoque(REAL, T)!
    expect(Object.keys(s.fields).sort()).toEqual([...ROQUE_KEYS].sort())
  })

  it('normaliza las unidades del origen', () => {
    const s = decodeRoque(REAL, T)!
    // El TNG escribe `ºC` con el masculino ordinal; aquí sale el signo de grado.
    expect(s.fields.temperature!.unit).toBe('°C')
    expect(s.fields.pressure!.unit).toBe('hPa')
    expect(s.fields.dust!.unit).toBe('µg/m³')
  })

  it('la presión de cumbre se pasa TAL CUAL, sin reducir al nivel del mar', () => {
    // 777,7 hPa a 2387 m es correcto y es justo la razón física de que allí
    // arriba haya un observatorio. Reducirla a ~1013 borraría el dato.
    expect(decodeRoque(REAL, T)!.fields.pressure!.value).toBe(777.7)
  })

  it('marca el seeing como obsoleto en vez de esconderlo', () => {
    const s = decodeRoque(REAL, T)!
    expect(s.fields.seeing!.outdated).toBe(true)
    expect(s.fields.seeing!.observedAt).toBe(1_786_243_789_000)
  })

  it('la hora del conjunto ignora los campos obsoletos', () => {
    // Si el seeing contara, `observedAt` sería el de hace cuatro días y la
    // sección entera se enseñaría como rancia cuando 17 campos son de ahora.
    expect(decodeRoque(REAL, T)!.observedAt).toBe(T)
  })

  it('sin ningún campo fresco, la hora del conjunto es null', () => {
    const stale = {
      data: {
        temperature: { value: 18.2, epoch: T, outdated: true },
      },
    }
    const s = decodeRoque(stale, T)!
    expect(s.observedAt).toBeNull()
    expect(s.fields.temperature!.outdated).toBe(true)
  })

  it('un campo sin hora se cae: no se fecha con la descarga', () => {
    const s = decodeRoque(
      { data: { temperature: { value: 18.2, outdated: false } } },
      T,
    )
    expect(s).toBeNull()
  })

  it('un campo sin número se cae', () => {
    const s = decodeRoque(
      {
        data: {
          temperature: { value: null, epoch: T },
          humidity: { value: 24, epoch: T },
        },
      },
      T,
    )!
    expect(s.fields.temperature).toBeUndefined()
    expect(s.fields.humidity).toBeDefined()
  })

  it('un cuerpo vacío o roto devuelve null, no un objeto a medias', () => {
    expect(decodeRoque(null, T)).toBeNull()
    expect(decodeRoque({}, T)).toBeNull()
    expect(decodeRoque({ data: {} }, T)).toBeNull()
    expect(decodeRoque({ data: { nada: { value: 1, epoch: T } } }, T)).toBeNull()
  })
})

describe('seeingQuality', () => {
  it('ordena las cuatro categorías', () => {
    expect(seeingQuality(0.5)).toBe('excellent')
    expect(seeingQuality(0.7)).toBe('excellent')
    expect(seeingQuality(0.8)).toBe('good')
    expect(seeingQuality(1.2)).toBe('average')
    expect(seeingQuality(1.5)).toBe('poor')
    expect(seeingQuality(3)).toBe('poor')
  })
})

describe('dustLevel', () => {
  it('el fondo limpio del Roque no es calima', () => {
    // 0,16 µg/m³, la lectura real del 12 ago 2026.
    expect(dustLevel(0.15933724)).toBe('clean')
  })

  it('distingue episodio de episodio serio', () => {
    expect(dustLevel(4.9)).toBe('clean')
    expect(dustLevel(5)).toBe('hazy')
    expect(dustLevel(19)).toBe('hazy')
    expect(dustLevel(20)).toBe('calima')
    expect(dustLevel(120)).toBe('calima')
  })
})
