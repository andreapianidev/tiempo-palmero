/**
 * La luz sobre el mar.
 *
 * Se comprueban las tres transiciones que se ven en pantalla —día a noche, sol
 * alto a sol bajo, cielo raso a cubierto— y que el dato medido de radiación
 * mande sobre la geometría cuando existe, que es lo que separa este mar de un
 * mar decorativo.
 */

import { describe, expect, it } from 'vitest'
import {
  CALIMA_ONSET,
  FORWARD_SCATTER_STRENGTH,
  NIGHT_OPACITY,
  calimaFactor,
  clearSkyIrradiance,
  clearnessIndex,
  forwardScatterGlow,
  oceanLight,
  seaOpacity,
  surfaceLight,
  waterColors,
} from './light'

const LON = -17.7642
const LAT = 28.6835
const utc = (iso: string) => Date.parse(iso)
/** 13 de agosto de 2026, mediodía y medianoche solares aproximados. */
const NOON = utc('2026-08-13T13:10:00Z')
const NIGHT = utc('2026-08-13T02:00:00Z')

describe('cielo raso', () => {
  it('da valores de manual al mediodía de verano', () => {
    // Con el sol a 75° la irradiancia de cielo raso ronda los 1000 W/m², que es
    // la cifra que usa la industria fotovoltaica como condición estándar.
    const g = clearSkyIrradiance(75)
    expect(g).toBeGreaterThan(900)
    expect(g).toBeLessThan(1100)
  })

  it('cae a nada con el sol en el horizonte', () => {
    expect(clearSkyIrradiance(2)).toBe(0)
    expect(clearSkyIrradiance(-10)).toBe(0)
    expect(clearSkyIrradiance(10)).toBeLessThan(clearSkyIrradiance(30))
  })
})

describe('índice de claridad', () => {
  it('un día despejado se queda cerca del techo del modelo', () => {
    const k = clearnessIndex(950, 75)!
    expect(k).toBeGreaterThan(0.85)
    expect(k).toBeLessThan(1.2)
  })

  it('bajo el mar de nubes cae a un tercio', () => {
    expect(clearnessIndex(300, 75)!).toBeLessThan(0.35)
  })

  it('no se pronuncia sin medida ni con el sol demasiado bajo', () => {
    expect(clearnessIndex(null, 75)).toBeNull()
    expect(clearnessIndex(500, 1)).toBeNull()
  })

  it('recorta el exceso de las nubes rotas en vez de creérselo', () => {
    expect(clearnessIndex(2000, 75)).toBe(1.2)
  })
})

describe('calima', () => {
  it('no hace nada por debajo del umbral', () => {
    expect(calimaFactor(20)).toBe(0)
    expect(calimaFactor(CALIMA_ONSET)).toBe(0)
    expect(calimaFactor(null)).toBe(0)
  })

  it('crece hasta saturar en un episodio fuerte', () => {
    expect(calimaFactor(170)).toBeCloseTo(0.5, 1)
    expect(calimaFactor(500)).toBe(1)
  })

  it('vuelve el cielo dorado y difumina el reflejo', () => {
    const clean = oceanLight(NOON, LON, LAT, { pm10: 10, solarWm2: null })
    const dusty = oceanLight(NOON, LON, LAT, { pm10: 300, solarWm2: null })
    // Menos azul y más rojo: eso es un cielo de calima.
    expect(dusty.zenith[2]).toBeLessThan(clean.zenith[2])
    expect(dusty.zenith[0]).toBeGreaterThan(clean.zenith[0])
    expect(dusty.haze).toBeGreaterThan(clean.haze)
    // Y menos sol directo, aunque el sol siga donde estaba.
    expect(dusty.sunIntensity).toBeLessThan(clean.sunIntensity)
  })
})

describe('el ciclo del día', () => {
  it('de noche no hay sol y el cielo es casi negro', () => {
    const night = oceanLight(NIGHT, LON, LAT)
    expect(night.sunDir[2]).toBeLessThan(0)
    expect(night.sunIntensity).toBe(0)
    expect(night.zenith[2]).toBeLessThan(0.08)
  })

  it('a mediodía el sol está alto y blanco', () => {
    const noon = oceanLight(NOON, LON, LAT)
    expect(noon.sunDir[2]).toBeGreaterThan(0.9)
    expect(noon.sunIntensity).toBe(1)
    // Blanco: los tres canales parecidos.
    expect(Math.abs(noon.sunColor[0] - noon.sunColor[2])).toBeLessThan(0.2)
  })

  it('al atardecer el sol enrojece antes de apagarse', () => {
    const dusk = oceanLight(utc('2026-08-13T19:40:00Z'), LON, LAT)
    expect(dusk.sunColor[0] - dusk.sunColor[2]).toBeGreaterThan(0.3)
    expect(dusk.sunIntensity).toBeGreaterThan(0)
    expect(dusk.sunIntensity).toBeLessThan(1)
  })

  it('la luna solo alumbra de noche y según su fase', () => {
    // 1 de febrero de 2026 a las 22:00: luna llena y alta (ver `sun.test.ts`).
    const full = oceanLight(utc('2026-02-01T22:00:00Z'), LON, LAT)
    expect(full.moonIntensity).toBeGreaterThan(0.8)
    // A mediodía la luna no cuenta aunque esté en el cielo.
    expect(oceanLight(NOON, LON, LAT).moonIntensity).toBe(0)
  })
})

describe('la radiación medida manda', () => {
  it('un mediodía cubierto apaga el sol sin mover el sol', () => {
    const clear = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: 950 })
    const overcast = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: 180 })
    expect(overcast.sunIntensity).toBeLessThan(clear.sunIntensity * 0.5)
    expect(overcast.haze).toBeGreaterThan(clear.haze)
    expect(overcast.sunDir).toEqual(clear.sunDir)
  })

  it('sin medida se comporta como antes de tenerla', () => {
    const blind = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: null })
    const clear = oceanLight(NOON, LON, LAT, { pm10: null, solarWm2: 950 })
    expect(blind.clearness).toBeNull()
    expect(blind.sunIntensity).toBeCloseTo(clear.sunIntensity, 1)
  })
})

describe('el color del agua', () => {
  /** Luminancia Rec. 709: es la que decide qué se ve más claro en pantalla. */
  const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  /** La espuma como acaba en pantalla: su albedo por la luz que le llega. */
  const foamOnScreen = (at: number, inputs = { pm10: null, solarWm2: null }) => {
    const light = oceanLight(at, LON, LAT, inputs)
    const { foam } = waterColors(light)
    const l = surfaceLight(light)
    return [foam[0] * l[0], foam[1] * l[1], foam[2] * l[2]]
  }

  it('la espuma que sale de aquí es un albedo, no un color de pantalla', () => {
    // El mismo número de día y de noche: lo que cambia es la luz, no la espuma.
    expect(waterColors(oceanLight(NOON, LON, LAT)).foam).toEqual(
      waterColors(oceanLight(NIGHT, LON, LAT)).foam,
    )
  })

  it('la claridad va de la noche cerrada al mediodía', () => {
    expect(waterColors(oceanLight(NIGHT, LON, LAT)).lit).toBeCloseTo(0.22, 3)
    expect(waterColors(oceanLight(NOON, LON, LAT)).lit).toBeCloseTo(1, 3)
  })

  /**
   * EL FALLO QUE ESTA PRUEBA CAZA, y el que no puede volver a colarse.
   *
   * Con la espuma apagada dos veces —una en `waterColors` y otra en el
   * sombreador— la rompiente de una noche sin luna marcaba 0,017 de luminancia
   * y el agua de debajo 0,027: la espuma salía un 35 % MÁS OSCURA que su agua y
   * se dibujaba como una mancha negra pegada a la costa. Físicamente no puede
   * pasar: el aire atrapado en la espuma devuelve unas diez veces más luz que
   * el agua, esté iluminada por el sol, por la luna o por el resplandor del
   * cielo.
   *
   * Y la prueba mira las dos orillas: que la rompiente destaque a las cuatro de
   * la madrugada no puede costar que a mediodía salga reventada. El techo son
   * 0,95 —blanco de pantalla sin llegar a saturar— y hoy el mediodía de agosto
   * más claro se queda en 0,66.
   */
  it('la espuma siempre es más clara que el agua, a cualquier hora', () => {
    for (let h = 0; h < 24; h++) {
      const at = utc(`2026-08-13T${String(h).padStart(2, '0')}:00:00Z`)
      const agua = lum(waterColors(oceanLight(at, LON, LAT)).deep)
      const espuma = lum(foamOnScreen(at))
      expect(espuma, `a las ${h}:00 UTC`).toBeGreaterThan(agua * 2)
      expect(espuma, `a las ${h}:00 UTC`).toBeLessThan(0.95)
    }
  })

  it('de noche cerrada la rompiente se ve, y apenas', () => {
    // Ni negra ni blanca: un gris azulado que en pantalla se lee como una
    // línea de espuma tenue, tres veces el agua que la rodea.
    const espuma = lum(foamOnScreen(NIGHT))
    const agua = lum(waterColors(oceanLight(NIGHT, LON, LAT)).deep)
    expect(espuma).toBeCloseTo(0.079, 2)
    expect(espuma / agua).toBeGreaterThan(2.5)
    expect(espuma / agua).toBeLessThan(4)
  })

  it('a mediodía la espuma se queda donde estaba antes de separar el albedo', () => {
    // La referencia son los tres números que daba la versión anterior con el
    // sol a 70°, cielo raso y sin calima: 0,618 / 0,678 / 0,772.
    const [r, g, b] = foamOnScreen(NOON)
    expect(r).toBeCloseTo(0.618, 1)
    expect(g).toBeCloseTo(0.678, 1)
    expect(b).toBeCloseTo(0.772, 1)
  })
})

/**
 * EL BRILLO SEGÚN HACIA DÓNDE SE MIRA.
 *
 * El agua no es una lámina: mirando hacia el sol la luz viaja por la columna
 * y sale hacia la cámara, y el bajío se enciende; dándole la espalda, no
 * cambia nada. Las dos orillas que importan: que hacia el sol SE NOTE —si no,
 * no existe el efecto— y que de espaldas, de noche o en mar abierto NO TOQUE
 * nada —si no, se está pintando un brillo que el agua de verdad no tiene.
 */
describe('el brillo hacia el sol', () => {
  /** Luminancia Rec. 709, la misma cuenta que el resto del fichero. */
  const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

  it('hacia el sol el bajío se enciende, y sin reventar', () => {
    const light = oceanLight(NOON, LON, LAT)
    const { shallow } = waterColors(light)
    const boost = forwardScatterGlow(1, 1, light.sunIntensity)
    expect(boost).toBe(FORWARD_SCATTER_STRENGTH)
    const lumBoost = boost * lum(shallow)
    // Medido contra el color del agua de aquí: la luminancia del bajío sube
    // un 40 %, que se nota —el suelo es la mitad de eso— y no dobla el agua.
    expect(lumBoost / lum(shallow)).toBeCloseTo(0.4, 1)
    expect(lumBoost).toBeGreaterThan(0.05)
    expect(lumBoost).toBeLessThan(0.6 * lum(shallow))
  })

  it('de espaldas al sol no toca nada, ni a plomo, ni de noche', () => {
    // La orilla que no se ve: el efecto no puede existir donde el agua de
    // verdad no lo tiene. Cero en los tres casos.
    expect(forwardScatterGlow(0, 1, 1)).toBe(0)
    expect(forwardScatterGlow(-0.8, 1, 1)).toBe(0)
    expect(forwardScatterGlow(1, 1, 0)).toBe(0)
  })

  it('el exponente afila: a medio camino queda la quinta parte', () => {
    expect(forwardScatterGlow(0.5, 1, 1)).toBeCloseTo(FORWARD_SCATTER_STRENGTH * Math.pow(0.5, 2.5), 3)
    expect(forwardScatterGlow(0.5, 1, 1)).toBeLessThan(forwardScatterGlow(1, 1, 1) * 0.2)
  })

  it('en mar abierto la claridad lo deja en una décima', () => {
    // A 60 m de fondo la claridad es 0,102: el brillo del bajío no puede
    // saltarse al azul marino por la puerta de atrás.
    expect(forwardScatterGlow(1, 0.1, 1)).toBeLessThan(0.05)
    expect(forwardScatterGlow(1, 0.1, 1)).toBeLessThan(forwardScatterGlow(1, 1, 1) * 0.15)
  })

  it('al atardecer se apaga con el sol, que es quien lo enciende', () => {
    const dusk = oceanLight(utc('2026-08-13T19:40:00Z'), LON, LAT)
    const noon = oceanLight(NOON, LON, LAT)
    expect(dusk.sunIntensity).toBeGreaterThan(0)
    expect(forwardScatterGlow(1, 1, dusk.sunIntensity)).toBeLessThan(
      forwardScatterGlow(1, 1, noon.sunIntensity),
    )
  })
})

/**
 * CUÁNTO TAPA EL AGUA AL MAPA.
 *
 * El fallo que caza: de noche el agua se pintaba opaca —luminancia 0,027, lisa,
 * sin destello— encima de una ortofoto de mediodía cuyo mar mide 0,053 de
 * mediana, 0,130 de percentil 90 y llega a 0,92 en el reflejo del sol (medido
 * el 14 de agosto de 2026 contra el servicio de GRAFCAN, frente a Tijarafe).
 * No es que el agua fuera más oscura: es que se llevaba por delante todo el
 * rango alto y el mar se veía como una plancha.
 *
 * Las dos orillas: dejar ver el mapa de noche no puede costar que a mediodía el
 * agua deje de ser agua y se vea la foto por debajo.
 */
describe('lo que el agua tapa', () => {
  it('de día es opaca', () => {
    expect(seaOpacity(waterColors(oceanLight(NOON, LON, LAT)).lit)).toBeCloseTo(1, 6)
  })

  it('de noche deja pasar algo más de la mitad del mapa', () => {
    const lit = waterColors(oceanLight(NIGHT, LON, LAT)).lit
    expect(seaOpacity(lit)).toBeCloseTo(NIGHT_OPACITY, 6)
    // Con la mediana del mar de la ortofoto por debajo, la composición sube de
    // 0,027 a 0,041: sigue siendo de noche, pero el mapa se lee.
    const compuesto = NIGHT_OPACITY * 0.027 + (1 - NIGHT_OPACITY) * 0.053
    expect(compuesto).toBeGreaterThan(0.027)
    expect(compuesto).toBeLessThan(0.053)
  })

  it('y solo si debajo hay algo que enseñar', () => {
    // Sobre el fondo de relieve el mar es una tinta lisa de 0,003: destaparlo
    // no destapa nada, solo apaga el agua. Medido, la composición nocturna
    // caía de 0,027 a 0,014 —el mar quedaba la mitad de oscuro de lo que el
    // propio motor había calculado—, y por eso `reveal` existe.
    const lit = waterColors(oceanLight(NIGHT, LON, LAT)).lit
    expect(seaOpacity(lit, 0, 0)).toBe(1)
    expect(NIGHT_OPACITY * 0.027 + (1 - NIGHT_OPACITY) * 0.003).toBeLessThan(0.027)
  })

  it('pero la espuma tapa a cualquier hora', () => {
    const lit = waterColors(oceanLight(NIGHT, LON, LAT)).lit
    expect(seaOpacity(lit, 1)).toBeCloseTo(1, 6)
    expect(seaOpacity(lit, 0.5)).toBeGreaterThan(seaOpacity(lit, 0))
  })

  it('el amanecer no da un salto', () => {
    // Sube con el sol y no se sale del rango en ninguna hora del día: el mar no
    // puede cambiar de opacidad de golpe mientras alguien está mirando el mapa.
    const at = (h: number) =>
      seaOpacity(
        waterColors(oceanLight(utc(`2026-08-13T${String(h).padStart(2, '0')}:00:00Z`), LON, LAT))
          .lit,
      )
    for (let h = 0; h < 24; h++) {
      expect(at(h), `a las ${h}:00 UTC`).toBeGreaterThanOrEqual(NIGHT_OPACITY - 1e-9)
      expect(at(h), `a las ${h}:00 UTC`).toBeLessThanOrEqual(1 + 1e-9)
    }
    // Amanece hacia las 07:00 UTC: a esa hora ya tapa más que de noche y menos
    // que a mediodía.
    expect(at(7)).toBeGreaterThan(NIGHT_OPACITY)
    expect(at(7)).toBeLessThan(at(13))
  })
})
