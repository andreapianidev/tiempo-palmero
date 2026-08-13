/**
 * Senderos: la nomenclatura, el muestreo y —sobre todo— cuándo NO hay aviso.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { trailCodeLabel, trailLabel } from './names'
import { densify, parseTrails, type TrailPoint, type TrailProfile } from './sample'
import { THRESHOLDS, rankReports, trailAlerts } from './alerts'
import type { CloudDeck } from '../clouds'

describe('trailCodeLabel', () => {
  it('reescribe los códigos GR como la nomenclatura de las señales', () => {
    expect(trailCodeLabel('GR1301')).toBe('GR 130.1')
    expect(trailCodeLabel('GR1308')).toBe('GR 130.8')
    expect(trailCodeLabel('GR13010')).toBe('GR 130.10')
    expect(trailCodeLabel('GR1311')).toBe('GR 131.1')
    expect(trailCodeLabel('GR1313')).toBe('GR 131.3')
  })

  it('reescribe los PR, con y sin variante', () => {
    expect(trailCodeLabel('PRLP0600')).toBe('PR LP 6')
    expect(trailCodeLabel('PRLP0100')).toBe('PR LP 1')
    expect(trailCodeLabel('PRLP0210')).toBe('PR LP 2.1')
    expect(trailCodeLabel('PRLP1330')).toBe('PR LP 13.3')
    expect(trailCodeLabel('PRLP1900')).toBe('PR LP 19')
  })

  it('lo que no encaja se devuelve crudo, sin maquillar', () => {
    expect(trailCodeLabel('SL-BV 01')).toBe('SL-BV 01')
    expect(trailCodeLabel('')).toBe('')
  })

  it('cubre TODOS los códigos del inventario real', () => {
    // Si el Cabildo publica un código con otro molde, esto lo detecta aquí en
    // vez de dejar un código crudo suelto en la interfaz.
    const geo = JSON.parse(readFileSync('public/layers/senderos.geojson', 'utf8'))
    const codes: string[] = geo.features.map((f: any) => f.properties.codigo)
    expect(codes.length).toBe(49)
    for (const c of codes) {
      expect(trailCodeLabel(c), `código sin molde: ${c}`).not.toBe(c)
    }
  })
})

describe('trailLabel', () => {
  it('añade los extremos cuando se conocen', () => {
    expect(trailLabel('GR1301', 'Santa Cruz de La Palma', 'Puntallana')).toBe(
      'GR 130.1 · Santa Cruz de La Palma → Puntallana',
    )
  })

  it('no repite el municipio cuando empieza y acaba en el mismo', () => {
    expect(trailLabel('PRLP0600', 'San Andrés y Sauces', 'San Andrés y Sauces')).toBe(
      'PR LP 6 · San Andrés y Sauces',
    )
  })

  it('sin municipios se queda en el código, sin rellenar con nada', () => {
    expect(trailLabel('PRLP0600', null, null)).toBe('PR LP 6')
  })
})

describe('densify', () => {
  it('mete puntos intermedios en un tramo largo', () => {
    // ~1,1 km en latitud: a paso de 200 m tienen que salir unos 6 puntos.
    const line: [number, number][] = [
      [-17.9, 28.6],
      [-17.9, 28.61],
    ]
    const out = densify(line, 200)
    expect(out.length).toBeGreaterThanOrEqual(6)
    expect(out[0]).toEqual(line[0])
    expect(out[out.length - 1]).toEqual(line[1])
  })

  it('no pierde el final aunque el último paso quede corto', () => {
    const line: [number, number][] = [
      [-17.9, 28.6],
      [-17.9, 28.6005],
    ]
    const out = densify(line, 200)
    expect(out[out.length - 1]).toEqual(line[1])
  })

  it('una línea degenerada no explota', () => {
    expect(densify([[-17.9, 28.6]], 200)).toEqual([[-17.9, 28.6]])
    expect(densify([], 200)).toEqual([])
  })

  it('arrastra el resto entre segmentos, sin reiniciar el paso en cada vértice', () => {
    // Tres vértices seguidos a 120 m no deben dar tres puntos: el paso es de
    // 200 m sobre el recorrido, no sobre cada segmento.
    const line: [number, number][] = [
      [-17.9, 28.6],
      [-17.9, 28.60108],
      [-17.9, 28.60216],
    ]
    const out = densify(line, 200)
    expect(out.length).toBeLessThanOrEqual(4)
  })
})

describe('parseTrails', () => {
  it('lee el inventario real entero', () => {
    const geo = JSON.parse(readFileSync('public/layers/senderos.geojson', 'utf8'))
    const trails = parseTrails(geo)
    expect(trails.length).toBe(49)
    expect(trails.filter((t) => t.tipo === 'GR').length).toBe(12)
    expect(trails.filter((t) => t.tipo === 'PR').length).toBe(37)
    // La clave es `id_sendero`, y ésa sí es única: hay dos `PRLP1310` y dos
    // `PRLP1700`, que con un mapa por código se habrían perdido.
    expect(new Set(trails.map((t) => t.id)).size).toBe(49)
    expect(new Set(trails.map((t) => t.codigo)).size).toBe(47)
  })

  it('descarta lo que no tiene código, id o geometría', () => {
    expect(parseTrails({ features: [{ properties: {}, geometry: null }] })).toEqual([])
    expect(parseTrails({})).toEqual([])
    expect(parseTrails(null)).toEqual([])
  })
})

// ---------------------------------------------------------------------------

function point(over: Partial<TrailPoint> = {}): TrailPoint {
  return {
    lon: -17.88,
    lat: 28.7,
    elevationM: 1000,
    temperature: 18,
    relativehumidity: 60,
    vpd: 0.8,
    windMs: 3,
    windStationShare: 0.5,
    ...over,
  }
}

function profileOf(points: TrailPoint[]): TrailProfile {
  return {
    trail: {
      id: 1,
      codigo: 'GR1301',
      tipo: 'GR',
      dificultad: 'Media',
      longitudKm: 10.7,
      parts: [],
    },
    label: 'GR 130.1',
    points,
    partSizes: [points.length],
    minElevationM: Math.min(...points.map((p) => p.elevationM)),
    maxElevationM: Math.max(...points.map((p) => p.elevationM)),
    ascentM: 0,
  }
}

/** 20 puntos idénticos, para que cada punto valga exactamente el 5 %. */
const twenty = (over: Partial<TrailPoint>, count: number): TrailPoint[] => [
  ...Array.from({ length: count }, () => point(over)),
  ...Array.from({ length: 20 - count }, () => point()),
]

describe('trailAlerts', () => {
  it('un día tranquilo no genera ningún aviso', () => {
    const r = trailAlerts(profileOf(twenty({}, 0)), null)
    expect(r.alerts).toEqual([])
    expect(r.worst).toBeNull()
  })

  it('un solo punto con racha NO dispara aviso: no describe la ruta', () => {
    // 1 de 20 es el 5 %, por debajo del 10 % mínimo.
    const r = trailAlerts(profileOf(twenty({ windMs: 25 }, 1)), null)
    expect(r.alerts).toEqual([])
  })

  it('a partir del 10 % del recorrido sí', () => {
    const r = trailAlerts(profileOf(twenty({ windMs: 25 }, 2)), null)
    const wind = r.alerts.find((a) => a.kind === 'wind')!
    expect(wind.severity).toBe('warning')
    expect(wind.value).toBe(25)
    expect(wind.share).toBeCloseTo(0.1, 5)
    expect(r.worst).toBe('warning')
  })

  it('emite el aviso más grave, no los dos del mismo tramo', () => {
    const r = trailAlerts(profileOf(twenty({ windMs: 25 }, 5)), null)
    expect(r.alerts.filter((a) => a.kind === 'wind')).toHaveLength(1)
    expect(r.alerts[0].severity).toBe('warning')
  })

  it('viento fuerte pero no temporal se queda en aviso leve', () => {
    const r = trailAlerts(
      profileOf(twenty({ windMs: THRESHOLDS.windNoticeMs + 1 }, 5)),
      null,
    )
    expect(r.alerts.find((a) => a.kind === 'wind')!.severity).toBe('notice')
  })

  it('el aviso de viento arrastra cuánto lo ponen las estaciones', () => {
    const r = trailAlerts(
      profileOf(twenty({ windMs: 25, windStationShare: 0.05 }, 5)),
      null,
    )
    // En una cresta casi todo lo pone el modelo, y eso hay que poder decirlo.
    expect(r.alerts.find((a) => a.kind === 'wind')!.stationShare).toBeCloseTo(0.05, 5)
  })

  it('sitúa el aviso a la cota del peor punto', () => {
    const points = twenty({ temperature: -3, elevationM: 2300 }, 4)
    const cold = trailAlerts(profileOf(points), null).alerts.find((a) => a.kind === 'cold')!
    expect(cold.severity).toBe('warning')
    expect(cold.atElevationM).toBe(2300)
  })

  it('el aviso LEVE de frío señala el punto más frío, no el más templado', () => {
    // Regresión. La primera versión elegía el peor punto por valor absoluto, y
    // con todo por encima de cero eso invertía el criterio: entre un tramo a
    // 4 °C y otro a 1 °C señalaba los 4 °C. No se veía en el aviso grave
    // porque allí todo está bajo cero y el signo hacía coincidir las dos reglas.
    const points = [
      ...Array.from({ length: 10 }, () => point({ temperature: 4, elevationM: 1800 })),
      ...Array.from({ length: 10 }, () => point({ temperature: 1, elevationM: 2400 })),
    ]
    const cold = trailAlerts(profileOf(points), null).alerts.find((a) => a.kind === 'cold')!
    expect(cold.severity).toBe('notice')
    expect(cold.value).toBe(1)
    expect(cold.atElevationM).toBe(2400)
  })

  it('el aviso GRAVE de frío también señala el más frío', () => {
    const points = [
      ...Array.from({ length: 10 }, () => point({ temperature: -1, elevationM: 2000 })),
      ...Array.from({ length: 10 }, () => point({ temperature: -6, elevationM: 2400 })),
    ]
    const cold = trailAlerts(profileOf(points), null).alerts.find((a) => a.kind === 'cold')!
    expect(cold.severity).toBe('warning')
    expect(cold.value).toBe(-6)
  })

  it('el calor de la costa también avisa', () => {
    const r = trailAlerts(profileOf(twenty({ temperature: 36, elevationM: 40 }, 6)), null)
    const heat = r.alerts.find((a) => a.kind === 'heat')!
    expect(heat.severity).toBe('warning')
    expect(heat.atElevationM).toBe(40)
  })

  it('NUNCA hay aviso de lluvia, ni con la ruta empapada', () => {
    // La red publica cero precipitación en las 37 estaciones frescas y la
    // aplicación no interpola lluvia. Que no exista la clase es la garantía.
    const r = trailAlerts(profileOf(twenty({ relativehumidity: 100 }, 20)), null)
    expect(r.alerts.map((a) => a.kind)).not.toContain('rain')
  })
})

// ---------------------------------------------------------------------------

const DECK: CloudDeck = {
  present: true,
  base: 900,
  top: 1400,
  resolutionM: 100,
  deltaT: 1.4,
  deltaRh: -50,
  coverage: 85,
  observedAt: 0,
  agreement: { withInversion: 4, total: 4 },
}

/**
 * Una ruta de 20 puntos con `inside` de ellos dentro de la manta (1100 m) y el
 * resto en la costa, bien por debajo de la banda. El relleno NO puede quedarse
 * en los 1000 m por defecto: eso también cae dentro de la banda 900–1400 y el
 * caso de prueba dejaría de probar lo que dice.
 */
const crossing = (inside: number): TrailPoint[] => [
  ...Array.from({ length: inside }, () => point({ elevationM: 1100 })),
  ...Array.from({ length: 20 - inside }, () => point({ elevationM: 60 })),
]

describe('aviso de niebla', () => {
  it('sale cuando un cuarto del recorrido va dentro de la manta', () => {
    const r = trailAlerts(profileOf(crossing(6)), DECK)
    expect(r.alerts.find((a) => a.kind === 'fog')).toBeDefined()
  })

  it('cruzar la banda de paso no es noticia', () => {
    // 3 de 20 es el 15 %: por encima del 10 % general, por debajo del 25 % que
    // se le exige a la niebla. Subir de la costa a la cumbre la cruza siempre.
    const r = trailAlerts(profileOf(crossing(3)), DECK)
    expect(r.alerts.find((a) => a.kind === 'fog')).toBeUndefined()
  })

  it('con inversión SECA no hay aviso de niebla, por mucha altura que dé', () => {
    const dry = { ...DECK, present: false, coverage: 0 }
    expect(
      trailAlerts(profileOf(crossing(20)), dry).alerts.find((a) => a.kind === 'fog'),
    ).toBeUndefined()
  })

  it('sin diagnóstico de nubes tampoco', () => {
    expect(
      trailAlerts(profileOf(crossing(20)), null).alerts.find((a) => a.kind === 'fog'),
    ).toBeUndefined()
  })

  it('una ruta enteramente por encima de la manta no genera niebla', () => {
    const above = Array.from({ length: 20 }, () => point({ elevationM: 2000 }))
    expect(
      trailAlerts(profileOf(above), DECK).alerts.find((a) => a.kind === 'fog'),
    ).toBeUndefined()
  })

  it('una ruta enteramente por debajo tampoco', () => {
    const below = Array.from({ length: 20 }, () => point({ elevationM: 100 }))
    expect(
      trailAlerts(profileOf(below), DECK).alerts.find((a) => a.kind === 'fog'),
    ).toBeUndefined()
  })
})

describe('rankReports', () => {
  it('lo grave arriba, y los senderos tranquilos NO se tiran', () => {
    const calm = trailAlerts(profileOf(twenty({}, 0)), null)
    const notice = trailAlerts(profileOf(twenty({ windMs: 12 }, 4)), null)
    const warning = trailAlerts(profileOf(twenty({ windMs: 25 }, 4)), null)

    const ranked = rankReports([calm, notice, warning])
    expect(ranked.map((r) => r.worst)).toEqual(['warning', 'notice', null])
    expect(ranked).toHaveLength(3)
  })

  it('a igual gravedad, primero el que tiene más trecho afectado', () => {
    const little = trailAlerts(profileOf(twenty({ windMs: 25 }, 3)), null)
    const lots = trailAlerts(profileOf(twenty({ windMs: 25 }, 12)), null)
    const ranked = rankReports([little, lots])
    expect(ranked[0].alerts[0].share).toBeGreaterThan(ranked[1].alerts[0].share)
  })
})
