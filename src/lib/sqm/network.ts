/**
 * La red de fotómetros del Cabildo: 59 registrados, muchos menos vivos.
 *
 * QUÉ PUBLICA. `skyobservation_lastdata` da, por estación, el brillo del fondo
 * de cielo en `mag/arcsec²` —más alto es más oscuro—, su desviación, la
 * temperatura del cielo por infrarrojo, la del aire y una cadena de nubosidad.
 * Es la medida que convierte esta función en una función de esta aplicación: el
 * número de estrellas que se dibujan sale de aquí y no de un ajuste.
 *
 * EL DENOMINADOR HONESTO. De las **59 registradas**, 15 aparecen en el archivo
 * del último mes y 14 llegan a publicar alguna lectura nocturna utilizable;
 * cuarenta y cuatro llevan más de un mes calladas y alguna no publica desde
 * 2023. El panel dice «7 de 59» cuando siete están midiendo, no «59».
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LOS TRES VALORES QUE NO SON MEDIDAS, y cómo se distinguen sin adivinar.
 *
 * Medido sobre una LUNACIÓN ENTERA —203 918 lecturas de 15 estaciones entre el
 * 21 de julio y el 19 de agosto de 2026, `scripts/checks/sqm-archivo.ts`—. Hay
 * tres formas distintas de «no hay dato» disfrazadas de número:
 *
 *  1. **`−1000`**, el centinela clásico.
 *  2. **`0` exacto**, que es lo que ponen los TESS-W de día: 101 923 lecturas.
 *  3. **El suelo del hardware «Smart»**, entre 9,02 y 9,99, que es la
 *     saturación del sensor: 14 889 lecturas. Éste es el peligroso, porque
 *     parece una medida —tiene decimales, tiene desviación, y la estación de al
 *     lado marca lo mismo—.
 *
 * Entre las tres, 116 812 artefactos contra 87 106 medidas reales: **más de la
 * mitad de lo que publica la red no es una medida.**
 *
 * EL CRITERIO PRINCIPAL NO ES EL VALOR SINO LA FÍSICA: un fotómetro de cielo
 * nocturno no mide nada mientras el sol esté arriba. Descartando toda lectura
 * tomada con el sol por encima de −6° —el final del crepúsculo civil, calculado
 * con `sun.ts` para las coordenadas de cada estación— se van 116 714 de los
 * 116 812 artefactos: el 99,92 %.
 *
 * PERO NO LOS 116 812, Y ESO CORRIGE LO QUE AQUÍ PONÍA. Sobre dos días de
 * archivo el criterio solar parecía llevárselos «sin excepción». Sobre la
 * lunación entera, **98 se le escapan**, y no son un caso raro sino una avería
 * con nombre:
 *
 * | Estación | Cuántas | Qué publica | Con el sol hasta |
 * |---|---:|---|---:|
 * | `stars403` Iniciativa AstroNorte | 68 | cero exacto | −27,4° |
 * | `LPL2_068` C. V. de La Caldera | 19 | suelo 9,5 | −46,2° |
 * | `LPL2_023` C. V. del Roque | 10 | suelo 9,5 | −41,5° |
 * | `LPL2_016` Casa Rural El Jaral | 1 | suelo 9,5 | −26,8° |
 *
 * O sea que el suelo del hardware NO es solo saturación de día: también es lo
 * que el sensor emite cuando falla de noche. Por eso `MIN_PLAUSIBLE_SQM` no es
 * un cinturón de repuesto —como decía este comentario— sino el único filtro que
 * ve esas 98. Con los dos juntos: **116 812 de 116 812, cero fugas.**
 *
 * Y LAS DOS ORILLAS, que es lo que decide si el umbral sirve:
 *
 * | | Lecturas |
 * |---|---:|
 * | Medidas reales de noche (sol < −6°) | 81 365 |
 * | ...que el umbral de valor tira | **0** |
 * | Artefactos que sobreviven a los dos filtros | **0** |
 *
 * La medida real más brillante de toda la lunación con el sol puesto son
 * **12,43**; el artefacto más oscuro, **9,99**. Entre los dos hay 2,44
 * magnitudes de nada, y 11,0 cae a 1,01 del artefacto y a 1,43 de la medida. Un
 * umbral en 9,5 se habría comido la mitad del suelo del hardware; uno en 13
 * habría tirado lecturas buenas de crepúsculo.
 *
 * LO QUE EL CRITERIO SOLAR SÍ SE LLEVA, dicho con precisión. «No se lleva ni una
 * lectura buena» tampoco era exacto: descarta 2380 lecturas de valor plausible
 * tomadas con el sol por encima de −6°. Unas 1700 son medidas reales de
 * crepúsculo civil de dos estaciones urbanas —`stars4`, el colegio de Los
 * Llanos, con el sol hasta −2,3° y valores de 11,0 a 15,0— y el resto son
 * imposibles: `stars394` publica 16,9 con el sol a +24,7°. Las primeras se
 * pierden y da igual, porque con el sol a −3° no hay ni una estrella que contar.
 * La frase correcta es «no se lleva ninguna lectura que sirva para esto».
 */

import { num, parseLocation, parseTimeinstant, type CdaRow } from '../cabildo'
import { sunPosition } from '../sun'

/** Centinela explícito del origen. */
const SENTINEL = -1000
/**
 * Suelo de valor: 1,43 mag por debajo de la medida real más brillante de la
 * lunación (12,43) y 1,01 por encima del artefacto de hardware más alto (9,99).
 *
 * NO ES REDUNDANTE con el criterio solar, aunque este comentario lo dijera. Es
 * el único filtro que ve las 98 lecturas averiadas que se publican de noche —el
 * cero de `stars403` con el sol a −27°, el suelo 9,5 de tres «Smart» con el sol
 * a −46°—. Ver la tabla de la cabecera.
 */
export const MIN_PLAUSIBLE_SQM = 11
/**
 * Altura del sol por debajo de la cual un fotómetro mide de verdad. −6° es el
 * final del crepúsculo civil, y se lleva el 99,92 % de los artefactos del
 * archivo. Lo que deja pasar lo para `MIN_PLAUSIBLE_SQM`; lo que se lleva de más
 * son crepúsculos reales que no sirven para contar estrellas. Ver la cabecera.
 */
export const SUN_CEILING_DEG = -6
/**
 * Edad máxima de una lectura para que se considere «de ahora», ms.
 *
 * Dos horas. Las estaciones «Smart» publican cada 15 min a 2 h según la
 * estación y las TESS cada 32 s: dos horas deja pasar a las lentas sin llegar a
 * presentar como actual un cielo de anoche. Por encima de eso el panel enseña la
 * hora de la lectura y la cuenta como vieja, no la esconde.
 */
export const MAX_AGE_MS = 2 * 60 * 60 * 1000

export interface SqmStation {
  id: string
  name: string
  lon: number
  lat: number
  /** Brillo del fondo de cielo, mag/arcsec². Más alto es más oscuro. */
  sky: number
  /** Desviación que publica el propio instrumento, cuando la trae. */
  sigma: number | null
  /** Temperatura del cielo por infrarrojo, °C. Delata nubes: si el cielo está
   *  cubierto, el sensor ve la base de la nube y no el espacio. */
  skyTemperatureC: number | null
  /** Instante de la lectura, epoch ms UTC. */
  observedAt: number
  /** Altura del sol en la estación en el instante de la lectura, grados. */
  sunElevationDeg: number
}

/** Por qué se cayó una estación. Se cuenta y se enseña, no se esconde. */
export type SqmReject =
  | 'sin-coordenadas'
  | 'sin-hora'
  | 'sin-valor'
  | 'centinela'
  | 'sol-arriba'
  | 'valor-imposible'
  | 'vieja'

export interface SqmNetwork {
  fetchedAt: number
  /** Las que pasan todos los filtros, de la más oscura a la más clara. */
  usable: SqmStation[]
  /** Las que miden pero cuya lectura ya no es de ahora. */
  stale: SqmStation[]
  /** Cuántas se cayeron por cada motivo. La suma más las buenas son las 59. */
  rejected: Record<SqmReject, number>
  /** Total de filas que publicó el origen. */
  registered: number
}

const EMPTY_REJECTS = (): Record<SqmReject, number> => ({
  'sin-coordenadas': 0,
  'sin-hora': 0,
  'sin-valor': 0,
  centinela: 0,
  'sol-arriba': 0,
  'valor-imposible': 0,
  vieja: 0,
})

/**
 * Filtra la respuesta cruda a una red utilizable.
 *
 * El orden de los descartes no es indiferente: el centinela se comprueba antes
 * que el sol porque una estación que publica −1000 de noche está averiada y no
 * «midiendo de día», y esa distinción es la que hace que el censo del panel
 * signifique algo.
 */
export function decodeSqmNetwork(rows: CdaRow[], fetchedAt: number): SqmNetwork {
  const rejected = EMPTY_REJECTS()
  const usable: SqmStation[] = []
  const stale: SqmStation[] = []

  for (const row of rows) {
    const coords = parseLocation(row.location)
    if (!coords) {
      rejected['sin-coordenadas']++
      continue
    }
    const observedAt = parseTimeinstant(row.timeinstant)
    if (observedAt === null) {
      rejected['sin-hora']++
      continue
    }
    const sky = num(row.skymagnitude)
    if (sky === null) {
      rejected['sin-valor']++
      continue
    }
    if (sky === SENTINEL) {
      rejected.centinela++
      continue
    }
    const [lon, lat] = coords
    const sunElevationDeg = sunPosition(observedAt, lon, lat).elevationDeg
    if (sunElevationDeg > SUN_CEILING_DEG) {
      rejected['sol-arriba']++
      continue
    }
    if (sky < MIN_PLAUSIBLE_SQM) {
      rejected['valor-imposible']++
      continue
    }

    const station: SqmStation = {
      id: String(row.entityid ?? ''),
      name: String(row.name ?? row.entityid ?? '—'),
      lon,
      lat,
      sky,
      sigma: num(row.sigmamagnitude),
      skyTemperatureC: num(row.skytemperature),
      observedAt,
      sunElevationDeg,
    }
    if (fetchedAt - observedAt > MAX_AGE_MS) {
      rejected.vieja++
      stale.push(station)
    } else usable.push(station)
  }

  usable.sort((a, b) => b.sky - a.sky)
  stale.sort((a, b) => b.observedAt - a.observedAt)
  return { fetchedAt, usable, stale, rejected, registered: rows.length }
}

/**
 * Detecta el sensor congelado: el que sigue publicando hora nueva con el valor
 * de siempre.
 *
 * NO ES UN CASO HIPOTÉTICO. El 17 y 18 de agosto de 2026 el fotómetro del
 * Centro de Visitantes del Roque (`LPL2_023`) publicó cuatro veces —05:32,
 * 13:15, 07:31 y 14:14— exactamente la misma terna: 21,126 de brillo, −10,09 de
 * temperatura de cielo y «Despejado». Un cielo real no repite tres decimales
 * dos días seguidos, y menos a mediodía. La hora avanzaba; la medida no.
 *
 * Tres repeticiones y no dos: dos lecturas idénticas seguidas son posibles
 * cuando la estación republica su último dato antes de tener uno nuevo, y
 * descartarla por eso tiraría una estación sana. Tres ya no.
 */
export const FROZEN_REPEATS = 3

export interface FrozenMemory {
  sky: number
  observedAt: number
  repeats: number
}

export function updateFrozen(
  previous: FrozenMemory | undefined,
  station: SqmStation,
): FrozenMemory {
  if (!previous || previous.sky !== station.sky) {
    return { sky: station.sky, observedAt: station.observedAt, repeats: 0 }
  }
  // El valor es el mismo. Solo cuenta como repetición si la HORA ha avanzado:
  // volver a leer la misma fila porque todavía no hay una nueva no es un fallo
  // del sensor, es la cadencia del origen.
  if (station.observedAt === previous.observedAt) return previous
  return {
    sky: station.sky,
    observedAt: station.observedAt,
    repeats: previous.repeats + 1,
  }
}

export function isFrozen(memory: FrozenMemory | undefined): boolean {
  return (memory?.repeats ?? 0) >= FROZEN_REPEATS
}
