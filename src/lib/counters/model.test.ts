import { describe, expect, it } from 'vitest'
import type { CdaRow } from '../cabildo'
import {
  buildSites,
  cleanChannelName,
  commonSiteName,
  parseHistoricDay,
  sumPublished,
} from './model'

/**
 * Filas reales de la API del Cabildo, recortadas: `count_historic` del 11 y 12
 * de agosto de 2026 y `count_today` de las 22:16 de ese día 12. Están aquí
 * porque cada una de ellas es una trampa distinta del formato.
 */
const HISTORIC: CdaRow[] = [
  {
    entityid: 'CC09_coches',
    timeinstant: '11-08-2026',
    name: 'Acceso Entrada a Santa Cruz',
    geometry: '{"type":"Point","coordinates":[-17.769,28.669]}',
    numberofincoming: 8996,
    numberofoutgoing: 11163,
    countertype: 'coches',
    incomingdescription: 'Santa Cruz',
    outgoingdescription: 'Aeropuerto',
  },
  {
    entityid: 'CC09_coches',
    timeinstant: '12-08-2026',
    name: 'Acceso Entrada a Santa Cruz',
    geometry: '{"type":"Point","coordinates":[-17.769,28.669]}',
    numberofincoming: 8697,
    numberofoutgoing: 11048,
    countertype: 'coches',
    incomingdescription: 'Santa Cruz',
    outgoingdescription: 'Aeropuerto',
  },
  // Peatones de carretera: la fuente publica un sentido y deja el otro a null.
  {
    entityid: 'CC09_peatones',
    timeinstant: '12-08-2026',
    name: 'Acceso Entrada a Santa Cruz',
    geometry: '{"type":"Point","coordinates":[-17.769,28.669]}',
    numberofincoming: 452,
    numberofoutgoing: null,
    countertype: 'peatones',
    incomingdescription: 'Santa Cruz',
    outgoingdescription: 'Aeropuerto',
  },
  // Dos senderos contados en el mismo punto, con canales numerados.
  {
    entityid: 'CS06_peatones1',
    timeinstant: '12-08-2026',
    name: 'Acceso Sendero Hilera - Pico de las Nieves',
    geometry: '{"type":"Point","coordinates":[-17.8271,28.6685]}',
    numberofincoming: 12,
    numberofoutgoing: 9,
    countertype: 'peatones',
    incomingdescription: 'entrada',
    outgoingdescription: 'salida',
  },
  {
    entityid: 'CS06_peatones2',
    timeinstant: '12-08-2026',
    name: 'Acceso Sendero Hilera - Virgen del Pino',
    geometry: '{"type":"Point","coordinates":[-17.8271,28.6685]}',
    numberofincoming: 4,
    numberofoutgoing: 3,
    countertype: 'peatones',
    incomingdescription: 'entrada',
    outgoingdescription: 'salida',
  },
  // Publicó ayer y hoy calla: sigue en el mapa, sin cifra del día.
  {
    entityid: 'CC06_coches',
    timeinstant: '11-08-2026',
    name: 'Acceso Las Ledas',
    geometry: '{"type":"Point","coordinates":[-17.78,28.62]}',
    numberofincoming: 100,
    numberofoutgoing: 120,
    countertype: 'coches',
    incomingdescription: 'Breña Baja',
    outgoingdescription: 'Santa Cruz',
  },
]

const TODAY: CdaRow[] = [
  {
    entityid: 'CC09_coches',
    timeinstant: '2026-08-12 22:16:10.0',
    name: 'Acceso Entrada a Santa Cruz Coches',
    location: '{"type":"Point","coordinates":[-17.769,28.669]}',
    numberofincoming: 3,
    numberofoutgoing: 10,
    countertype: 'coches',
    incomingdescription: 'Santa Cruz',
    outgoingdescription: 'Aeropuerto',
  },
]

const INVENTORY: CdaRow[] = [
  { entityid: 'CC09_coches', name: 'Acceso Entrada a Santa Cruz Coches', countertype: 'coches' },
  { entityid: 'CC09_peatones', name: 'Acceso Entrada a Santa Cruz Peatones', countertype: 'peatones' },
  { entityid: 'CC06_coches', name: 'Acceso Las Ledas Coches', countertype: 'coches' },
  { entityid: 'CS06_peatones1', name: 'Acceso Sendero Hilera Peatones', countertype: 'peatones' },
  { entityid: 'CS06_peatones2', name: 'Acceso Sendero Hilera Peatones', countertype: 'peatones' },
  // Registrado y mudo: no aparece ni en el histórico ni en el pulso.
  { entityid: 'CC20_coches', name: 'Aforo sin datos Coches', countertype: 'coches' },
]

const build = () =>
  buildSites({ historic: HISTORIC, today: TODAY, inventory: INVENTORY, todayKey: '2026-08-12' })

describe('formato de la red de aforos', () => {
  it('el histórico fecha DD-MM-YYYY, al revés que el resto de la plataforma', () => {
    expect(parseHistoricDay('12-08-2026')).toBe('2026-08-12')
    expect(parseHistoricDay('2026-08-12')).toBeNull()
    expect(parseHistoricDay(null)).toBeNull()
  })

  it('el nombre del canal pierde el tipo pegado al final y los espacios de más', () => {
    expect(cleanChannelName('Acceso Tigalate Bicicletas', 'bicicletas')).toBe('Acceso Tigalate')
    expect(cleanChannelName('Acceso Tigalate ', 'motos')).toBe('Acceso Tigalate')
    // Sin el tipo detrás no se recorta nada: «Los Llanos LP2» se queda entero.
    expect(cleanChannelName('Los Llanos LP2', 'coches')).toBe('Los Llanos LP2')
  })

  it('el nombre del emplazamiento es el prefijo común, cortado en palabra', () => {
    expect(
      commonSiteName([
        'Acceso Sendero Hilera - Pico de las Nieves',
        'Acceso Sendero Hilera - Virgen del Pino',
      ]),
    ).toBe('Acceso Sendero Hilera')
    expect(commonSiteName(['Acceso Tigalate'])).toBe('Acceso Tigalate')
  })
})

describe('lo que no se publica no se cuenta como cero', () => {
  it('sumar una lista con huecos suma solo lo que hay', () => {
    expect(sumPublished([10, null, 5])).toBe(15)
    expect(sumPublished([null, null])).toBeNull()
    expect(sumPublished([])).toBeNull()
  })

  it('el total del día no infla el sentido que la fuente deja vacío', () => {
    const { sites } = build()
    const cruz = sites.find((s) => s.id === 'CC09')!
    // 8697 + 11048 de coches + 452 de peatones. El sentido vacío de los
    // peatones no aporta un 0: aporta nada.
    expect(cruz.todayTotal).toBe(8697 + 11048 + 452)
  })
})

describe('emplazamientos', () => {
  it('agrupa los contadores de un mismo sitio y les pone el nombre común', () => {
    const { sites } = build()
    const hilera = sites.find((s) => s.id === 'CS06')!
    expect(hilera.name).toBe('Acceso Sendero Hilera')
    expect(hilera.kind).toBe('trail')
    // Los dos senderos siguen distinguiéndose dentro, que es de lo que se trata.
    expect(hilera.channels.map((c) => c.name)).toEqual([
      'Acceso Sendero Hilera - Pico de las Nieves',
      'Acceso Sendero Hilera - Virgen del Pino',
    ])
    expect(hilera.todayTotal).toBe(12 + 9 + 4 + 3)
  })

  it('un aforo que publicó ayer y hoy calla sigue en el mapa, y sin cifra', () => {
    const { sites } = build()
    const ledas = sites.find((s) => s.id === 'CC06')!
    expect(ledas.todayTotal).toBeNull()
    expect(ledas.lastPulse).toBeNull()
  })

  it('el pulso es el último intervalo, y no se confunde con el día', () => {
    const { sites } = build()
    const cruz = sites.find((s) => s.id === 'CC09')!
    const coches = cruz.channels.find((c) => c.type === 'coches')!
    // A las 22:16 el pulso daba 3/10 mientras el día llevaba 8697/11048.
    expect(coches.pulse).toEqual({
      at: Date.UTC(2026, 7, 12, 22, 16, 10),
      incoming: 3,
      outgoing: 10,
    })
    expect(cruz.lastPulse).toBe(Date.UTC(2026, 7, 12, 22, 16, 10))
    expect(coches.days.at(-1)).toEqual({ day: '2026-08-12', incoming: 8697, outgoing: 11048 })
  })

  it('sin coordenadas no hay pin: 13 contadores del inventario no las tienen', () => {
    const { sites } = buildSites({
      historic: [
        {
          entityid: 'CX01_coches',
          timeinstant: '12-08-2026',
          name: 'Sin geometría',
          countertype: 'coches',
          numberofincoming: 5,
          numberofoutgoing: 5,
        },
      ],
      today: [],
      todayKey: '2026-08-12',
    })
    expect(sites).toHaveLength(0)
  })
})

describe('el censo dice los tres denominadores, no uno', () => {
  it('separa registrados, con datos en la semana y publicando hoy', () => {
    const { census } = build()
    expect(census.registeredChannels).toBe(6)
    expect(census.registeredSites).toBe(4)
    expect(census.weekChannels).toBe(5)
    expect(census.weekSites).toBe(3)
    expect(census.liveChannels).toBe(1)
    expect(census.liveSites).toBe(1)
  })
})
