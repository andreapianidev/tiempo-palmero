import { describe, expect, it } from 'vitest'
import {
  decodeProfile,
  detectInversion,
  humidityAt,
  parseModelTime,
  sampleProfile,
  type ProfileLevel,
  type VerticalProfile,
} from './profile'

/**
 * Perfil real de Open-Meteo (ICON) sobre el Roque de los Muchachos, 12 ago 2026
 * 16:45 UTC. No es un caso inventado: es el que enseña la inversión del alisio
 * con la temperatura ISOTERMA entre 1074 y 1567 m mientras el rocío se desploma
 * de 13,5 a 1,0 °C.
 */
const REAL_CURRENT: Record<string, unknown> = {
  time: '2026-08-12T16:45',
  temperature_1000hPa: 27.2,
  dew_point_1000hPa: 18.8,
  geopotential_height_1000hPa: 165,
  temperature_900hPa: 21.1,
  dew_point_900hPa: 13.5,
  geopotential_height_900hPa: 1074,
  temperature_850hPa: 21.2,
  dew_point_850hPa: 1.0,
  geopotential_height_850hPa: 1567,
  temperature_800hPa: 20.0,
  dew_point_800hPa: -7.5,
  geopotential_height_800hPa: 2089,
  temperature_700hPa: 13.2,
  dew_point_700hPa: -20.7,
  geopotential_height_700hPa: 3223,
}

const level = (
  pressureHpa: number,
  height: number,
  temperature: number,
  dewpoint: number,
): ProfileLevel => ({ pressureHpa, height, temperature, dewpoint })

const profileOf = (levels: ProfileLevel[]): VerticalProfile => ({
  lon: -17.885,
  lat: 28.7543,
  levels,
  observedAt: 0,
  inversion: detectInversion(levels),
})

describe('parseModelTime', () => {
  it('lee la hora como UTC aunque no traiga sufijo de zona', () => {
    expect(parseModelTime('2026-08-12T16:45')).toBe(Date.UTC(2026, 7, 12, 16, 45, 0))
  })

  it('admite los segundos si aparecen', () => {
    expect(parseModelTime('2026-08-12T16:45:30')).toBe(Date.UTC(2026, 7, 12, 16, 45, 30))
  })

  it('devuelve NaN en vez de inventarse una hora', () => {
    expect(parseModelTime(undefined)).toBeNaN()
    expect(parseModelTime('ayer por la tarde')).toBeNaN()
  })
})

describe('decodeProfile', () => {
  it('lee el perfil real y lo ordena por altura creciente', () => {
    const p = decodeProfile(REAL_CURRENT, -17.885, 28.7543)
    expect(p).not.toBeNull()
    expect(p!.levels.map((l) => l.height)).toEqual([165, 1074, 1567, 2089, 3223])
    expect(p!.observedAt).toBe(Date.UTC(2026, 7, 12, 16, 45, 0))
  })

  it('descarta el nivel al que le falta cualquiera de los tres valores', () => {
    // Un nivel a medias no es medio dato: mezclado con los buenos deforma el
    // gradiente justo donde más se nota.
    const partial = { ...REAL_CURRENT, dew_point_850hPa: null }
    const p = decodeProfile(partial, -17.885, 28.7543)
    expect(p!.levels.map((l) => l.pressureHpa)).not.toContain(850)
    expect(p!.levels).toHaveLength(4)
  })

  it('no devuelve perfil sin hora legible, en vez de fecharlo mal', () => {
    expect(decodeProfile({ ...REAL_CURRENT, time: undefined }, 0, 0)).toBeNull()
  })

  it('no devuelve perfil con menos de dos niveles: no hay nada que interpolar', () => {
    expect(decodeProfile({ time: '2026-08-12T16:45' }, 0, 0)).toBeNull()
  })
})

describe('sampleProfile', () => {
  const p = decodeProfile(REAL_CURRENT, -17.885, 28.7543)!

  it('interpola linealmente entre los dos niveles que encierran el punto', () => {
    // Justo a media distancia entre 1567 m (21,2 °C) y 2089 m (20,0 °C).
    expect(sampleProfile(p, 1828, 'temperature')).toBeCloseTo(20.6, 1)
  })

  it('devuelve el valor exacto en un nivel', () => {
    expect(sampleProfile(p, 1567, 'temperature')).toBeCloseTo(21.2, 5)
  })

  it('NO extrapola por encima del último nivel', () => {
    // Extrapolar es exactamente el error que este módulo viene a corregir.
    expect(sampleProfile(p, 4000, 'temperature')).toBeNull()
  })

  it('NO extrapola por debajo del primero', () => {
    expect(sampleProfile(p, 10, 'temperature')).toBeNull()
  })

  it('cubre la cumbre de la isla, que es para lo que existe', () => {
    expect(sampleProfile(p, 2426, 'temperature')).not.toBeNull()
  })
})

describe('humidityAt', () => {
  const p = decodeProfile(REAL_CURRENT, -17.885, 28.7543)!

  it('recompone la humedad de T y rocío en vez de transportarla', () => {
    // A 1074 m: 21,1 °C con rocío 13,5 → ~62 %. A 2089 m: 20,0 con −7,5 → ~13 %.
    // Que estos dos números sean DISTINTOS es la prueba de todo el cambio: el
    // ancla de superficie daba el mismo valor a las dos alturas.
    const low = humidityAt(p, 1074)!
    const high = humidityAt(p, 2089)!
    expect(low).toBeGreaterThan(55)
    expect(low).toBeLessThan(70)
    expect(high).toBeLessThan(20)
    expect(low - high).toBeGreaterThan(30)
  })

  it('devuelve null donde el perfil no llega', () => {
    expect(humidityAt(p, 4000)).toBeNull()
  })
})

describe('detectInversion', () => {
  it('encuentra la inversión del perfil real', () => {
    const p = decodeProfile(REAL_CURRENT, -17.885, 28.7543)!
    expect(p.inversion).not.toBeNull()
    expect(p.inversion!.base).toBe(1074)
    expect(p.inversion!.top).toBe(1567)
    // Isoterma: +0,1 K en 493 m.
    expect(p.inversion!.deltaT).toBeCloseTo(0.1, 5)
    // La caída de humedad es la firma que la separa de una capa isoterma
    // cualquiera. Aquí sale de −35,7 puntos.
    //
    // La cifra publicada para Canarias es −51 ± 2 (Torres et al. 2002), y NO
    // tiene por qué coincidir: aquélla se mide entre la base y la cima reales
    // con la resolución de un radiosondeo, y ésta entre los dos niveles de
    // presión que las encierran, separados 493 m. Por eso `resolutionM` se
    // publica al lado: el criterio detecta la inversión, no la mide.
    expect(p.inversion!.deltaRh).toBeLessThan(-30)
    expect(p.inversion!.resolutionM).toBeCloseTo(246.5, 1)
  })

  it('no llama inversión a una capa isoterma que no seca el aire', () => {
    // Gradiente plano pero humedad constante: es una capa isoterma nocturna,
    // no la inversión de subsidencia del alisio. Sin este filtro, cualquier
    // noche despejada daría un falso positivo.
    const levels = [
      level(925, 800, 18, 16),
      level(850, 1300, 18, 16),
      level(800, 2000, 12, 10),
    ]
    expect(detectInversion(levels)).toBeNull()
  })

  it('no llama inversión a un aire que se seca mientras la temperatura cae normal', () => {
    const levels = [
      level(925, 800, 20, 18),
      level(850, 1300, 16.5, -5),
      level(800, 2000, 12, -10),
    ]
    expect(detectInversion(levels)).toBeNull()
  })

  it('con dos candidatas se queda con la de mayor caída de humedad', () => {
    // La más baja de las dos suele ser un fenómeno de temperatura superficial
    // del mar, no el alisio (Ramseyer y Miller 2021).
    const levels = [
      level(950, 600, 20, 18),
      level(925, 900, 20.2, 12), // isoterma, caída moderada
      level(900, 1200, 18, 10),
      level(850, 1700, 19.5, -15), // inversión franca, caída grande
      level(800, 2200, 15, -18),
    ]
    const inv = detectInversion(levels)
    expect(inv).not.toBeNull()
    expect(inv!.base).toBe(1200)
    expect(inv!.top).toBe(1700)
  })

  it('devuelve null cuando no hay inversión, que también es una respuesta', () => {
    // Atmósfera con gradiente normal en todo el rango: en Güímar pasa en el 5 %
    // de los sondeos de verano.
    const levels = [
      level(950, 600, 20, 15),
      level(900, 1100, 16.8, 12),
      level(850, 1600, 13.5, 9),
      level(800, 2100, 10.2, 6),
    ]
    expect(detectInversion(levels)).toBeNull()
  })

  it('ignora lo que pasa fuera de la ventana del alisio', () => {
    // Una inversión a 3000 m no es el alisio, y meterla estropearía el mapa.
    const levels = [
      level(700, 3000, 5, -10),
      level(600, 4200, 6, -30),
    ]
    expect(detectInversion(levels)).toBeNull()
  })
})

describe('el perfil contra lo que hacía el ancla de superficie', () => {
  it('da valores distintos a alturas distintas, que es lo que la superficie no hacía', () => {
    // Medido en la API el 12 ago 2026: con `elevation=` forzada, la humedad
    // relativa salía IDÉNTICA a 10, 900, 1560 y 2426 m, porque el modelo
    // traslada el rocío en paralelo a la temperatura y no la recalcula.
    const p = profileOf(decodeProfile(REAL_CURRENT, -17.885, 28.7543)!.levels)
    const alturas = [1200, 1600, 2000, 2400]
    const humedades = alturas.map((z) => humidityAt(p, z)!)
    const distintas = new Set(humedades.map((h) => h.toFixed(1)))
    expect(distintas.size).toBe(alturas.length)
  })
})
